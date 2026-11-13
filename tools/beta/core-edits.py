#!/usr/bin/env python3
"""One-off: turns a copy of app/app.js (1.4.0) into beta/app.js, the core of the 2.0 beta.

The core stays one classic script (the tested 1.4 code), with these changes:
  - channel-aware storage (the beta shares an origin with the live app)
  - new shell: Hari ini (Aktiviti | Data | Laporan) · Papan · + · Tanya · Saya, search in the top bar
  - HOOK / VIEWS / window.HLEP exports, so the feature modules in beta/js/ plug in
Run once on a fresh copy:  cp app/app.js beta/app.js && python3 tools/beta/core-edits.py
Later changes are made in beta/app.js directly.
"""
import re
import sys

P = 'beta/app.js'
s = open(P, encoding='utf-8').read()
if "const APP_VERSION = '1.4.0';" not in s:
    sys.exit('beta/app.js is not a fresh copy of app/app.js 1.4.0')


def rep(old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        sys.exit('expected %d, found %d: %s' % (count, n, old[:90]))
    s = s.replace(old, new)


def rex(pattern, new, flags=re.S):
    global s
    m = re.findall(pattern, s, flags)
    if len(m) != 1:
        sys.exit('regex matched %d times: %s' % (len(m), pattern[:90]))
    s = re.sub(pattern, lambda _m: new, s, count=1, flags=flags)


# ---- E1 version + channel
rep("  const APP_VERSION = '1.4.0';", "  const APP_VERSION = '2.0.0-beta.1';")
rep("  const PHOTO_Q = 0.82;", r"""  const PHOTO_Q = 0.82;
  // Channel: the beta build sits on the same origin as the live app, so its storage is kept apart.
  const CFG = window.HLEP_CONFIG || {};
  const BETA = CFG.channel === 'beta';
  const LSP = BETA ? 'hlepb.' : 'hlep.';""")

# ---- E2 localStorage prefix
rep("localStorage.getItem('hlep.' + k)", "localStorage.getItem(LSP + k)")
rep("localStorage.setItem('hlep.' + k, JSON.stringify(v))", "localStorage.setItem(LSP + k, JSON.stringify(v))")
rep("localStorage.removeItem('hlep.' + k)", "localStorage.removeItem(LSP + k)")

# ---- E3 IndexedDB name + "inbox" store
rep(r"""      const r = indexedDB.open('hlep-dpr', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('outbox', { keyPath: 'cid' }); r.result.createObjectStore('thumbs'); };""",
    r"""      const r = indexedDB.open(BETA ? 'hlep-dpr-beta' : 'hlep-dpr', 2);
      // v2 adds "inbox": photos shared into the app (Android share sheet) wait there for the add-activity sheet
      r.onupgradeneeded = () => {
        const db = r.result;
        [['outbox', { keyPath: 'cid' }], ['thumbs'], ['inbox']].forEach((x) => { if (!db.objectStoreNames.contains(x[0])) db.createObjectStore(x[0], x[1]); });
      };""")

# ---- E4 saved-day tidy-up follows the prefix
rep(r"""const old = Object.keys(localStorage).filter((k) => /^hlep\.day\.\d{4}-\d{2}-\d{2}$/.test(k)).map((k) => k.slice(9)).sort();""",
    r"""const cut = LSP.length + 4;
      const old = Object.keys(localStorage).filter((k) => k.indexOf(LSP + 'day.') === 0 && /^\d{4}-\d{2}-\d{2}$/.test(k.slice(cut))).map((k) => k.slice(cut)).sort();""")

# ---- E5 state
rep("    tab: 'home',\n", "    tab: 'home',\n    seg: 'acts',                           // Hari ini: acts | data | report\n")

# ---- E6 start
rep(r"""  async function start() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});""",
    r"""  async function start() {
    if (window.HLEP.started) return;
    window.HLEP.started = true;
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || CFG.sw)) navigator.serviceWorker.register('sw.js').catch(() => {});""")
rep(r"""    S.tab = (location.hash.replace('#', '') || 'home');
    if (!['home', 'data', 'report', 'me'].includes(S.tab)) S.tab = 'home';""", "    readHash();")

# ---- E7 going home always lands on the activity list
rep("S.tab = 'home'; goHash('home');", "S.tab = 'home'; S.seg = 'acts'; goHash('home');", 3)

# ---- E8 BETA tag on the login brand, E9 video link from config
rep("<div><b>HLEP DPR</b><span>", "<div><b>HLEP DPR' + (BETA ? ' <i class=\"beta-tag\">BETA</i>' : '') + '</b><span>", 2)
rep('href="media/cara-guna.mp4"', """href="' + esc(CFG.video || 'media/cara-guna.mp4') + '\"""", 2)

# ---- E10 shell
rex(r"  // -{20,} shell\n  function render\(\) \{.*?\n  const tabBtn = [^\n]*\n",
    r"""  // ---------------------------------------------------------------- shell (2.0: Hari ini · Papan · + · Tanya · Saya)
  const TABS = ['home', 'board', 'chat', 'me'];
  const HOOK = {};                       // filled by the feature modules in js/ (search, calendar, activity detail, …)
  const VIEWS = {};                      // tab → { render, bind }; "board" and "chat" come from js/board.js and js/chat.js
  function readHash() {
    const h = location.hash.replace('#', '');
    if (h === 'data' || h === 'report') { S.tab = 'home'; S.seg = h; }
    else if (TABS.includes(h)) { S.tab = h; if (h === 'home') S.seg = 'acts'; }
    else S.tab = 'home';
  }
  const hashFor = () => (S.tab === 'home' ? (S.seg === 'acts' ? 'home' : S.seg) : S.tab);
  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) { /* no haptics on this phone */ } };
  const openEntry = (e) => (HOOK.entry ? HOOK.entry(e) : editSheet(e));
  function render() {
    if (!S.session) return;
    if (!$('#shell')) {
      $('#app').innerHTML = '<main class="shell" id="shell"></main><nav class="tabbar" aria-label="Menu"><div class="tabbar-in">' +
        tabBtn('home', 'home', 'Hari ini') + tabBtn('board', 'chart', 'Papan') +
        '<button class="fab" id="fab" aria-label="Tambah aktiviti">' + ic('plus') + '</button>' +
        tabBtn('chat', 'sparkles', 'Tanya') + tabBtn('me', 'user', 'Saya') + '</div></nav>';
      $$('.tab').forEach((b) => { b.onclick = () => { buzz(); go(b.dataset.tab); }; });
      $('#fab').onclick = () => { buzz(); addSheet(); };
    }
    $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    const v = VIEWS[S.tab] || VIEWS.home;
    const shell = $('#shell');
    shell.dataset.tab = S.tab;
    shell.innerHTML = v.render();
    if (v.bind) v.bind();
    renderBadges();
  }
  // A tab or segment change, cross-faded where the browser has View Transitions.
  function go(tab, seg) {
    const same = tab === S.tab && (!seg || seg === S.seg);
    const change = () => { S.tab = tab; if (seg) S.seg = seg; goHash(hashFor()); if (!same) window.scrollTo({ top: 0 }); render(); };
    if (!same && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(change);
    else change();
  }
  window.addEventListener('hashchange', () => { if (!S.session) return; const t = S.tab, g = S.seg; readHash(); if (t !== S.tab || g !== S.seg) render(); });
  const tabBtn = (t, i, l) => '<button class="tab" data-tab="' + t + '">' + ic(i) + '<span>' + l + '</span></button>';
""")

# ---- E11 top bar with search
rex(r"  function topbar\(title\) \{.*?\n  \}\n  function datebar",
    r"""  function topbar(title, sub) {
    const u = S.session.user;
    return '<header class="topbar"><div class="hello"><small>' + esc(title ? (sub || 'HLEP DPR · SJ Chenderoh') : greet() + ',') + '</small><h1>' + esc(title || u.name.split(' ')[0]) + (BETA ? '<i class="beta-tag">BETA</i>' : '') + '</h1></div>' +
      '<div class="top-actions"><button class="iconbtn sm" data-search aria-label="Cari rekod">' + ic('search', 's') + '</button>' +
      '<button class="avatar" data-go="me" aria-label="Profil">' + esc(initials(u.name)) + '</button></div></header>';
  }
  function datebar""")

# ---- E12 setDate at top level; bindCommon
rex(r"  function bindCommon\(\) \{.*?\n  \}\n  function pickDate",
    r"""  function setDate(d) {
    if (!d || d > today()) return;
    S.date = d; useSaved(d);
    const fresh = dayAt[d] && Date.now() - dayAt[d] < 60000;     // fetched a minute ago (e.g. pre-loaded): no new request
    if (!fresh) loadDay(d, false, true).then(() => { if (S.date === d) render(); preload(d); });
    render();
    if (fresh) preload(d);
  }
  function bindCommon() {
    $$('[data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
    $$('[data-search]').forEach((b) => { b.onclick = () => { if (HOOK.search) HOOK.search(); else toast('Carian sedang dimuatkan…', ''); }; });
    const p = $('[data-dprev]'); if (p) p.onclick = () => { buzz(); setDate(addDays(S.date, -1)); };
    const n = $('[data-dnext]'); if (n) n.onclick = () => { buzz(); setDate(addDays(S.date, 1)); };
    const k = $('[data-dpick]'); if (k) k.onclick = () => (HOOK.calendar ? HOOK.calendar(S.date, setDate) : pickDate(S.date, setDate));
  }
  function pickDate""")

# ---- E13 Hari ini = three segments
rep(r"""  function viewHome() {
    const d = S.days[S.date];
    const pend = S.outbox.filter((x) => x.payload.date === dmy(S.date));
    let h = topbar() + datebar();""",
    r"""  function segbar() {
    const d = S.days[S.date];
    const n = d ? d.entries.length + S.outbox.filter((x) => x.payload.date === dmy(S.date)).length : 0;
    const b = (k, label, extra) => '<button class="segb" role="tab" data-seg="' + k + '" aria-selected="' + (S.seg === k) + '">' + label + (extra || '') + '</button>';
    return '<div class="segbar" role="tablist" aria-label="Bahagian hari">' + b('acts', 'Aktiviti', n ? '<i>' + n + '</i>' : '') + b('data', 'Data') + b('report', 'Laporan') + '</div>';
  }
  function viewHome() {
    return topbar() + datebar() + segbar() + (S.seg === 'data' ? dataBody() : S.seg === 'report' ? reportBody() : actsBody());
  }
  function actsBody() {
    const d = S.days[S.date];
    const pend = S.outbox.filter((x) => x.payload.date === dmy(S.date));
    let h = '';""")
rep("    if (d) h += importsCard(d.imports);\n", "    if (d) h += importsCard(d.imports);\n    if (d && HOOK.homeTop) h += HOOK.homeTop(d);\n")

# ---- E14 bindings per segment
rep(r"""  const bind = {};
  bind.home = function () {
    bindCommon();
    const d = S.days[S.date];""",
    r"""  const bind = {};
  bind.home = function () {
    bindCommon();
    $$('[data-seg]').forEach((b) => { b.onclick = () => { buzz(); go('home', b.dataset.seg); }; });
    if (S.seg === 'data') return bindData();
    if (S.seg === 'report') return bindReport();
    bindActs();
  };
  function bindActs() {
    const d = S.days[S.date];""")
rep("$$('[data-entry]').forEach((a) => { a.onclick = () => { const e = d.entries.find((x) => x.id === a.dataset.entry); if (e && e.edit) editSheet(e); }; });",
    "$$('[data-entry]').forEach((a) => { a.onclick = () => { const e = d.entries.find((x) => x.id === a.dataset.entry); if (e) openEntry(e); }; });")
rep("    bindImports(d && d.imports);\n  };", "    bindImports(d && d.imports);\n    if (HOOK.homeBind) HOOK.homeBind(d);\n  }")

# ---- E15 Data segment
rep(r"""  function viewData() {
    const d = S.days[S.date];
    const eng = isEng();
    let h = topbar('Data tapak') + datebar();""",
    r"""  function dataBody() {
    const d = S.days[S.date];
    const eng = isEng();
    let h = '';""")
rep("  bind.data = function () {\n    bindCommon();\n", "  function bindData() {\n")

# ---- E16 Laporan segment
rex(r"  function viewReport\(\) \{\n    const eng = isEng\(\);\n    const u = S\.session\.user;\n    let h = topbar\('Laporan'\) \+ datebar\(\);",
    "  function reportBody() {\n    const eng = isEng();\n    const u = S.session.user;\n    let h = '';")
rep("  bind.report = function () {\n    bindCommon();\n", "  function bindReport() {\n")
rep("if (S.tab === 'report') loadReports(true);", "if (S.tab === 'home' && S.seg === 'report') loadReports(true);")

# ---- E18 add sheet: files can come from the picker, a paste, a drop or the share sheet; modules extend the sheet
rep(r"""    file.onchange = async () => {
      const files = Array.from(file.files || []);
      file.value = '';
      const MAXP = maxPhotos(); const room = MAXP - st.photos.length;""",
    r"""    file.onchange = () => { const files = Array.from(file.files || []); file.value = ''; addFiles(files); };
    const addFiles = async (files) => {
      files = files.filter((f) => /^image\//.test(f.type || '') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name || ''));
      const MAXP = maxPhotos(); const room = MAXP - st.photos.length;""")
rep(r"""      const ad = $('[data-adate]', body); if (ad) ad.onclick = () => { keep(); pickDate(st.date, (v) => { st.date = v; draw(); }, { min: addDays(today(), -60), title: 'Tarikh kerja' }); };
    };""",
    r"""      const ad = $('[data-adate]', body); if (ad) ad.onclick = () => { keep(); pickDate(st.date, (v) => { st.date = v; draw(); }, { min: addDays(today(), -60), title: 'Tarikh kerja' }); };
      if (HOOK.add) HOOK.add({ st, body, L, draw, keep, addFiles });
    };""")
rep("    draw();\n  }\n\n  function newCatSheet", "    draw();\n    if (prefill && prefill.files && prefill.files.length) addFiles(Array.from(prefill.files));\n  }\n\n  function newCatSheet")

# ---- E19 Saya: room for the modules (theme, what's new, beta card, chat preference)
rep("    h += '<div class=\"section-t\"><h2>Akaun</h2></div><div class=\"card\">' +", "    if (HOOK.me) h += HOOK.me();\n    h += '<div class=\"section-t\"><h2>Akaun</h2></div><div class=\"card\">' +")
rep("  bind.me = function () {\n    bindCommon();\n", "  bind.me = function () {\n    bindCommon();\n    if (HOOK.meBind) HOOK.meBind();\n")

# ---- E21 more icons
rep("    telegram: '<path d=\"M21 4 3 11l6 2 2 6 3-4 4 3z\"/><path d=\"m9 13 9-6\"/>'\n  };",
    r"""    telegram: '<path d="M21 4 3 11l6 2 2 6 3-4 4 3z"/><path d="m9 13 9-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
    sparkles: '<path d="M10 3.5 11.6 8 16 9.5 11.6 11 10 15.5 8.4 11 4 9.5 8.4 8z"/><path d="m17.5 13.5.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/>',
    up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    share: '<path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.5"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.6-5.9L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4.5l3 1.8"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    trendUp: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    trendDown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.5-1-1.7-1-3 0-1 .8-2 2-2h2a4 4 0 0 0 4-4c0-3.9-4-7-9-7z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    more: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
    tool: '<path d="M14.5 6.5a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3z"/><path d="m14.5 6.5 3-3"/>',
    gift: '<rect x="3.5" y="9" width="17" height="11" rx="2"/><path d="M3.5 13h17M12 9v11"/><path d="M12 9C10.5 9 8 8.5 8 6.3 8 5 9 4 10 4c1.5 0 2 2 2 5zM12 9c1.5 0 4-.5 4-2.7C16 5 15 4 14 4c-1.5 0-2 2-2 5z"/>'
  };""")

# ---- E17 + E20 views, exports, deferred start
rep("  window.HLEP = { S, api, render, version: APP_VERSION };\n  start();",
    r"""  VIEWS.home = { render: viewHome, bind: () => bind.home() };
  VIEWS.me = { render: viewMe, bind: () => bind.me() };
  const soon = (title) => ({ render: () => topbar(title) + '<div class="skel" style="height:140px;margin-top:8px"></div><div class="skel" style="height:220px;margin-top:12px"></div>', bind: bindCommon });
  VIEWS.board = soon('Papan');
  VIEWS.chat = soon('Tanya DPR');

  // What the feature modules in js/ build on.
  window.HLEP = {
    version: APP_VERSION, beta: BETA, cfg: CFG, started: false, S, HOOK, VIEWS, ICONS, ART, start,
    $, $$, esc, sleep, uid, ls, idb, ic, api, ApiError, toast, openLayer, closeLayer, confirmBox, busy, layers, buzz,
    today, addDays, dmy, hari, niceDate, relDay, hhmm, initials, hourKL, greet, HARI, BULAN,
    isEng, catOf, maxPhotos, statusPill, actCard, topbar, datebar, bindCommon, render, go, setDate, goHash, whenSettled, openEntry,
    loadDay, loadMeta, loadThumbs, viewer, shrink, blobToB64, pickDate, catPicker, refreshImports,
    addSheet, editSheet, matSheet, planSheet, pctSheet, weatherSheet, manpowerSheet, importSheet, pdfImport, pickPdf,
    syncOutbox, queueEntry, refreshOutbox, logout
  };
  if (!window.HLEP_DEFER) start();""")

open(P, 'w', encoding='utf-8').write(s)
print('beta/app.js: core edits applied (%d bytes)' % len(s))
