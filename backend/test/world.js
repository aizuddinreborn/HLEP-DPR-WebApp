'use strict';
/**
 * A simulated world for tests and the local preview server:
 *   · the Telegram bot (the user's real Code.gs, unchanged) in one Apps Script context
 *   · the web backend (dist/WebApp.gs) in a SECOND context: its own Script properties, cache and lock,
 *     like a separate Apps Script project, but the SAME Google Sheet and Drive
 *   · any number of further web contexts (world.newWeb), e.g. the BETA project with its sandbox copy.
 * Uses the bot's dev-harness mocks (HARNESS=/path/to/harness, default: the scratchpad unpack).
 *
 * Added on top of the harness, for the web contexts only:
 *   · SpreadsheetApp.create and Sheet.copyTo / setName (the beta sandbox copies the Sheet tab by tab)
 *   · Drive: root folders by name, files for created spreadsheets (moveTo, setName)
 *   · AI with tools: world.chatModel(body, model) answers Gemini requests that declare tools,
 *     world.claude.responder(body, headers) answers the Anthropic Messages API.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HARNESS = process.env.HARNESS || '/tmp/claude-0/-home-user/6365165a-a28c-5a36-abf9-834ec0218f72/scratchpad/ws/harness';
const BOT_CODE = process.env.BOT_CODE || '/home/claude/hlep-dpr-bot/Code.gs';
const WEB_CODE = path.join(__dirname, '..', 'dist', 'WebApp.gs');
const BOT_URL = 'https://script.google.com/macros/s/AKfycbFAKE/exec';
const { makeEnv } = require(path.join(HARNESS, 'mocks'));

function separateServices(clock) {
  const props = {};
  const cache = {};
  let lockHeld = false;
  return {
    props, cache, lockState: () => lockHeld,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { if (typeof v !== 'string') throw new Error('setProperty value must be string: ' + k); if (v.length > 9000) throw new Error('Property too large: ' + k); props[k] = v; },
        deleteProperty: (k) => { delete props[k]; },
        getProperties: () => Object.assign({}, props)
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => { const e = cache[k]; if (!e) return null; if (e.exp < clock.get()) { delete cache[k]; return null; } return e.v; },
        put: (k, v, s) => {
          if (typeof v !== 'string') throw new Error('cache value must be string');
          if ((s || 600) > 21600) throw new Error('cache ttl too long');
          if (v.length > 100 * 1024) throw new Error('cache value over 100 KB: ' + k);
          cache[k] = { v, exp: clock.get() + (s || 600) * 1000 };
        },
        remove: (k) => { delete cache[k]; },
        removeAll: (ks) => { ks.forEach((k) => delete cache[k]); }
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { if (lockHeld) throw new Error('NESTED LOCK (web): waitLock while already held'); lockHeld = true; },
        tryLock: () => { if (lockHeld) return false; lockHeld = true; return true; },
        releaseLock: () => { lockHeld = false; }
      })
    }
  };
}

function iter(list) { let i = 0; list = list.filter(Boolean); return { hasNext: () => i < list.length, next: () => list[i++] }; }

function httpResp(code, obj, headers) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return { getResponseCode: () => code, getContentText: () => text, getHeaders: () => Object.assign({}, headers || {}) };
}

function makeWorld(opts) {
  opts = opts || {};
  const env = makeEnv(opts);
  const failures = [];

  // ---------- the bot ----------
  const bot = env.ctx;
  vm.createContext(bot);
  vm.runInContext(fs.readFileSync(BOT_CODE, 'utf8'), bot, { filename: 'Code.gs' });
  const botExec = (fn) => {
    vm.runInContext('SS_MEMO = null; HEADER_MEMO = {}; Object.keys(BAD_FONTS).forEach(function (k) { delete BAD_FONTS[k]; });', bot);
    const r = fn();
    if (env.lockState()) failures.push('bot lock still held');
    return r;
  };
  let upd = 7000;
  const people = { '111': { id: 111, first_name: 'Aizuddin', username: 'aizuddin' }, '222': { id: 222, first_name: 'Ali', last_name: 'Firdaus', username: 'alifirdaus' } };
  const botPost = (update) => { update.update_id = update.update_id || upd++; return botExec(() => bot.doPost({ parameter: { key: env.props.WEBHOOK_SECRET }, postData: { contents: JSON.stringify(update) } })); };
  const msg = (uid, extra) => ({ message: Object.assign({ message_id: Math.floor(Math.random() * 1e6), from: people[uid], chat: { id: Number(uid), type: 'private' }, date: Math.floor(env.clock.get() / 1000) }, extra) });
  const say = (uid, text) => botPost(msg(uid, { text }));
  const msgsTo = (uid) => Object.values(env.tg.messages).filter((m) => m.chat === String(uid)).sort((a, b) => a.id - b.id);
  const last = (uid) => { const l = msgsTo(uid); return l[l.length - 1]; };
  const tap = (uid, data) => {
    for (const m of msgsTo(uid).reverse()) for (const row of m.kb) for (const b of row) {
      if (b.callback_data === data || (data instanceof RegExp && data.test(b.callback_data))) {
        botPost({ callback_query: { id: 'cb' + upd, from: people[uid], message: { message_id: m.id, chat: { id: Number(uid), type: 'private' } }, data: b.callback_data } });
        return true;
      }
    }
    failures.push('no button ' + data + ' for ' + uid);
    return false;
  };

  // deterministic fake Gemini (same idea as the bot harness)
  env.gemini.responder = opts.responder || ((body) => {
    const parts = body.contents[0].parts;
    const txt = parts.filter((p) => p.text).map((p) => p.text).join('\n');
    if (/single word OK/.test(txt)) return 'OK';
    if (/^Lines from the electrical/.test(txt)) return 'EPS cable pulling 60 m completed; Unit 4 NDE bottom bearing removed';
    if (/Does the NEW line report the SAME/.test(txt)) return env.gemini.same !== undefined ? env.gemini.same : '{"same": 0}';
    const note = (txt.match(/Note: ([\s\S]*)$/) || [])[1] || '';
    const P = {
      'tarik kabel 3C dari SST ke panel LV, 60m siap': 'Cable pulling of 3C power cable from SST to LV panel is ongoing (60 m completed).',
      'pasang rak bateri dalam bilik bateri': 'Installed battery racks inside the battery room.',
      'sambung kabel di panel LV': 'Continue cable termination at the LV panel.'
    };
    return P[note.trim()] || ('Polished: ' + note.trim());
  });

  // bot setup, as the user did it: Setup → Connect → /admin → technician approved
  env.tg.token = '123456:ABCDEF';
  env.uiQueue.push('123456:ABCDEF', 'AIzaFAKEKEY');
  botExec(() => bot.menuSetup());
  env.uiQueue.push(BOT_URL);
  botExec(() => bot.menuConnect());
  const adminCode = env.sheets.find((s) => s.name === 'Settings').data.find((r) => r[0] === 'ADMIN_CODE')[1];
  say('111', '/start');
  say('111', '/admin ' + adminCode);
  say('222', '/start');
  say('222', 'Ali Firdaus');
  tap('111', 'ap:222:tech');

  env.spreadsheet.getName = () => 'HLEP DPR Bot (Sheet)';     // real Spreadsheet API method the mock lacks

  // ---------- more spreadsheets (the beta sandbox makes one) ----------
  const SheetClass = env.sheets[0].constructor;
  if (!SheetClass.prototype.copyTo) {
    SheetClass.prototype.copyTo = function (dest) { const s = dest.insertSheet('Copy of ' + this.name); s.data = this.data.map((r) => r.slice()); return s; };
    SheetClass.prototype.setName = function (n) { this.name = n; return this; };
  }
  const books = {};
  let bookN = 0;
  const mkBook = (name) => {
    const id = 'COPY' + String(++bookN).padStart(3, '0') + '_1aBcD2eFgH3iJkL4mNoPqRsT';
    const sheets = [new SheetClass('Sheet1')];
    const st = { name, tz: 'Etc/GMT', parent: 'ROOT' };
    const ss = {
      _sheets: sheets, _st: st,
      getId: () => id, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id + '/edit', getName: () => st.name,
      getSheetByName: (n) => sheets.find((s) => s.name === n) || null, getSheets: () => sheets.slice(),
      insertSheet: (n, i) => {
        if (sheets.some((s) => s.name === n)) throw new Error('A sheet with the name "' + n + '" already exists. Please enter another name.');
        const s = new SheetClass(n); sheets.splice(i === undefined ? sheets.length : i, 0, s); return s;
      },
      deleteSheet: (s) => { const i = sheets.indexOf(s); if (i >= 0) sheets.splice(i, 1); },
      setSpreadsheetTimeZone: (z) => { st.tz = z; }, getSpreadsheetTimeZone: () => st.tz
    };
    books[id] = ss;
    return ss;
  };

  // ---------- AI fakes shared by every web context ----------
  const chat = { calls: [] };                 // Gemini requests that declared tools
  const claude = { calls: [], responder: null };

  // ---------- a web backend: a separate Apps Script project ----------
  const patchFolder = (f) => {
    if (f && !f.getParents) f.getParents = () => iter([f._parent && env.folders[f._parent] ? patchFolder(env.folders[f._parent]) : null]);
    return f;
  };
  const patchFile = (f) => {
    if (f && !f.getParents) {
      f.getParents = () => iter([env.folders[f._parent] ? patchFolder(env.folders[f._parent]) : null]);
      f.getThumbnail = () => { const b = f.getBlob(); return /^image\//.test(b.getContentType()) ? env.ctx.Utilities.newBlob(Buffer.from('THUMB-' + f._id), 'image/png', 'thumb.png') : null; };
    }
    return f;
  };
  const botCalls = [];
  const newWeb = (seed) => {
    const sep = separateServices(env.clock);
    const DriveApp = {
      createFolder: (n) => patchFolder(env.ctx.DriveApp.createFolder(n)),
      getFolderById: (id) => patchFolder(env.ctx.DriveApp.getFolderById(id)),
      getFoldersByName: (n) => iter(Object.values(env.folders).filter((f) => f._parent === 'ROOT' && f._name === n && !f._trashed).map(patchFolder)),
      getFileById: (id) => {
        if (id === 'SHEET123') return { getId: () => id, getParents: () => iter([patchFolder(env.folders[env.props.ROOT_FOLDER_ID])]) };
        if (books[id]) {
          const b = books[id];
          return {
            getId: () => id, getName: () => b._st.name, setName: (n) => { b._st.name = n; }, getUrl: () => b.getUrl(), isTrashed: () => false,
            moveTo: (folder) => { b._st.parent = folder.getId(); },
            getParents: () => iter([env.folders[b._st.parent] ? patchFolder(env.folders[b._st.parent]) : null])
          };
        }
        return patchFile(env.ctx.DriveApp.getFileById(id));
      }
    };
    const SpreadsheetApp = Object.assign({}, env.ctx.SpreadsheetApp, {
      openById: (id) => books[id] || env.ctx.SpreadsheetApp.openById(id),
      create: (name) => mkBook(name)
    });
    const UrlFetchApp = {
      fetch: (url, params) => {
        params = params || {};
        if (url.indexOf(BOT_URL) === 0) {
          const key = decodeURIComponent((url.match(/[?&]key=([^&]+)/) || [])[1] || '');
          botCalls.push(JSON.parse(params.payload));
          if (world.botTimeout) { botExec(() => bot.doPost({ parameter: { key }, postData: { contents: params.payload } })); throw new Error('Timeout: request took too long'); }
          const out = botExec(() => bot.doPost({ parameter: { key }, postData: { contents: params.payload } }));
          return { getResponseCode: () => 200, getContentText: () => (out && out.content) || '' };
        }
        if (/^https:\/\/api\.anthropic\.com\/v1\/messages$/.test(url)) {
          const body = JSON.parse(params.payload);
          claude.calls.push({ body, headers: params.headers || {} });
          if (!(params.headers || {})['x-api-key']) return httpResp(401, { type: 'error', error: { type: 'authentication_error', message: 'x-api-key header is required' } });
          const r = claude.responder ? claude.responder(body, params.headers || {}) : { content: [{ type: 'text', text: 'OK' }], stop_reason: 'end_turn' };
          if (r && r.status) return httpResp(r.status, { type: 'error', error: { type: r.type || 'api_error', message: r.msg || '' } });
          return httpResp(200, Object.assign({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, usage: { input_tokens: 1, output_tokens: 1 } }, r));
        }
        const gm = url.match(/^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/([^:]+):generateContent$/);
        if (gm && world.chatModel) {
          const body = JSON.parse(params.payload);
          if (body.tools) {
            if (!(params.headers || {})['x-goog-api-key']) return httpResp(403, { error: { message: 'API key missing' } });
            chat.calls.push({ model: gm[1], body });
            const r = world.chatModel(body, gm[1]);
            if (r && r.status) return httpResp(r.status, { error: { code: r.status, message: r.msg || '' } });
            if (r && r.raw) return httpResp(200, r.raw);
            return httpResp(200, { candidates: [{ content: { role: 'model', parts: (r && r.parts) || [] }, finishReason: (r && r.finish) || 'STOP' }] });
          }
        }
        return env.ctx.UrlFetchApp.fetch(url, params);
      }
    };
    const ContentService = {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput: (s) => { const o = { kind: 'text', content: s, mime: 'TEXT', setMimeType: (m) => { o.mime = m; return o; } }; return o; }
    };
    const web = Object.assign({}, env.ctx, {
      PropertiesService: sep.PropertiesService, CacheService: sep.CacheService, LockService: sep.LockService,
      DriveApp, SpreadsheetApp, UrlFetchApp, ContentService
    });
    vm.createContext(web);
    vm.runInContext(fs.readFileSync(WEB_CODE, 'utf8'), web, { filename: 'WebApp.gs' });
    const webExec = (fn) => {
      vm.runInContext('SS_MEMO = null; HEADER_MEMO = {}; SS_TZ_MEMO = "";', web);
      const r = fn();
      if (sep.lockState()) failures.push('web lock still held');
      return r;
    };
    Object.assign(sep.props, seed || {});
    const api = (a, body) => {
      const out = webExec(() => web.doPost({ postData: { contents: JSON.stringify(Object.assign({ a }, body || {})) } }));
      if (out.mime !== 'JSON') failures.push('reply not JSON for ' + a);
      return JSON.parse(out.content);
    };
    return { web, sep, webExec, api };
  };

  const live = newWeb({
    SHEET_URL: 'https://docs.google.com/spreadsheets/d/SHEET123/edit#gid=0',
    GEMINI_API_KEY: 'AIzaFAKEKEY', BOT_WEBAPP_URL: BOT_URL, BOT_WEBHOOK_SECRET: env.props.WEBHOOK_SECRET
  });

  const rowsOf = (sheets, name) => {
    const sh = sheets.find((s) => s.name === name);
    if (!sh) return [];
    const [h, ...rest] = sh.data;
    return rest.filter((r) => r.some((v) => v !== '')).map((r) => { const o = {}; h.forEach((k, i) => { o[k] = r[i] === undefined ? '' : r[i]; }); return o; });
  };
  const rows = (name) => rowsOf(env.sheets, name);
  const setCellIn = (sheets, name, keyCol, keyVal, col, val) => {
    const sh = sheets.find((s) => s.name === name);
    const h = sh.data[0];
    const r = sh.data.findIndex((row, i) => i > 0 && String(row[h.indexOf(keyCol)]) === String(keyVal));
    if (r < 0) throw new Error('row not found ' + keyVal);
    sh.set(r + 1, h.indexOf(col) + 1, val);
  };
  const setCellByKey = (name, keyCol, keyVal, col, val) => setCellIn(env.sheets, name, keyCol, keyVal, col, val);

  const world = {
    env, bot, botExec, botPost, say, tap, last, msgsTo, rows, rowsOf, setCellByKey, setCellIn, botCalls, failures, BOT_URL, botTimeout: false,
    web: live.web, sep: live.sep, webExec: live.webExec, api: live.api,
    newWeb, books, chat, claude, chatModel: null
  };
  return world;
}

module.exports = { makeWorld };
