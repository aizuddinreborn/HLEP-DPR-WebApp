#!/usr/bin/env node
'use strict';
/**
 * Builds backend/dist/WebApp.gs, the single file pasted into the web-app's own Apps Script project.
 *
 *   WebApp.gs = backend/src/web.gs (the web API)
 *             + the bot functions it needs, copied UNCHANGED from the bot's Code.gs.
 *
 * The copy is made by name: we start from ROOTS, follow every top-level name each copied
 * function uses, and stop at names web.gs defines itself (the Telegram stubs, doGet/doPost).
 * So rows are read and written by exactly the bot's own code, and the bot's Code.gs is never edited.
 *
 *   node backend/build.js [path/to/bot/Code.gs]
 * The bot code is NOT committed to this public repo; dist/ is git-ignored.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const walk = require('acorn-walk');

const BOT = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] || process.env.BOT_CODE || '/home/claude/hlep-dpr-bot/Code.gs';
const WEB = path.join(__dirname, 'src', 'web.gs');
const OUT = path.join(__dirname, 'dist', 'WebApp.gs');

// Bot functions/constants the web API calls directly.
const ROOTS = [
  // sheets, settings, categories, dates
  'ss_', 'sheet_', 'headers_', 'rows_', 'appendRow_', 'setCell_', 'writeBack_', 'settings_', 'setting_', 'setSetting_',
  'cats_', 'cat_', 'shortCat_', 'scopesFor_', 'users_', 'loadData_', 'pctFor_', 'weatherFor_', 'manpowerFor_',
  'today_', 'nowStr_', 'addDays_', 'hari_', 'weekday_', 'dmyLong_', 'dmyShort_', 'dmyLoose_', 'parseDateArg_', 'valid_',
  'cleanLine_', 'truncate_', 'safeName_', 'withLock_', 'prop_', 'log_', 'logErr_', 'clearCaches_', 'clearHeaderMemo_',
  'photoFolder_', 'childFolder_', 'newEntryId_', 'whenShort_', 'sv_',
  // entries: the same rules as /semak, /undo and the duplicate check
  'canEditEntry_', 'activeEntry_', 'dayEntries_', 'photoCount_', 'updateEntry_', 'removeEntry_', 'createCategory_', 'isEng_',
  // AI wording (same prompts as Telegram)
  'polish_', 'aiOn_', 'gemini_', 'parseJson_', 'AI_STYLE', 'AI_PLAN_STYLE',
  // WhatsApp text + headline + PTW history
  'buildWA_', 'hlKey_', 'headlineRow_', 'saveHeadline_', 'draftHeadline_', 'cleanHeadline_', 'snapshotPtw_', 'dashMap_', 'docNo_',
  // labels
  'STATUS_LABEL', 'AREA_LABEL', 'EDITABLE_SETTINGS', 'MAX_PHOTOS', 'TZ', 'BOT_VERSION', 'SCHEMA_VER', 'SHEETS'
];

// Bot names that must never be copied: web.gs provides its own version (or a no-op).
const NEVER = ['doPost', 'doGet', 'onOpen', 'send_', 'edit_', 'tg_', 'tgRaw_', 'sendDoc_', 'sendPre_', 'clearButtons_',
  'wait_', 'unwait_', 'answerCb_', 'tgDownload_', 'migrate_', 'handleUpdate_', 'route_', 'ensureSheets_', 'ensureFolders_'];

function topLevel(src, file) {
  const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'script', locations: true });
  const defs = new Map();
  ast.body.forEach((n) => {
    if (n.type === 'FunctionDeclaration') defs.set(n.id.name, n);
    else if (n.type === 'VariableDeclaration') n.declarations.forEach((d) => { if (d.id.type === 'Identifier') defs.set(d.id.name, n); });
    else if (n.type !== 'ExpressionStatement' && n.type !== 'EmptyStatement') throw new Error(file + ': unexpected top-level ' + n.type);
  });
  return { ast, defs };
}

function usedNames(node) {
  const out = new Set();
  walk.full(node, (n) => { if (n.type === 'Identifier') out.add(n.name); });
  return out;
}

function build() {
  const bot = fs.readFileSync(BOT, 'utf8');
  const web = fs.readFileSync(WEB, 'utf8');
  const B = topLevel(bot, 'Code.gs');
  const W = topLevel(web, 'web.gs');
  const version = (bot.match(/const BOT_VERSION = '([^']+)'/) || [])[1] || '?';

  const take = new Set();
  const queue = [];
  const want = (name, from) => {
    if (take.has(name) || W.defs.has(name)) return;
    if (NEVER.includes(name)) return;
    if (!B.defs.has(name)) throw new Error('bot name not found: ' + name + (from ? ' (used by ' + from + ')' : ''));
    take.add(name); queue.push(name);
  };
  ROOTS.forEach((r) => want(r));
  // web.gs may use any bot name directly as well
  usedNames(W.ast).forEach((n) => { if (B.defs.has(n) && !W.defs.has(n)) want(n, 'web.gs'); });
  while (queue.length) {
    const name = queue.shift();
    usedNames(B.defs.get(name)).forEach((n) => { if (n !== name && B.defs.has(n)) want(n, name); });
  }
  // every NEVER name a copied function still calls must be supplied by web.gs
  const missing = [];
  take.forEach((name) => usedNames(B.defs.get(name)).forEach((n) => {
    if (NEVER.includes(n) && !W.defs.has(n) && !missing.includes(n)) missing.push(n + ' (used by ' + name + ')');
  }));
  if (missing.length) throw new Error('web.gs must define: ' + missing.join(', '));

  // copy in the bot's own order; one declaration node may hold several names
  const nodes = [];
  B.ast.body.forEach((n) => {
    const names = n.type === 'FunctionDeclaration' ? [n.id.name] : n.type === 'VariableDeclaration' ? n.declarations.map((d) => d.id.name) : [];
    if (names.some((x) => take.has(x)) && !nodes.includes(n)) nodes.push(n);
  });
  // keep each copied block's leading /** comment */ so the copy reads like the original
  const copied = nodes.map((n) => {
    let start = n.start;
    const before = bot.slice(0, start);
    const m = before.match(/(\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*|(?:\/\/[^\n]*\n\s*)+)$/);
    if (m && !/^\s*\/\/ =+/.test(m[0])) start -= m[0].length;
    return bot.slice(start, n.end);
  });

  const header =
    '/**\n' +
    ' * ==================================================================\n' +
    ' *  HLEP DPR Web-app · backend (Apps Script)\n' +
    ' *  Built ' + new Date().toISOString().slice(0, 10) + ' from web.gs + HLEP DPR Bot ' + version + ' (copied functions, unchanged).\n' +
    ' *  This is a SEPARATE Apps Script project from the Telegram bot.\n' +
    ' *  It reads and writes the bot\'s Google Sheet with the bot\'s own code,\n' +
    ' *  so the bot keeps working exactly as before. Do not paste this into the bot.\n' +
    ' * ==================================================================\n' +
    ' */\n\n';
  const out = header + web.trim() + '\n\n' +
    '// ============================== BOT CODE (copied from HLEP DPR Bot ' + version + ', unchanged) ==============================\n' +
    '// ' + take.size + ' names: ' + Array.from(take).sort().join(', ').replace(/(.{1,110})(, |$)/g, '$1$2\n// ').trim() + '\n\n' +
    copied.join('\n\n') + '\n';
  // the result must parse and must not redefine a name
  const R = topLevel(out, 'WebApp.gs');
  const seen = {};
  R.ast.body.forEach((n) => {
    const names = n.type === 'FunctionDeclaration' ? [n.id.name] : n.type === 'VariableDeclaration' ? n.declarations.map((d) => d.id.name) : [];
    names.forEach((x) => { if (seen[x]) throw new Error('defined twice: ' + x); seen[x] = 1; });
  });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  return { out: OUT, version, names: Array.from(take).sort(), bytes: out.length };
}

if (require.main === module) {
  const r = build();
  console.log('Built ' + r.out + ' (' + Math.round(r.bytes / 1024) + ' KB) with ' + r.names.length + ' bot names from ' + r.version);
  if (process.argv.includes('--list')) console.log(r.names.join('\n'));
}
module.exports = { build };
