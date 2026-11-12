// ============================== BETA SANDBOX (w2.0) ==============================
//
//  A second Apps Script project runs this same file as the BETA backend, on a private copy of the data:
//
//    1. New project → paste this file → Script properties: SHEET_URL (the REAL Sheet's link) and GEMINI_API_KEY.
//    2. Run "setupBeta" (not "setup"). It creates the Drive folder "HLEP DPR Beta (sandbox)" with its own Photos,
//       Reports and Contractor Reports folders, and a NEW spreadsheet holding a copy of every tab.
//    3. Deploy → New deployment → Web app (Execute as: Me · Who has access: Anyone) → the /exec URL goes in beta/config.js.
//
//  Rules while SANDBOX = Y:
//    · every read and write goes to the copy (SHEET_ID); the real Sheet (SOURCE_SHEET_ID) is opened only to copy from it
//    · real photos (PHOTO_READ_FOLDER_ID) can be shown but are never trashed, moved or renamed
//    · "Jana PDF" is refused: the Telegram bot only reads the real Sheet
//    · refreshBetaData / the "betaRefresh" action makes a fresh copy; the old copy is renamed, nothing is deleted
//
//  The copy is made tab by tab into a new spreadsheet (not File → Make a copy), so the bot's script, which is
//  bound to the real Sheet, is NOT copied: there is never a second bot.

const WEB_BETA_FOLDER = 'HLEP DPR Beta (sandbox)';

function webSandbox_() {
  return prop_('SANDBOX') === 'Y';
}

/** True when a sandbox project somehow points at the real Sheet: every request is refused until setupBeta is run again. */
function webSandboxBroken_() {
  return webSandbox_() && prop_('SHEET_ID') === prop_('SOURCE_SHEET_ID');
}

function webEnv_() {
  const s = webSandbox_();
  return { sandbox: s, at: s ? prop_('SANDBOX_AT') : '' };
}

function webSheetId_(s) {
  const t = String(s || '').trim();
  const m = t.match(/\/d\/([A-Za-z0-9_-]{8,})/) || t.match(/^([A-Za-z0-9_-]{8,})$/);
  return m ? m[1] : '';
}

/** The folder next to a Sheet that holds the bot's "Photos" folder, or null. */
function webBotRoot_(sheetId) {
  const parents = DriveApp.getFileById(sheetId).getParents();
  while (parents.hasNext()) {
    const f = parents.next();
    if (f.getFoldersByName('Photos').hasNext()) return f;
  }
  return null;
}

/** Run once, from the editor of a NEW Apps Script project. */
function setupBeta() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('SANDBOX') === 'Y' && p.getProperty('SHEET_ID')) {
    const note = 'The beta sandbox already exists, so nothing was copied. To copy the real data again, run refreshBetaData.';
    const log = setup();
    console.log(note);
    return log + '\n' + note;
  }
  if (p.getProperty('SHEET_ID')) {
    throw new Error('STOP – this Apps Script project is already set up on a Sheet, so it looks like the LIVE web-app. ' +
      'setupBeta is only for a NEW, separate project. Nothing was changed.');
  }
  const src = webSheetId_(p.getProperty('SHEET_URL'));
  if (!src) throw new Error('Add the Script property SHEET_URL (the link of the real Google Sheet) first, then run setupBeta again.');
  const realRoot = webBotRoot_(src);
  if (!realRoot) throw new Error('Cannot find the bot\'s "Photos" folder next to the Sheet. Is SHEET_URL the bot\'s Sheet?');
  const mine = DriveApp.getFoldersByName(WEB_BETA_FOLDER);
  const folder = mine.hasNext() ? mine.next() : DriveApp.createFolder(WEB_BETA_FOLDER);
  const photos = childFolder_(folder, 'Photos');
  const reports = childFolder_(folder, 'Reports');
  childFolder_(folder, 'Contractor Reports');
  const copyId = webCopySheet_(src, folder, '');
  if (copyId === src) throw new Error('The copy has the same id as the real Sheet. Nothing was set.');
  p.setProperty('SOURCE_SHEET_ID', src);
  p.setProperty('ROOT_FOLDER_ID', folder.getId());
  p.setProperty('PHOTO_FOLDER_ID', photos.getId());
  p.setProperty('REPORT_FOLDER_ID', reports.getId());
  p.setProperty('PHOTO_READ_FOLDER_ID', realRoot.getFoldersByName('Photos').next().getId());
  p.setProperty('SANDBOX_AT', nowStr_());
  p.setProperty('SANDBOX', 'Y');
  p.setProperty('SHEET_ID', copyId);           // last: until this line the project is simply "not set up"
  SS_MEMO = null;
  clearHeaderMemo_();
  return setup();
}

/**
 * Copies every tab of the real Sheet into a new spreadsheet inside the sandbox folder; returns the new id.
 * "Log" is copied as a header only. "WebUsers": on the first copy the people are kept but their PIN marks are
 * cleared (PINs belong to the other project); on a refresh the sandbox's own WebUsers tab is kept (usersFromId).
 */
function webCopySheet_(srcId, folder, usersFromId) {
  const src = SpreadsheetApp.openById(srcId);
  const dst = SpreadsheetApp.create('HLEP DPR – BETA data (salinan ' + Utilities.formatDate(new Date(), TZ, 'dd-MM-yyyy HH.mm') + ')');
  const blank = dst.getSheets()[0];
  blank.setName('_blank_' + Utilities.getUuid().slice(0, 8));
  src.getSheets().forEach(function (sh) {
    const n = sh.getName();
    if (n === WEB_TAB && usersFromId) return;
    if (n === 'Log') {
      dst.insertSheet('Log').getRange(1, 1, 1, SHEETS.Log.length).setValues([SHEETS.Log]);
      return;
    }
    sh.copyTo(dst).setName(n);
  });
  if (usersFromId) {
    const old = SpreadsheetApp.openById(usersFromId).getSheetByName(WEB_TAB);
    if (old) old.copyTo(dst).setName(WEB_TAB);
  } else {
    const wu = dst.getSheetByName(WEB_TAB);
    const last = wu ? wu.getLastRow() : 0;
    if (last > 1) {
      const head = wu.getRange(1, 1, 1, wu.getLastColumn()).getValues()[0].map(String);
      const blanks = [];
      for (let i = 0; i < last - 1; i++) blanks.push(['']);
      ['new_pin', 'pin_set', 'last_login'].forEach(function (k) {
        const c = head.indexOf(k);
        if (c >= 0) wu.getRange(2, c + 1, last - 1, 1).setValues(blanks);
      });
    }
  }
  dst.deleteSheet(blank);
  try { dst.setSpreadsheetTimeZone(src.getSpreadsheetTimeZone()); } catch (e) { /* keeps the account's time zone */ }
  DriveApp.getFileById(dst.getId()).moveTo(folder);
  return dst.getId();
}

/** A fresh copy of the real data. What was added in the beta stays in the old copy, which is renamed "(lama)". */
function refreshBetaData() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('SANDBOX') !== 'Y') throw new Error('refreshBetaData only works in the beta (sandbox) project.');
  const oldId = p.getProperty('SHEET_ID');
  const src = p.getProperty('SOURCE_SHEET_ID');
  if (!oldId || !src || oldId === src) throw new Error('The sandbox is not set up. Run setupBeta.');
  const id = webCopySheet_(src, DriveApp.getFolderById(p.getProperty('ROOT_FOLDER_ID')), oldId);
  const at = nowStr_();
  p.setProperty('SHEET_ID', id);
  p.setProperty('SANDBOX_AT', at);
  SS_MEMO = null;
  clearHeaderMemo_();
  clearCaches_();
  CacheService.getScriptCache().remove('wu');
  try {
    const f = DriveApp.getFileById(oldId);       // the sandbox's own old copy
    f.setName(f.getName() + ' (lama)');
  } catch (e) { /* renaming is only tidiness */ }
  console.log('✅ Beta data copied again at ' + at + '. New copy: ' + SpreadsheetApp.openById(id).getUrl());
  return { at: at, id: id };
}

function apiBetaRefresh_(u) {
  if (!webSandbox_()) throw webErr_('Hanya untuk versi beta.');
  const r = refreshBetaData();
  return { at: r.at };
}

// ---------- web-only preferences (Script properties "wpref_*"; nothing is added to the Sheet) ----------

const WEB_PREFS = {
  CHAT_ACCESS: { label: '✨ Tanya DPR boleh diguna oleh', options: [['all', 'Semua'], ['eng', 'Engineer sahaja'], ['off', 'Tutup']], def: 'all' }
};

function webPref_(key) {
  const d = WEB_PREFS[key];
  if (!d) return '';
  const v = prop_('wpref_' + key);
  return d.options.some(function (o) { return o[0] === v; }) ? v : d.def;
}

function apiPrefs_() {
  return { list: Object.keys(WEB_PREFS).map(function (k) {
    return { key: k, label: WEB_PREFS[k].label, options: WEB_PREFS[k].options, value: webPref_(k) };
  }) };
}

function apiPrefSet_(b) {
  const key = String(b.key || '');
  const d = WEB_PREFS[key];
  const v = String(b.value || '');
  if (!d || !d.options.some(function (o) { return o[0] === v; })) throw webErr_('Tetapan tidak sah.');
  PropertiesService.getScriptProperties().setProperty('wpref_' + key, v);
  return { key: key, value: v };
}
