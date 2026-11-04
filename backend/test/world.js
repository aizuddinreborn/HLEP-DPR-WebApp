'use strict';
/**
 * A simulated world for tests and the local preview server:
 *   · the Telegram bot (the user's real Code.gs, unchanged) in one Apps Script context
 *   · the web backend (dist/WebApp.gs) in a SECOND context: its own Script properties, cache and lock,
 *     like a separate Apps Script project, but the SAME Google Sheet and Drive.
 * Uses the bot's dev-harness mocks (HARNESS=/path/to/harness, default: the scratchpad unpack).
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
  // ---------- the web backend: a separate project ----------
  const sep = separateServices(env.clock);
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
  const DriveApp = {
    createFolder: (n) => patchFolder(env.ctx.DriveApp.createFolder(n)),
    getFolderById: (id) => patchFolder(env.ctx.DriveApp.getFolderById(id)),
    getFileById: (id) => {
      if (id === 'SHEET123') return { getParents: () => iter([patchFolder(env.folders[env.props.ROOT_FOLDER_ID])]) };
      return patchFile(env.ctx.DriveApp.getFileById(id));
    }
  };
  const botCalls = [];
  const UrlFetchApp = {
    fetch: (url, params) => {
      if (url.indexOf(BOT_URL) === 0) {
        const key = decodeURIComponent((url.match(/[?&]key=([^&]+)/) || [])[1] || '');
        botCalls.push(JSON.parse(params.payload));
        if (world.botTimeout) { botExec(() => bot.doPost({ parameter: { key }, postData: { contents: params.payload } })); throw new Error('Timeout: request took too long'); }
        const out = botExec(() => bot.doPost({ parameter: { key }, postData: { contents: params.payload } }));
        return { getResponseCode: () => 200, getContentText: () => (out && out.content) || '' };
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
    DriveApp, UrlFetchApp, ContentService
  });
  vm.createContext(web);
  vm.runInContext(fs.readFileSync(WEB_CODE, 'utf8'), web, { filename: 'WebApp.gs' });
  const webExec = (fn) => {
    vm.runInContext('SS_MEMO = null; HEADER_MEMO = {}; SS_TZ_MEMO = "";', web);
    const r = fn();
    if (sep.lockState()) failures.push('web lock still held');
    return r;
  };
  Object.assign(sep.props, {
    SHEET_URL: 'https://docs.google.com/spreadsheets/d/SHEET123/edit#gid=0',
    GEMINI_API_KEY: 'AIzaFAKEKEY', BOT_WEBAPP_URL: BOT_URL, BOT_WEBHOOK_SECRET: env.props.WEBHOOK_SECRET
  });
  const api = (a, body) => {
    const out = webExec(() => web.doPost({ postData: { contents: JSON.stringify(Object.assign({ a }, body || {})) } }));
    if (out.mime !== 'JSON') failures.push('reply not JSON for ' + a);
    return JSON.parse(out.content);
  };

  const rows = (name) => {
    const sh = env.sheets.find((s) => s.name === name);
    if (!sh) return [];
    const [h, ...rest] = sh.data;
    return rest.filter((r) => r.some((v) => v !== '')).map((r) => { const o = {}; h.forEach((k, i) => { o[k] = r[i] === undefined ? '' : r[i]; }); return o; });
  };
  const setCellByKey = (name, keyCol, keyVal, col, val) => {
    const sh = env.sheets.find((s) => s.name === name);
    const h = sh.data[0];
    const r = sh.data.findIndex((row, i) => i > 0 && String(row[h.indexOf(keyCol)]) === String(keyVal));
    if (r < 0) throw new Error('row not found ' + keyVal);
    sh.set(r + 1, h.indexOf(col) + 1, val);
  };

  const world = { env, bot, web, botExec, webExec, botPost, say, tap, last, msgsTo, api, rows, setCellByKey, sep, botCalls, failures, BOT_URL, botTimeout: false };
  return world;
}

module.exports = { makeWorld };
