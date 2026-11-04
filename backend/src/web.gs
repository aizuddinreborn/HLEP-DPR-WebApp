// ============================== WEB-APP API ==============================
//
//  One POST endpoint for the web-app (GitHub Pages). Body = JSON { a: action, t: token, ... }.
//  Sent as text/plain so the browser makes no CORS pre-flight. Reply = JSON { ok, ... } or { ok: false, err }.
//
//  ONE-TIME SETUP (full steps in the repo README / setup page):
//   1. script.google.com → New project → paste this whole file as Code.gs → Save.
//   2. Project Settings → Script properties → add:
//        SHEET_URL            the bot's Google Sheet link (from the browser address bar)
//        GEMINI_API_KEY       same key as the bot (optional: without it lines are saved as typed)
//        BOT_WEBAPP_URL       the bot's Script property WEBAPP_URL   (for "Jana PDF")
//        BOT_WEBHOOK_SECRET   the bot's Script property WEBHOOK_SECRET (for "Jana PDF")
//   3. Editor → choose function "setup" → Run → allow access. Read the log.
//   4. Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone → copy the /exec URL.
//   5. In the Sheet, tab "WebUsers": type a 4-digit PIN in "new_pin" for each person.
//
//  The bot's Code.gs is never changed. This project only adds rows the bot already understands
//  (source = "web") and one tab of its own, "WebUsers".

const WEB_VERSION = 'w1.1';
const WEB_TAB = 'WebUsers';
const WEB_HEAD = ['user_id', 'name', 'role', 'new_pin', 'pin_set', 'active', 'last_login', 'added_at', 'note'];
const WEB_TOKEN_DAYS = 30;
const WEB_MAX_UPLOAD = 10 * 1024 * 1024;     // bytes, after base64 decoding (the app sends ~0.3 MB photos)
const WEB_BACK_DAYS = 62;                   // how far back an activity may be dated

// ---------- entry points ----------

function doGet() {
  return webOut_({ ok: true, app: 'HLEP DPR Web-app', v: WEB_VERSION, ready: !!prop_('SHEET_ID') });
}

function doPost(e) {
  let b = {};
  try {
    b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return webOut_({ ok: false, err: 'Permintaan tidak sah.' });
  }
  try {
    if (!prop_('SHEET_ID')) return webOut_({ ok: false, err: 'Backend belum disediakan (jalankan setup).', code: 'setup' });
    const r = webRoute_(String(b.a || ''), b);
    r.ok = true;
    return webOut_(r);
  } catch (err) {
    if (err && err.web) return webOut_({ ok: false, err: err.msg, code: err.code || '' });
    logErr_('web ' + b.a, err);
    return webOut_({ ok: false, err: 'Ralat pelayan: ' + String((err && err.message) || err).slice(0, 200) });
  }
}

function webOut_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function webErr_(msg, code) {
  return { web: true, msg: msg, code: code };
}

const WEB_ACTIONS = {
  // name: [needs login, engineer only, handler]
  boot: [false, false, function (u, b) { return apiBoot_(); }],
  login: [false, false, function (u, b) { return apiLogin_(b); }],
  logout: [true, false, function (u, b) { return apiLogout_(b); }],
  pin: [true, false, function (u, b) { return apiPin_(u, b); }],
  meta: [true, false, function (u, b) { return apiMeta_(u); }],
  day: [true, false, function (u, b) { return apiDay_(u, b); }],
  thumbs: [true, false, function (u, b) { return apiThumbs_(b); }],
  photo: [true, false, function (u, b) { return apiPhoto_(b); }],
  upload: [true, false, function (u, b) { return apiUpload_(u, b); }],
  polish: [true, false, function (u, b) { return apiPolish_(b); }],
  save: [true, false, function (u, b) { return apiSave_(u, b); }],
  update: [true, false, function (u, b) { return apiUpdate_(u, b); }],
  remove: [true, false, function (u, b) { return apiRemove_(u, b); }],
  newcat: [true, false, function (u, b) { return apiNewCat_(u, b); }],
  weather: [true, false, function (u, b) { return apiWeather_(u, b); }],
  manpower: [true, false, function (u, b) { return apiManpower_(u, b); }],
  report: [true, false, function (u, b) { return apiReport_(u, b); }],
  reports: [true, false, function (u, b) { return apiReports_(b); }],
  pdf: [true, false, function (u, b) { return apiPdf_(b); }],
  progress: [true, true, function (u, b) { return apiProgress_(u, b); }],
  plan: [true, true, function (u, b) { return apiPlan_(u, b); }],
  planDel: [true, true, function (u, b) { return apiPlanDel_(b); }],
  material: [true, true, function (u, b) { return apiMaterial_(u, b); }],
  materialDel: [true, true, function (u, b) { return apiMaterialDel_(b); }],
  wa: [true, true, function (u, b) { return apiWa_(b); }],
  headline: [true, true, function (u, b) { return apiHeadline_(b); }],
  headlineSet: [true, true, function (u, b) { return apiHeadlineSet_(u, b); }],
  settings: [true, true, function (u, b) { return apiSettings_(); }],
  settingSet: [true, true, function (u, b) { return apiSettingSet_(u, b); }]
};

function webRoute_(a, b) {
  const h = WEB_ACTIONS[a];
  if (!h) throw webErr_('Tindakan tidak dikenali: ' + a);
  let u = null;
  if (h[0]) {
    u = webAuth_(b.t);
    if (!u) throw webErr_('Sesi tamat. Sila log masuk semula.', 'auth');
    if (h[1] && !isEng_(u)) throw webErr_('Untuk engineer sahaja.', 'eng');
  }
  return h[2](u, b) || {};
}

// ---------- one-time setup (run from the Apps Script editor) ----------

function setup() {
  const p = PropertiesService.getScriptProperties();
  const url = String(p.getProperty('SHEET_URL') || p.getProperty('SHEET_ID') || '').trim();
  const m = url.match(/\/d\/([A-Za-z0-9_-]{8,})/) || url.match(/^([A-Za-z0-9_-]{8,})$/);
  if (!m) throw new Error('Add the Script property SHEET_URL (the bot\'s Google Sheet link) first.');
  const ss = SpreadsheetApp.openById(m[1]);
  p.setProperty('SHEET_ID', m[1]);
  SS_MEMO = null;
  // the bot keeps its Sheet inside the "HLEP DPR Bot" folder, with Photos/ and Reports/ next to it
  const parents = DriveApp.getFileById(m[1]).getParents();
  let root = null;
  while (parents.hasNext()) {
    const f = parents.next();
    if (f.getFoldersByName('Photos').hasNext()) { root = f; break; }
  }
  if (!root) throw new Error('Cannot find the bot\'s "Photos" folder next to the Sheet. Is this the bot\'s Sheet?');
  p.setProperty('ROOT_FOLDER_ID', root.getId());
  p.setProperty('PHOTO_FOLDER_ID', root.getFoldersByName('Photos').next().getId());
  if (root.getFoldersByName('Reports').hasNext()) p.setProperty('REPORT_FOLDER_ID', root.getFoldersByName('Reports').next().getId());
  if (!p.getProperty('WEB_SALT')) p.setProperty('WEB_SALT', Utilities.getUuid().replace(/-/g, ''));
  ['Entries', 'Users', 'Categories', 'Settings'].forEach(function (t) {
    if (!ss.getSheetByName(t)) throw new Error('Tab "' + t + '" is missing. Run the bot\'s Setup first.');
  });
  webEnsureTab_();
  const list = webUsersSync_();
  const lines = [
    '✅ Web-app backend ready (' + WEB_VERSION + ', bot code ' + BOT_VERSION + ').',
    'Sheet: ' + ss.getName(),
    'Photos folder: ' + p.getProperty('PHOTO_FOLDER_ID'),
    'AI wording: ' + (aiOn_() ? 'on' : 'off (no GEMINI_API_KEY)'),
    'Jana PDF via bot: ' + (p.getProperty('BOT_WEBAPP_URL') && p.getProperty('BOT_WEBHOOK_SECRET') ? 'on' : 'off (add BOT_WEBAPP_URL and BOT_WEBHOOK_SECRET)'),
    'WebUsers tab: ' + list.length + ' people (' + list.filter(function (x) { return x.pin; }).length + ' with a PIN).',
    'NEXT: Deploy → New deployment → Web app (Execute as: Me · Who has access: Anyone).'
  ];
  console.log(lines.join('\n'));
  return lines.join('\n');
}

// ---------- team list & PINs (tab "WebUsers") ----------

function webEnsureTab_() {
  const ss = ss_();
  let sh = ss.getSheetByName(WEB_TAB);
  if (!sh) sh = ss.insertSheet(WEB_TAB, ss.getSheets().length);
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const have = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(function (h) { return h; });
  if (!have.length) sh.getRange(1, 1, 1, WEB_HEAD.length).setValues([WEB_HEAD]);
  else {
    const missing = WEB_HEAD.filter(function (h) { return have.indexOf(h) < 0; });
    if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
  }
  sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#7C6FD6').setFontColor('#FFFFFF');
  // plain text, so a PIN like 0123 keeps its leading zero
  const hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  if (hdr.indexOf('new_pin') >= 0) sh.getRange(2, hdr.indexOf('new_pin') + 1, 500, 1).setNumberFormat('@');
  sh.setFrozenRows(1);
  clearHeaderMemo_();
  return sh;
}

function webHash_(uid, pin) {
  const salt = prop_('WEB_SALT');
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + uid + ':' + pin).map(function (b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

/**
 * Reads the team, and tidies the tab: approved Telegram users are added (same user_id, so /semak in Telegram
 * and the web-app agree on whose line it is), people without Telegram get a W-id, and a PIN typed in
 * "new_pin" is turned into a hash (kept in Script properties, never in the Sheet) and wiped from the cell.
 */
function webUsersSync_() {
  return withLock_(function () {
    if (!ss_().getSheetByName(WEB_TAB)) webEnsureTab_();
    const p = PropertiesService.getScriptProperties();
    let list = rows_(WEB_TAB);
    const have = {};
    list.forEach(function (r) { if (r.user_id !== '') have[String(r.user_id)] = 1; });
    let added = false;
    rows_('Users').forEach(function (u) {
      if (String(u.approved).toUpperCase() !== 'Y' || have[String(u.user_id)]) return;
      appendRow_(WEB_TAB, { user_id: String(u.user_id), name: u.name, role: u.role === 'eng' ? 'eng' : 'tech', new_pin: '', pin_set: '',
        active: 'Y', last_login: '', added_at: nowStr_(), note: 'from Telegram' });
      have[String(u.user_id)] = 1;
      added = true;
    });
    if (added) list = rows_(WEB_TAB);
    const out = [];
    list.forEach(function (r) {
      if (!String(r.name || '').trim()) return;
      let uid = String(r.user_id || '').trim();
      if (!uid) {
        do { uid = 'W' + Math.floor(10000 + Math.random() * 90000); } while (have[uid]);
        have[uid] = 1;
        setCell_(WEB_TAB, r._row, 'user_id', uid);
      }
      const np = String(r.new_pin || '').trim();
      if (np) {
        if (/^\d{4,8}$/.test(np)) {
          p.setProperty('wp_' + uid, webHash_(uid, np));
          setCell_(WEB_TAB, r._row, 'pin_set', 'Y ' + dmyLong_(today_()));
          setCell_(WEB_TAB, r._row, 'note', '');
        } else {
          setCell_(WEB_TAB, r._row, 'note', 'PIN must be 4–8 digits');
        }
        setCell_(WEB_TAB, r._row, 'new_pin', '');
      }
      if (r.active === '') setCell_(WEB_TAB, r._row, 'active', 'Y');
      out.push({ user_id: uid, name: String(r.name).trim(), role: String(r.role).trim() === 'eng' ? 'eng' : 'tech',
        active: String(r.active || 'Y').toUpperCase() !== 'N', pin: !!p.getProperty('wp_' + uid), _row: r._row });
    });
    CacheService.getScriptCache().put('wu', JSON.stringify(out), 60);
    return out;
  });
}

function webUsers_() {
  const s = CacheService.getScriptCache().get('wu');
  if (s) return JSON.parse(s);
  return webUsersSync_();
}

function webUser_(uid) {
  const r = webUsers_().filter(function (x) { return x.user_id === String(uid) && x.active; })[0];
  // the shape the bot's own rules expect (canEditEntry_, isEng_)
  return r ? { user_id: r.user_id, name: r.name, role: r.role, approved: 'Y', _row: r._row } : null;
}

// ---------- sessions ----------

function webAuth_(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ''))) return null;
  const p = PropertiesService.getScriptProperties();
  const s = p.getProperty('wt_' + token);
  if (!s) return null;
  let o;
  try { o = JSON.parse(s); } catch (e) { return null; }
  if (!o || o.exp < Date.now()) { p.deleteProperty('wt_' + token); return null; }
  const u = webUser_(o.u);
  const h = p.getProperty('wp_' + o.u) || '';
  if (!u || h.slice(0, 12) !== o.h) { p.deleteProperty('wt_' + token); return null; }   // removed, or the PIN was reset
  if (o.exp - Date.now() < (WEB_TOKEN_DAYS - 7) * 86400000) {
    o.exp = Date.now() + WEB_TOKEN_DAYS * 86400000;
    p.setProperty('wt_' + token, JSON.stringify(o));
  }
  return u;
}

function webTokenFor_(uid) {
  const p = PropertiesService.getScriptProperties();
  const all = p.getProperties();
  Object.keys(all).forEach(function (k) {        // tidy expired sessions
    if (k.indexOf('wt_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < Date.now()) p.deleteProperty(k); } catch (e) { p.deleteProperty(k); }
  });
  const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 48).toLowerCase();
  p.setProperty('wt_' + token, JSON.stringify({ u: uid, h: (p.getProperty('wp_' + uid) || '').slice(0, 12), exp: Date.now() + WEB_TOKEN_DAYS * 86400000 }));
  return token;
}

function webUserOut_(u) {
  const tg = webTelegram_(u);
  return { id: u.user_id, name: u.name, role: u.role, eng: isEng_(u), telegram: tg };
}

/** True when this person is an approved user of the Telegram bot (so the bot can send them the PDF). */
function webTelegram_(u) {
  if (!/^\d+$/.test(String(u.user_id))) return false;
  return users_().some(function (x) { return x.user_id === String(u.user_id) && x.approved === 'Y'; });
}

function apiBoot_() {
  const list = webUsersSync_().filter(function (x) { return x.active; });
  return { v: WEB_VERSION, bot: BOT_VERSION, today: today_(),
    team: list.map(function (x) { return { id: x.user_id, name: x.name, role: x.role, pin: x.pin }; }) };
}

function apiLogin_(b) {
  const uid = String(b.id || '');
  const pin = String(b.pin || '');
  const cache = CacheService.getScriptCache();
  const tries = Number(cache.get('wl_' + uid) || 0);
  if (tries >= 5) throw webErr_('Terlalu banyak cubaan. Cuba lagi selepas 15 minit.', 'locked');
  const u = webUser_(uid);
  const h = prop_('wp_' + uid);
  if (!u) throw webErr_('Nama tidak dijumpai. Minta engineer tambah anda dalam tab WebUsers.');
  if (!h) throw webErr_('PIN belum ditetapkan. Minta engineer isi PIN anda dalam tab WebUsers (new_pin).', 'nopin');
  if (!/^\d{4,8}$/.test(pin) || webHash_(uid, pin) !== h) {
    cache.put('wl_' + uid, String(tries + 1), 900);
    throw webErr_('PIN salah.' + (tries >= 2 ? ' Tinggal ' + (4 - tries) + ' cubaan.' : ''), 'pin');
  }
  cache.remove('wl_' + uid);
  withLock_(function () { setCell_(WEB_TAB, u._row, 'last_login', nowStr_()); });
  return { token: webTokenFor_(uid), user: webUserOut_(u) };
}

function apiLogout_(b) {
  PropertiesService.getScriptProperties().deleteProperty('wt_' + String(b.t || ''));
  return {};
}

function apiPin_(u, b) {
  const oldPin = String(b.old || '');
  const pin = String(b.pin || '');
  if (webHash_(u.user_id, oldPin) !== prop_('wp_' + u.user_id)) throw webErr_('PIN lama salah.');
  if (!/^\d{4,8}$/.test(pin)) throw webErr_('PIN baru mesti 4–8 nombor.');
  const p = PropertiesService.getScriptProperties();
  p.setProperty('wp_' + u.user_id, webHash_(u.user_id, pin));
  withLock_(function () { setCell_(WEB_TAB, u._row, 'pin_set', 'Y ' + dmyLong_(today_()) + ' (self)'); });
  CacheService.getScriptCache().remove('wu');
  return { token: webTokenFor_(u.user_id) };
}

// ---------- reading ----------

function webDate_(s, allowFuture) {
  const ymd = s ? parseDateArg_(String(s)) : today_();
  if (!ymd) throw webErr_('Tarikh tidak sah. Guna dd/mm/yyyy.');
  if (!allowFuture && ymd > today_()) throw webErr_(dmyLong_(ymd) + ' belum tiba.');
  return ymd;
}

function webCatOut_(c) {
  return { key: c.key, area: c.area, scope: c.scope || '', group: c.group || '', item: c.item || '', label: shortCat_(c),
    button: c.button || shortCat_(c), pct: !!(c.pct_style && c.pct_style !== 'none'), mat: !!c.material_header };
}

function apiMeta_(u) {
  const cats = cats_();
  const scopes = {};
  ['U1', 'U4'].forEach(function (a) { scopes[a] = scopesFor_(a); });
  return {
    user: webUserOut_(u), today: today_(), v: WEB_VERSION, bot: BOT_VERSION,
    areas: [{ key: 'U1', label: AREA_LABEL.U1 }, { key: 'U4', label: AREA_LABEL.U4 }],
    cats: cats.map(webCatOut_), scopes: scopes,
    status: [{ key: 'NS', label: STATUS_LABEL.NS }, { key: 'IP', label: STATUS_LABEL.IP }, { key: 'CP', label: STATUS_LABEL.CP }],
    weather: String(setting_('WEATHER_OPTIONS') || 'Sunny, Clear, Cloudy, Rainy, Hazy').split(',').map(function (s) { return s.trim(); }).filter(String),
    ai: aiOn_(), pdf: !!(prop_('BOT_WEBAPP_URL') && prop_('BOT_WEBHOOK_SECRET')),
    maxPhotos: MAX_PHOTOS, pdfPhotos: photosPerActivity_(settings_()),
    headlineAi: String(setting_('HEADLINE_AI') || 'Y').toUpperCase() !== 'N'
  };
}

function webEntryOut_(e, user) {
  const c = cat_(e.category_key);
  return {
    id: e.entry_id, date: e.work_date, area: e.area, cat: e.category_key, catLabel: c ? shortCat_(c) : String(e.category),
    status: e.status, shift: e.shift === 'N' ? 'N' : 'D', who: e.reporter, uid: String(e.user_id), at: e.received_at,
    text: e.activity_text, raw: e.raw_text, src: e.source,
    photos: String(e.photo_ids || '').split(',').map(function (x) { return x.trim(); }).filter(String),
    edit: canEditEntry_(user, e)
  };
}

function webLinked_(d, key) {
  return !!dashMap_()[key] && d.progress.some(function (p) { return p.category_key === key && String(p.updated_by) === 'Dashboard'; });
}

function apiDay_(u, b) {
  const date = webDate_(b.date);
  const d = loadData_();
  const tomorrow = addDays_(date, 1);
  const label = function (key) { const c = cat_(key); return c ? shortCat_(c) : key; };
  const mp = manpowerFor_(d, date);
  return {
    date: date, day: hari_(date), today: today_(),
    entries: dayEntries_(date).map(function (e) { return webEntryOut_(e, u); }),
    weather: weatherFor_(d, date),
    manpower: { date: mp.date, list: mp.list },
    progress: d.cats.filter(function (c) { return c.pct_style && c.pct_style !== 'none'; }).map(function (c) {
      return { key: c.key, label: shortCat_(c), area: c.area, pct: pctFor_(d, c.key, date), linked: webLinked_(d, c.key) };
    }),
    plans: d.plans.filter(function (p) { return p.plan_date === tomorrow; }).map(function (p) {
      return { row: p._row, date: p.plan_date, area: p.area, cat: p.category_key, label: label(p.category_key), text: p.text, by: p.added_by };
    }),
    materials: d.materials.filter(function (m) { return m.arrived_date && m.arrived_date <= date; })
      .sort(function (a, b2) { return a.arrived_date < b2.arrived_date ? 1 : -1; })
      .map(function (m) { return { row: m._row, area: m.area, cat: m.category_key, label: label(m.category_key), item: m.item, date: m.arrived_date }; })
  };
}

/** A photo the web-app may show: only files inside the bot's Photos/yyyy-mm/yyyy-mm-dd folders. */
function webPhotoFile_(id) {
  if (!/^[A-Za-z0-9_-]{20,}$/.test(String(id || ''))) return null;
  let f;
  try { f = DriveApp.getFileById(id); } catch (e) { return null; }
  if (f.isTrashed()) return null;
  const root = prop_('PHOTO_FOLDER_ID');
  let hops = 0;
  let it = f.getParents();
  while (it.hasNext() && hops < 3) {
    const p = it.next();
    if (p.getId() === root) return f;
    it = p.getParents();
    hops++;
  }
  return null;
}

function apiThumbs_(b) {
  const ids = (b.ids || []).slice(0, 12);
  const cache = CacheService.getScriptCache();
  const out = {};
  ids.forEach(function (id) {
    const k = 'th_' + id;
    const hit = cache.get(k);
    if (hit) { out[id] = hit; return; }
    const f = webPhotoFile_(id);
    if (!f) { out[id] = ''; return; }
    let blob = null;
    try { blob = f.getThumbnail(); } catch (e) { blob = null; }
    if (!blob && f.getSize() < 1500000) blob = f.getBlob();
    if (!blob) { out[id] = ''; return; }
    const url = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
    if (url.length < 95000) cache.put(k, url, 21600);
    out[id] = url;
  });
  return { thumbs: out };
}

function apiPhoto_(b) {
  const f = webPhotoFile_(b.id);
  if (!f) throw webErr_('Gambar tidak dijumpai.');
  if (f.getSize() > 8 * 1024 * 1024) throw webErr_('Gambar terlalu besar untuk dipaparkan. Buka dalam Google Drive.');
  const blob = f.getBlob();
  return { src: 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes()), url: f.getUrl() };
}

// ---------- writing activities ----------

function apiUpload_(u, b) {
  const cid = String(b.cid || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(cid)) throw webErr_('Upload tanpa id.');
  const cache = CacheService.getScriptCache();
  const again = cache.get('up_' + cid);
  if (again) return JSON.parse(again);               // the phone re-sent a photo already saved (weak signal)
  const date = webDate_(b.date);
  if (date < addDays_(today_(), -WEB_BACK_DAYS)) throw webErr_('Tarikh terlalu lama.');
  const mime = String(b.mime || 'image/jpeg').toLowerCase();
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(mime)) throw webErr_('Hanya gambar (JPG/PNG).');
  let bytes;
  try { bytes = Utilities.base64Decode(String(b.b64 || '')); } catch (e) { throw webErr_('Gambar rosak semasa dihantar. Cuba lagi.'); }
  if (!bytes.length) throw webErr_('Gambar kosong.');
  if (bytes.length > WEB_MAX_UPLOAD) throw webErr_('Gambar terlalu besar (maks 10 MB).');
  const when = new Date(Number(b.taken) > 0 ? Number(b.taken) : Date.now());
  const ext = /png/.test(mime) ? '.png' : (/heic|heif/.test(mime) ? '.heic' : (/webp/.test(mime) ? '.webp' : '.jpg'));
  // same file names as the bot: a photo for a past date is named like a /backdate photo
  const stamp = date !== today_() ? date + '_backdate_' + Utilities.formatDate(when, TZ, 'HHmmss') : Utilities.formatDate(when, TZ, 'yyyy-MM-dd_HHmmss');
  const blob = Utilities.newBlob(bytes, mime, stamp + '_' + safeName_(u.name) + '_' + Math.floor(100 + Math.random() * 900) + ext);
  const folder = withLock_(function () { return photoFolder_(date); });
  const file = folder.createFile(blob);
  const res = { id: file.getId(), url: file.getUrl() };
  cache.put('up_' + cid, JSON.stringify(res), 21600);
  cache.put('upid_' + res.id, '1', 21600);
  return res;
}

function webDraft_(b) {
  return { mode: b.mode === 'plan' ? 'plan' : 'entry', draft: { area: b.area, catKey: b.cat, status: b.status, shift: b.shift } };
}

function apiPolish_(b) {
  const raw = String(b.raw || '').trim().slice(0, 1500);
  if (!raw) throw webErr_('Tiada ayat.');
  const line = polish_(raw, webDraft_(b));
  return { line: line || cleanLine_(raw), ai: !!line, aiOn: aiOn_() };
}

function webCheckCat_(area, key) {
  if (area !== 'U1' && area !== 'U4') throw webErr_('Pilih kawasan.');
  const c = cat_(key);
  if (!c || c.area !== area) throw webErr_('Pilih sistem.');
  return c;
}

function apiSave_(u, b) {
  const cid = String(b.cid || '');
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(cid)) throw webErr_('Entri tanpa id.');
  const date = webDate_(b.date);
  if (date < addDays_(today_(), -WEB_BACK_DAYS)) throw webErr_('Tarikh terlalu lama (maks ' + WEB_BACK_DAYS + ' hari).');
  const c = webCheckCat_(b.area, b.cat);
  const status = String(b.status || '');
  if (!/^(NS|IP|CP)$/.test(status)) throw webErr_('Pilih status.');
  const shift = b.shift === 'N' ? 'N' : 'D';
  const raw = String(b.raw || '').trim().slice(0, 1500);
  const ids = (b.photos || []).map(String).filter(String);
  if (ids.length > MAX_PHOTOS) throw webErr_('Maksimum ' + MAX_PHOTOS + ' gambar setiap aktiviti.');
  const cache = CacheService.getScriptCache();
  const urls = ids.map(function (id) {
    const f = cache.get('upid_' + id) ? DriveApp.getFileById(id) : webPhotoFile_(id);
    if (!f) throw webErr_('Satu gambar tidak dijumpai. Padam dan pilih semula.');
    return f.getUrl();
  });
  let text = cleanLine_(String(b.text || '').slice(0, 600));
  if (!text && raw) text = polish_(raw, webDraft_(b)) || cleanLine_(raw);
  if (!text) throw webErr_('Tulis apa kerja ini.');
  let id = null;
  let again = false;
  withLock_(function () {
    const tag = 'web:' + cid;
    const old = rows_('Entries').filter(function (e) { return e.media_group === tag && e.deleted !== 'Y'; })[0];
    if (old) { id = old.entry_id; again = true; return; }        // the offline queue sent it twice
    id = newEntryId_();
    appendRow_('Entries', {
      entry_id: id, work_date: date, received_at: nowStr_(), reporter: u.name, user_id: u.user_id,
      area: c.area, category_key: c.key, category: shortCat_(c), status: status, shift: shift,
      raw_text: raw, activity_text: text, photo_links: urls.join('\n'), photo_ids: ids.join(','),
      media_group: tag, source: 'web', deleted: '', source_ref: '', backdated: date < today_() ? 'Y' : ''
    });
  });
  let dup = null;
  if (!again) { try { dup = webDup_(u, id); } catch (err) { logErr_('web dup', err); } }
  return { id: id, text: text, again: again, dup: dup };
}

/** The bot's duplicate check (dupCheck_), returning the match instead of asking in Telegram. */
function webDup_(u, entryId) {
  const all = rows_('Entries');
  const mine = all.filter(function (e) { return e.entry_id === entryId; })[0];
  if (!mine || !mine.activity_text) return null;
  const cands = all.filter(function (e) {
    return e.entry_id !== entryId && e.work_date === mine.work_date && e.area === mine.area && e.activity_text &&
      e.deleted !== 'Y' && e.deleted !== 'M' && String(e.user_id) !== String(u.user_id);
  }).slice(-30);
  if (!cands.length) return null;
  const norm = function (t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  const label = function (e) { const c = cat_(e.category_key); return c ? shortCat_(c) : e.category; };
  let hit = cands.filter(function (e) { return norm(e.activity_text) === norm(mine.activity_text); })[0] || null;
  if (!hit && aiOn_()) {
    const prompt = 'Electrical daily site report, ' + mine.work_date + ', ' + (AREA_LABEL[mine.area] || mine.area) + '.\n' +
      'NEW line just sent: [' + label(mine) + '] ' + mine.activity_text + '\n\nLines already sent by other people the same day:\n' +
      cands.map(function (e, i) { return (i + 1) + '. [' + label(e) + '] ' + e.activity_text; }).join('\n') +
      '\n\nDoes the NEW line report the SAME piece of work as one numbered line (same equipment or location and the same activity, ' +
      'even if worded differently or with a different status)? A different item of equipment, a different step of the work or a different shift is NOT the same. ' +
      'Return JSON only: {"same": <number of that line, or 0>}';
    const j = parseJson_(gemini_([{ text: prompt }], { json: true, max: 1024, thinking: 'low' }));
    const n = j ? Number(j.same) : 0;
    if (n >= 1 && n <= cands.length) hit = cands[n - 1];
  }
  if (!hit) return null;
  return { id: hit.entry_id, who: hit.reporter, at: whenShort_(hit.received_at), label: label(hit), text: hit.activity_text, photos: photoCount_(hit) };
}

function apiUpdate_(u, b) {
  const f = {};
  if (b.text !== undefined) {
    const t = cleanLine_(String(b.text).slice(0, 600));
    if (!t) throw webErr_('Ayat kosong.');
    f.activity_text = t;
  }
  if (b.status !== undefined) {
    if (!/^(NS|IP|CP)$/.test(String(b.status))) throw webErr_('Status tidak sah.');
    f.status = String(b.status);
  }
  if (b.shift !== undefined) f.shift = b.shift === 'N' ? 'N' : 'D';
  if (b.cat !== undefined) {
    const c = cat_(String(b.cat));
    if (!c) throw webErr_('Sistem tidak dijumpai.');
    f.category_key = c.key; f.category = shortCat_(c); f.area = c.area;
  }
  if (!Object.keys(f).length) throw webErr_('Tiada perubahan.');
  const r = updateEntry_(u, String(b.id || ''), f);
  if (!r.ok) throw webErr_(String(r.err).replace(/^[⚠️⛔\s]+/, ''));
  const e = activeEntry_(String(b.id));
  return { entry: e ? webEntryOut_(e, u) : null };
}

function apiRemove_(u, b) {
  const r = removeEntry_(u, String(b.id || ''), true);
  if (!r.ok) throw webErr_('Aktiviti ini sudah tiada, atau bukan milik anda.');
  return { photos: r.photos, date: r.date };
}

function apiNewCat_(u, b) {
  const area = String(b.area || '');
  if (area !== 'U1' && area !== 'U4') throw webErr_('Pilih kawasan.');
  const name = String(b.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 40) throw webErr_('Nama sistem 2–40 huruf, cth: AIR CONDITIONING.');
  const scopes = scopesFor_(area);
  const scope = String(b.scope || '');
  if (scopes.length && scopes.indexOf(scope) < 0) throw webErr_('Pilih skop.');
  const nc = withLock_(function () { return createCategory_(area, scopes.length ? scope : '', name, u); });
  return { key: nc.key, created: nc.created, label: nc.label, cats: cats_().map(webCatOut_) };
}

// ---------- weather · manpower · progress · plans · materials ----------

function apiWeather_(u, b) {
  const date = webDate_(b.date);
  const w = String(b.w || '').trim().slice(0, 40);
  if (!w) throw webErr_('Pilih cuaca.');
  appendRow_('Days', { date: date, weather: w, updated_by: u.name, updated_at: nowStr_() });
  return { weather: w };
}

function apiManpower_(u, b) {
  const list = (b.list || []).map(function (x) {
    return { company: String(x.company || '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 40), count: Math.round(Number(x.count)) };
  }).filter(function (x) { return x.company && isFinite(x.count) && x.count >= 0 && x.count <= 9999; });
  if (!list.length) throw webErr_('Isi sekurang-kurangnya satu syarikat dan bilangan.');
  const date = today_();                     // like /manpower: the list is for today
  list.forEach(function (f) { appendRow_('Manpower', { date: date, company: f.company, count: f.count, updated_by: u.name, updated_at: nowStr_() }); });
  return { date: date, list: list };
}

function apiProgress_(u, b) {
  const c = cat_(String(b.key || ''));
  if (!c || !c.pct_style || c.pct_style === 'none') throw webErr_('Sistem ini tiada %.');
  if (webLinked_(loadData_(), c.key)) throw webErr_(shortCat_(c) + ' ikut dashboard. Ubah status aktiviti di website.');
  const n = Number(b.pct);
  if (String(b.pct) === '' || isNaN(n) || n < 0 || n > 100) throw webErr_('Peratus 0–100.');
  appendRow_('Progress', { date: today_(), category_key: c.key, category: shortCat_(c), percent: Math.round(n), updated_by: u.name, updated_at: nowStr_() });
  return { key: c.key, pct: Math.round(n) };
}

function apiPlan_(u, b) {
  const c = webCheckCat_(b.area, b.cat);
  const date = b.date ? webDate_(b.date, true) : addDays_(today_(), 1);
  if (date <= today_() || date > addDays_(today_(), 3)) throw webErr_('Rancangan untuk esok hingga 3 hari lagi.');
  let text = cleanLine_(String(b.text || '').slice(0, 600));
  const raw = String(b.raw || '').trim().slice(0, 1500);
  if (!text && raw) text = polish_(raw, { mode: 'plan', draft: { area: c.area, catKey: c.key } }) || cleanLine_(raw);
  if (!text) throw webErr_('Tulis rancangan.');
  appendRow_('Plans', { plan_date: date, area: c.area, category_key: c.key, category: shortCat_(c), text: text,
    added_by: u.name, added_at: nowStr_(), deleted: '' });
  return { date: date, text: text };
}

function webDelRow_(tab, row, check) {
  return withLock_(function () {
    const r = rows_(tab).filter(function (x) { return x._row === Number(row); })[0];
    if (!r || r.deleted === 'Y' || !check(r)) return false;
    setCell_(tab, r._row, 'deleted', 'Y');
    return true;
  });
}

function apiPlanDel_(b) {
  if (!webDelRow_('Plans', b.row, function (r) { return String(r.text) === String(b.text); })) throw webErr_('Rancangan tidak dijumpai.');
  return {};
}

function apiMaterial_(u, b) {
  const c = webCheckCat_(b.area, b.cat);
  if (!c.material_header) throw webErr_('Sistem ini tiada senarai bahan.');
  const item = String(b.item || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!item) throw webErr_('Tulis nama bahan.');
  const date = webDate_(b.date);
  appendRow_('Materials', { area: c.area, category_key: c.key, item: item, arrived_date: date, added_by: u.name, added_at: nowStr_(), deleted: '' });
  return { item: item, date: date };
}

function apiMaterialDel_(b) {
  if (!webDelRow_('Materials', b.row, function (r) { return String(r.item) === String(b.item); })) throw webErr_('Bahan tidak dijumpai.');
  return {};
}

// ---------- reports ----------

function apiWa_(b) {
  const date = webDate_(b.date);
  const d = loadData_();
  const warn = [];
  const texts = ['U1', 'U4'].map(function (area) {
    const r = buildWA_(area, date, d);
    r.warn.forEach(function (w) { if (warn.indexOf(w) < 0) warn.push(w); });
    return { area: area, label: AREA_LABEL[area], text: r.text };
  });
  return { date: date, texts: texts, warn: warn };
}

function webPeriod_(b) {
  const days = Number(b.days) === 7 ? 7 : 1;
  const start = b.date ? webDate_(b.date) : (days === 1 ? today_() : addDays_(today_(), -6));
  return { days: days, start: start, end: addDays_(start, days - 1), key: hlKey_(days, start) };
}

function apiHeadline_(b) {
  const P = webPeriod_(b);
  const cur = headlineRow_(P.key);
  if (cur !== null) return { decided: true, text: cur };
  const want = aiOn_() && String(setting_('HEADLINE_AI') || 'Y').toUpperCase() !== 'N';
  let draft = '';
  if (want) { try { draft = draftHeadline_(P.start, P.days); } catch (err) { logErr_('web headline', err); } }
  return { decided: false, draft: draft, ai: want };
}

function apiHeadlineSet_(u, b) {
  const P = webPeriod_(b);
  const t = cleanHeadline_(String(b.text || ''));
  saveHeadline_(P.key, t || '-', u.name + (t && b.ai ? ' (AI)' : '') + ' · web');
  return { text: t };
}

/**
 * Asks the bot to make the PDF, exactly as if this person had typed /report dd/mm/yyyy in Telegram:
 * the update goes to the bot's own webhook (with its secret), so the bot's report engine builds it and
 * sends it to their Telegram chat. Nothing in the bot changes. The app then watches ReportLog for the file.
 */
function apiReport_(u, b) {
  const P = webPeriod_(b);
  if (P.days === 7 && !isEng_(u)) throw webErr_('PDF mingguan untuk engineer sahaja.', 'eng');
  const url = prop_('BOT_WEBAPP_URL');
  const secret = prop_('BOT_WEBHOOK_SECRET');
  if (!url || !secret) throw webErr_('Jana PDF belum disambung (BOT_WEBAPP_URL / BOT_WEBHOOK_SECRET).', 'setup');
  if (!webTelegram_(u)) throw webErr_('PDF dihantar ke Telegram anda, tetapi akaun ini tiada Telegram bot yang diluluskan. Minta engineer jana.', 'notg');
  const since = nowStr_();
  const update = {
    update_id: 'web' + Date.now() + Math.floor(Math.random() * 1000),
    message: {
      message_id: 0, date: Math.floor(Date.now() / 1000), text: (P.days === 1 ? '/report ' : '/weekly ') + dmyLong_(P.start),
      from: { id: Number(u.user_id), is_bot: false, first_name: u.name }, chat: { id: Number(u.user_id), type: 'private' }
    }
  };
  let slow = false;
  try {
    UrlFetchApp.fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 'key=' + encodeURIComponent(secret), {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(update), muteHttpExceptions: true, followRedirects: true
    });
  } catch (err) {
    slow = true;            // UrlFetch gives up after ~60 s; the bot keeps building and still sends the PDF
  }
  return { since: since, slow: slow, start: P.start, days: P.days };
}

function apiReports_(b) {
  const P = webPeriod_(b);
  const docNo = docNo_(settings_(), P.days, P.start, P.end);
  const list = rows_('ReportLog').filter(function (r) { return String(r.doc_no) === docNo; }).map(function (r) {
    return { docNo: docNo, rev: Number(r.rev), at: r.at, by: r.by, theme: r.theme, ready: !!r.pdf_url };
  }).sort(function (a, c) { return c.rev - a.rev; });
  return { docNo: docNo, list: list };
}

function apiPdf_(b) {
  const r = rows_('ReportLog').filter(function (x) { return String(x.doc_no) === String(b.docNo) && Number(x.rev) === Number(b.rev); })[0];
  const m = r && String(r.pdf_url).match(/\/d\/([A-Za-z0-9_-]{20,})/);
  if (!m) throw webErr_('PDF belum siap.');
  const f = DriveApp.getFileById(m[1]);
  return { name: f.getName(), b64: Utilities.base64Encode(f.getBlob().getBytes()), url: r.pdf_url };
}

// ---------- settings (PTW, PIC, time start, sign-off, photo limit) ----------

// The bot's /settings list, plus the PDF photo limit (the bot's PHOTOS_PER_ACTIVITY setting, 0–9).
function webSettingsList_() {
  return EDITABLE_SETTINGS.map(function (s) { return { key: s[0], label: s[1] }; })
    .concat([{ key: 'PHOTOS_PER_ACTIVITY', label: '📷 Had gambar dalam PDF', num: { min: 0, max: PHOTO_MAX } }]);
}

function apiSettings_() {
  return { list: webSettingsList_().map(function (s) {
    return { key: s.key, label: s.label, num: s.num || null,
      value: s.key === 'PHOTOS_PER_ACTIVITY' ? String(photosPerActivity_(settings_())) : setting_(s.key) };
  }) };
}

function apiSettingSet_(u, b) {
  const key = String(b.key || '');
  const def = webSettingsList_().filter(function (s) { return s.key === key; })[0];
  if (!def) throw webErr_('Tetapan ini tidak boleh diubah di sini.');
  let v = String(b.value === undefined ? '' : b.value).replace(/\r\n/g, '\n').slice(0, 3000);
  if (def.num) {
    const n = Number(v.trim());
    if (!/^\d+$/.test(v.trim()) || n < def.num.min || n > def.num.max) throw webErr_('Nombor ' + def.num.min + '–' + def.num.max + '.');
    v = String(n);
  }
  withLock_(function () {
    setSetting_(key, v);
    if (/^PTW_U[14]$/.test(key)) snapshotPtw_(u.name);     // dated PTW history for /weekly, as the bot does
  });
  return { key: key, value: v };
}

// ---------- Telegram: the web-app never talks to Telegram itself ----------
// The copied bot code calls these only to tell engineers about AI errors; here they do nothing.

function send_() { return null; }
function edit_() { return null; }
function tg_() { return { ok: false, description: 'web-app' }; }
