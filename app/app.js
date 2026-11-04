/* HLEP DPR web-app · vanilla JS, no build step.
 * Talks to the web backend (Apps Script) with POST text/plain JSON: { a, t, ... } → { ok, ... }.
 * Activities are written to an on-phone outbox first (IndexedDB) and sent when there is signal. */
(function () {
  'use strict';

  const APP_VERSION = '1.0.0';
  const TZ = 'Asia/Kuala_Lumpur';
  const MAX_PHOTOS = 9;           // the PDF shows up to 9 per activity (3 × 3)
  const PHOTO_EDGE = 1600;        // longest side after shrinking on the phone
  const PHOTO_Q = 0.82;

  // ---------------------------------------------------------------- tiny helpers
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)).replace(/[^a-z0-9]/g, '');
  const ls = {
    get(k, d) { try { const v = localStorage.getItem('hlep.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('hlep.' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
    del(k) { try { localStorage.removeItem('hlep.' + k); } catch (e) { /* ignore */ } }
  };

  const ymdKL = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d || new Date());
  const hourKL = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date()));
  const today = () => ymdKL();
  const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
  const dmy = (ymd) => { if (!ymd) return ''; const p = String(ymd).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
  const HARI = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
  const BULAN = ['Jan', 'Feb', 'Mac', 'Apr', 'Mei', 'Jun', 'Jul', 'Ogo', 'Sep', 'Okt', 'Nov', 'Dis'];
  const hari = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
  const niceDate = (ymd) => { const p = ymd.split('-'); return Number(p[2]) + ' ' + BULAN[Number(p[1]) - 1] + ' ' + p[0]; };
  const relDay = (ymd) => ymd === today() ? 'Hari ini' : ymd === addDays(today(), -1) ? 'Semalam' : ymd === addDays(today(), 1) ? 'Esok' : hari(ymd);
  const hhmm = (s) => String(s || '').slice(11, 16);
  const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const greet = () => { const h = hourKL(); return h < 12 ? 'Selamat pagi' : h < 15 ? 'Selamat tengah hari' : h < 19 ? 'Selamat petang' : 'Selamat malam'; };

  // ---------------------------------------------------------------- icons (inline SVG, 24×24 line icons)
  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.7 3.7 0 0 1 17.5 18z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    send: '<path d="m4 12 16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5 20 4"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    wifiOff: '<path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.6a10 10 0 0 1 4-2.3M19 12.6a10 10 0 0 0-2.6-1.8M2 9a15 15 0 0 1 4.3-2.7M22 9a15 15 0 0 0-9.6-3.9"/><circle cx="12" cy="20" r=".8"/>',
    sync: '<path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5M4 13a8 8 0 0 0 14.3 4.5L20 15.5"/><path d="M4 4v4.5h4.5M20 20v-4.5h-4.5"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    magic: '<path d="m4 20 11-11M14 4l1 2.5L17.5 7 15 8l-1 2.5L13 8l-2.5-1L13 6z"/><path d="M19 13l.6 1.4L21 15l-1.4.6L19 17l-.6-1.4L17 15l1.4-.6z"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c1.2-3.5 3.6-5 6.5-5s5.3 1.5 6.5 5"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 15.3c1.7.7 2.9 2.2 3.5 4.7"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    box: '<path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5 12 12l8.5-4.5M12 12v9"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M11 18.5h2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    warn: '<path d="M12 3 2 20h20z"/><path d="M12 10v4.5M12 17.5v.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    wa: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.8z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8a4 4 0 0 1-2.1-2.1l.8-1-1-2z"/>',
    telegram: '<path d="M21 4 3 11l6 2 2 6 3-4 4 3z"/><path d="m9 13 9-6"/>'
  };
  const ic = (n, cls) => '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';

  // Pastel illustrations (original, drawn for this app)
  const ART = {
    hero: '<svg class="hero-art" viewBox="0 0 360 200" aria-hidden="true"><defs><linearGradient id="hg1" x1="0" x2="1"><stop offset="0" stop-color="#E7E0FF"/><stop offset="1" stop-color="#FFE3EF"/></linearGradient><linearGradient id="hg2" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#A99BFF"/><stop offset="1" stop-color="#8B7CF6"/></linearGradient></defs>' +
      '<rect x="8" y="22" width="344" height="170" rx="36" fill="url(#hg1)"/><circle cx="300" cy="58" r="22" fill="#FFF1B8"/><g fill="#fff" opacity=".9"><circle cx="70" cy="60" r="14"/><circle cx="88" cy="56" r="18"/><circle cx="108" cy="62" r="12"/></g>' +
      '<rect x="128" y="44" width="104" height="132" rx="16" fill="#fff" stroke="#E2DBFF" stroke-width="3"/><rect x="156" y="34" width="48" height="20" rx="8" fill="url(#hg2)"/>' +
      '<rect x="146" y="74" width="16" height="16" rx="5" fill="#C5EFDD"/><path d="m150 82 3 3 6-6" stroke="#2E9C74" stroke-width="2.6" fill="none" stroke-linecap="round"/><rect x="170" y="78" width="46" height="8" rx="4" fill="#E2DBFF"/>' +
      '<rect x="146" y="102" width="16" height="16" rx="5" fill="#FFDDC4"/><rect x="170" y="106" width="38" height="8" rx="4" fill="#E2DBFF"/>' +
      '<rect x="146" y="130" width="16" height="16" rx="5" fill="#EFEBFF"/><rect x="170" y="134" width="44" height="8" rx="4" fill="#E2DBFF"/>' +
      '<g transform="translate(232 104)"><path d="M10 40c0-22 14-36 32-36s32 14 32 36z" fill="#FFD27A"/><rect x="2" y="38" width="80" height="12" rx="6" fill="#F7B955"/><rect x="38" y="2" width="8" height="20" rx="4" fill="#F7B955"/></g>' +
      '<g transform="translate(46 112)"><rect width="62" height="62" rx="16" fill="#CDE3FF"/><path d="M34 12 20 34h11l-3 16 15-22H32z" fill="#3672C9"/></g></svg>',
    empty: '<svg class="art" viewBox="0 0 120 96" aria-hidden="true"><rect x="6" y="14" width="108" height="76" rx="22" fill="#EFEBFF"/><rect x="30" y="6" width="60" height="76" rx="12" fill="#fff" stroke="#E2DBFF" stroke-width="2.5"/><rect x="42" y="22" width="36" height="6" rx="3" fill="#E2DBFF"/><rect x="42" y="36" width="28" height="6" rx="3" fill="#E2DBFF"/><circle cx="84" cy="66" r="16" fill="url(#eg)"/><defs><linearGradient id="eg" x1="0" x2="1"><stop offset="0" stop-color="#8B7CF6"/><stop offset="1" stop-color="#F49CC4"/></linearGradient></defs><path d="M84 58v16M76 66h16" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>'
  };

  // ---------------------------------------------------------------- IndexedDB (outbox + thumbnail cache)
  const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('hlep-dpr', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('outbox', { keyPath: 'cid' }); r.result.createObjectStore('thumbs'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const tx = async (store, mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(store, mode);
        fn(t.objectStore(store));
        t.oncomplete = () => res();
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      });
    };
    const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    return {
      async all(store) { const db = await open(); return req(db.transaction(store).objectStore(store).getAll()); },
      async get(store, k) { const db = await open(); return req(db.transaction(store).objectStore(store).get(k)); },
      put(store, v, k) { return tx(store, 'readwrite', (s) => (k === undefined ? s.put(v) : s.put(v, k))); },
      del(store, k) { return tx(store, 'readwrite', (s) => s.delete(k)); },
      clear(store) { return tx(store, 'readwrite', (s) => s.clear()); }
    };
  })();

  // ---------------------------------------------------------------- state
  const S = {
    api: (window.HLEP_CONFIG && window.HLEP_CONFIG.api) || ls.get('api', '') || '',
    session: ls.get('session', null),     // { token, user }
    meta: ls.get('meta', null),
    date: today(),
    days: {},                              // ymd → day payload
    tab: 'home',
    outbox: [],
    thumbs: new Map(),
    syncing: false,
    online: navigator.onLine,
    notices: ls.get('notices', []),        // duplicate questions waiting for an answer
    install: null
  };
  const q = new URLSearchParams(location.search);
  if (q.get('api')) { S.api = q.get('api'); ls.set('api', S.api); history.replaceState(null, '', location.pathname + location.hash); }
  const isEng = () => !!(S.session && S.session.user && S.session.user.eng);

  // ---------------------------------------------------------------- API
  class ApiError extends Error { constructor(m, code, net) { super(m); this.code = code || ''; this.net = !!net; } }
  async function api(a, body, opt) {
    opt = opt || {};
    if (!S.api) throw new ApiError('Alamat backend belum ditetapkan.', 'noapi');
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), opt.timeout || 60000);
    let res;
    try {
      res = await fetch(S.api, {
        method: 'POST', redirect: 'follow', signal: ctl.signal,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ a, t: S.session ? S.session.token : '' }, body || {}))
      });
    } catch (e) {
      clearTimeout(to);
      throw new ApiError(e.name === 'AbortError' ? 'Talian terlalu perlahan. Cuba lagi.' : 'Tiada internet.', 'net', true);
    }
    clearTimeout(to);
    let j;
    try { j = await res.json(); } catch (e) { throw new ApiError('Jawapan pelayan tidak sah (' + res.status + ').', 'bad', res.status >= 500); }
    if (!j.ok) {
      if (j.code === 'auth' && a !== 'login') { logout(true); }
      throw new ApiError(j.err || 'Ralat.', j.code);
    }
    return j;
  }

  // ---------------------------------------------------------------- toasts, layers, history
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = '<span class="ic">' + ic(kind === 'bad' ? 'warn' : kind === 'ok' ? 'check' : 'spark', 's') + '</span><span>' + esc(msg) + '</span>';
    $('#toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, kind === 'bad' ? 4200 : 2600);
  }

  const layers = [];
  function openLayer(html, opt) {
    opt = opt || {};
    const wrap = document.createElement('div');
    wrap.className = 'lay';
    wrap.innerHTML = opt.raw ? html : '<div class="scrim"></div><div class="sheet ' + (opt.full ? 'full' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opt.title || '') + '"><div class="grab"></div>' +
      '<div class="sheet-h"><h2>' + esc(opt.title || '') + '</h2><button class="x" data-close aria-label="Tutup">' + ic('x', 's') + '</button></div>' +
      '<div class="sheet-b">' + html + '</div>' + (opt.foot ? '<div class="sheet-f">' + opt.foot + '</div>' : '') + '</div>';
    $('#layer').appendChild(wrap);
    const L = { el: wrap, onClose: opt.onClose, closed: false };
    layers.push(L);
    history.pushState({ layer: layers.length }, '');
    wrap.addEventListener('click', (e) => { if (e.target.matches('.scrim') || e.target.closest('[data-close]')) closeLayer(); });
    setTimeout(() => { const f = wrap.querySelector('[autofocus]'); if (f && window.innerWidth > 899) f.focus(); }, 300);
    return L;
  }
  function closeLayer(fromPop) {
    const L = layers.pop();
    if (!L || L.closed) return;
    L.closed = true;
    L.el.classList.add('closing');
    setTimeout(() => L.el.remove(), 220);
    if (L.onClose) L.onClose();
    if (!fromPop) history.back();
  }
  window.addEventListener('popstate', () => { if (layers.length) closeLayer(true); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && layers.length) closeLayer(); });

  function confirmBox(title, text, yes, kind) {
    return new Promise((res) => {
      let done = false;
      const L = openLayer('<p class="muted" style="margin:0 4px 6px">' + text + '</p>', {
        title,
        foot: '<div class="btn-row"><button class="btn ghost" data-no>Batal</button><button class="btn ' + (kind || 'primary') + '" data-yes>' + esc(yes) + '</button></div>',
        onClose: () => { if (!done) res(false); }
      });
      $('[data-yes]', L.el).onclick = () => { done = true; res(true); closeLayer(); };
      $('[data-no]', L.el).onclick = () => closeLayer();
    });
  }

  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (label ? '<span>' + esc(label) + '</span>' : ''); }
    else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
  }

  // ---------------------------------------------------------------- photos
  async function shrink(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) {
      bmp = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('Gambar tidak dapat dibaca.')); im.src = URL.createObjectURL(file); });
    }
    const w = bmp.width, h = bmp.height;
    const k = Math.min(1, PHOTO_EDGE / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', PHOTO_Q));
    const t = document.createElement('canvas');
    const tk = 360 / Math.max(w, h);
    t.width = Math.round(w * tk); t.height = Math.round(h * tk);
    t.getContext('2d').drawImage(bmp, 0, 0, t.width, t.height);
    if (bmp.close) bmp.close();
    return { blob, thumb: t.toDataURL('image/jpeg', 0.75), taken: file.lastModified || Date.now() };
  }
  const blobToB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });

  async function loadThumbs(ids) {
    const need = [];
    for (const id of ids) {
      if (S.thumbs.has(id)) continue;
      const hit = await idb.get('thumbs', id).catch(() => null);
      if (hit) S.thumbs.set(id, hit); else need.push(id);
    }
    for (let i = 0; i < need.length; i += 12) {
      try {
        const r = await api('thumbs', { ids: need.slice(i, i + 12) });
        Object.keys(r.thumbs).forEach((id) => { if (r.thumbs[id]) { S.thumbs.set(id, r.thumbs[id]); idb.put('thumbs', r.thumbs[id], id).catch(() => {}); } });
      } catch (e) { break; }
    }
    $$('img[data-thumb]').forEach((im) => { const s = S.thumbs.get(im.dataset.thumb); if (s && im.src !== s) im.src = s; });
  }

  function viewer(ids, start, localSrc) {
    let i = start || 0;
    const L = openLayer('<div class="viewer"><div class="vh"><span data-n></span><button class="x" data-close aria-label="Tutup">' + ic('x') + '</button></div>' +
      '<div class="vb"><img alt="Gambar kerja"></div><div class="nav"><button class="btn ghost sm" data-p>' + ic('left', 's') + '</button><button class="btn ghost sm" data-nx>' + ic('right', 's') + '</button></div></div>', { raw: true });
    const img = $('img', L.el);
    const show = async () => {
      $('[data-n]', L.el).textContent = (i + 1) + ' / ' + ids.length;
      const id = ids[i];
      img.src = (localSrc && localSrc[i]) || S.thumbs.get(id) || '';
      if (!localSrc) { try { const r = await api('photo', { id }); if (ids[i] === id) img.src = r.src; } catch (e) { /* keep the thumbnail */ } }
    };
    $('[data-p]', L.el).onclick = () => { i = (i + ids.length - 1) % ids.length; show(); };
    $('[data-nx]', L.el).onclick = () => { i = (i + 1) % ids.length; show(); };
    if (ids.length < 2) $('.nav', L.el).style.visibility = 'hidden';
    show();
  }

  // ---------------------------------------------------------------- outbox (offline first)
  async function refreshOutbox() { S.outbox = (await idb.all('outbox').catch(() => [])).sort((a, b) => a.created - b.created); }

  async function queueEntry(item) {
    await idb.put('outbox', item);
    await refreshOutbox();
    render();
    syncOutbox();
  }

  async function syncOutbox() {
    if (S.syncing || !S.session) return;
    if (!navigator.onLine) { S.online = false; return; }
    S.syncing = true;
    renderBadges();
    let sent = 0;
    try {
      await refreshOutbox();
      for (const it of S.outbox) {
        if (it.hold) continue;
        try {
          for (const p of it.photos) {
            if (p.id) continue;
            const r = await api('upload', { cid: p.cid, date: it.payload.date, mime: 'image/jpeg', b64: await blobToB64(p.blob), taken: p.taken }, { timeout: 90000 });
            p.id = r.id;
            S.thumbs.set(r.id, p.thumb);
            idb.put('thumbs', p.thumb, r.id).catch(() => {});
            await idb.put('outbox', it);
          }
          const r = await api('save', Object.assign({}, it.payload, { cid: it.cid, photos: it.photos.map((p) => p.id) }), { timeout: 90000 });
          await idb.del('outbox', it.cid);
          sent++;
          if (r.dup) { S.notices.push({ mine: r.id, text: r.text, dup: r.dup, date: it.payload.date }); ls.set('notices', S.notices); }
        } catch (e) {
          if (e.net || e.code === 'auth') throw e;
          it.err = e.message; it.tries = (it.tries || 0) + 1; it.hold = true;
          await idb.put('outbox', it);
          toast('Tidak dapat dihantar: ' + e.message, 'bad');
        }
      }
    } catch (e) {
      if (e.net) S.online = false;
    } finally {
      S.syncing = false;
      await refreshOutbox();
      if (sent) {
        toast(sent === 1 ? 'Aktiviti dihantar ✓' : sent + ' aktiviti dihantar ✓', 'ok');
        delete S.days[S.date];
        await loadDay(S.date, true);
      }
      render();
      showNotice();
    }
  }
  window.addEventListener('online', () => { S.online = true; render(); syncOutbox(); });
  window.addEventListener('offline', () => { S.online = false; render(); });
  setInterval(() => { if (S.outbox.some((x) => !x.hold)) syncOutbox(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { syncOutbox(); if (S.session) loadDay(S.date, true).then(render); } });

  function showNotice() {
    if (!S.notices.length || layers.length) return;
    const n = S.notices[0];
    const L = openLayer(
      '<div class="banner butter">' + ic('warn') + '<div class="grow"><b>Aktiviti ini mungkin sudah dihantar</b>Adakah ini kerja yang sama?</div></div>' +
      '<div class="card" style="margin-top:12px"><div class="muted" style="font-size:12.5px;font-weight:700;margin-bottom:4px">🆕 ANDA</div><div style="font-weight:700">' + esc(n.text) + '</div></div>' +
      '<div class="card"><div class="muted" style="font-size:12.5px;font-weight:700;margin-bottom:4px">📌 ' + esc(n.dup.who) + ' · ' + esc(n.dup.at) + ' · ' + esc(n.dup.label) + (n.dup.photos ? ' · 📷 ' + n.dup.photos : '') + '</div><div style="font-weight:700">' + esc(n.dup.text) + '</div></div>',
      { title: 'Semak pendua', foot: '<div class="stack"><button class="btn danger block" data-y>' + ic('trash', 's') + ' Ya, sama – padam entri &amp; gambar saya</button><button class="btn ghost block" data-n>Bukan, kerja lain – simpan</button></div>',
        onClose: () => { S.notices.shift(); ls.set('notices', S.notices); setTimeout(showNotice, 300); } });
    $('[data-y]', L.el).onclick = async (e) => { const btn = e.currentTarget;
      busy(btn, true);
      try { const r = await api('remove', { id: n.mine }); toast('Entri anda' + (r.photos ? ' dan ' + r.photos + ' gambar' : '') + ' dipadam.', 'ok'); delete S.days[n.date]; await loadDay(S.date, true); render(); }
      catch (err) { toast(err.message, 'bad'); }
      closeLayer();
    };
    $('[data-n]', L.el).onclick = () => { toast('OK – kedua-dua disimpan.', 'ok'); closeLayer(); };
  }

  // ---------------------------------------------------------------- data loading
  async function loadMeta() {
    const m = await api('meta');
    S.meta = m; ls.set('meta', m);
    S.session.user = m.user; ls.set('session', S.session);
    return m;
  }
  async function loadDay(date, quiet) {
    try {
      const d = await api('day', { date: dmy(date) });
      S.days[date] = d;
      ls.set('day.' + date, d);
      return d;
    } catch (e) {
      if (!S.days[date]) { const c = ls.get('day.' + date, null); if (c) S.days[date] = Object.assign(c, { stale: true }); }
      if (!quiet && !e.net) toast(e.message, 'bad');
      return S.days[date] || null;
    }
  }
  const catOf = (key) => (S.meta && S.meta.cats.find((c) => c.key === key)) || null;

  // ---------------------------------------------------------------- boot & login
  async function start() {
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.install = e; });
    await refreshOutbox();
    if (!S.api) return renderSetup();
    if (!S.session) return renderLogin();
    S.tab = (location.hash.replace('#', '') || 'home');
    if (!['home', 'data', 'report', 'me'].includes(S.tab)) S.tab = 'home';
    render();
    try { await loadMeta(); } catch (e) { if (!S.meta) { toast(e.message, 'bad'); } }
    await loadDay(S.date, true);
    render();
    syncOutbox();
  }

  function renderSetup() {
    $('#app').innerHTML = '<div class="login"><div class="brand"><img src="icons/icon-192.png" alt=""><div><b>HLEP DPR</b><span>Sediakan web-app</span></div></div>' +
      '<div><div class="hero"><h1>Sambung ke <em>backend</em></h1><p>Tampal alamat Web app (berakhir dengan <b>/exec</b>) dari Apps Script → Deploy → Manage deployments.</p></div>' +
      '<div class="card"><div class="field"><label for="apiu">Alamat backend</label><input id="apiu" class="input" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec"></div>' +
      '<button class="btn primary block" style="margin-top:16px" id="apis">Sambung</button><p class="hint">Hanya engineer perlu buat sekali. Pasukan boleh terus guna pautan yang dikongsi.</p></div></div></div>';
    $('#apis').onclick = async (e) => { const btn = e.currentTarget;
      const u = $('#apiu').value.trim();
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(u)) return toast('Alamat mesti bermula https://script.google.com/macros/s/ dan berakhir /exec', 'bad');
      S.api = u; busy(btn, true);
      try { await api('boot'); ls.set('api', u); renderLogin(); } catch (err) { S.api = ''; busy(btn, false); toast(err.message, 'bad'); }
    };
  }

  async function renderLogin(pick) {
    const last = ls.get('lastUser', null);
    $('#app').innerHTML = '<div class="login"><div class="brand"><img src="icons/icon-192.png" alt=""><div><b>HLEP DPR</b><span>SJ Chenderoh · Elektrik</span></div></div>' +
      '<div class="rise"><div class="hero"><h1>Laporan harian,<br><em>semudah snap &amp; hantar.</em></h1><p>Ambil gambar, pilih sistem, tulis ringkas. AI susun ayat dalam English.</p></div>' + ART.hero + '</div>' +
      '<div id="who" class="rise" style="animation-delay:.08s"><div class="section-t"><h2>Siapa anda?</h2><span id="teamn"></span></div><div class="people" id="people">' +
      '<div class="skel" style="height:64px"></div><div class="skel" style="height:64px"></div><div class="skel" style="height:64px"></div><div class="skel" style="height:64px"></div></div></div></div>';
    let team = ls.get('team', []);
    const draw = () => {
      $('#teamn').textContent = team.length ? team.length + ' orang' : '';
      $('#people').innerHTML = team.map((p) => '<button class="person" data-id="' + esc(p.id) + '"' + (p.pin ? '' : ' data-nopin') + '><span class="avatar">' + esc(initials(p.name)) + '</span><span class="grow"><b>' + esc(p.name) + '</b><small>' + (p.role === 'eng' ? 'Engineer' : 'Juruteknik') + (p.pin ? '' : ' · tiada PIN') + '</small></span></button>').join('') ||
        '<p class="muted">Tiada nama lagi. Engineer: isi tab <b>WebUsers</b> dalam Google Sheet.</p>';
      $$('.person').forEach((b) => { b.onclick = () => { const p = team.find((x) => x.id === b.dataset.id); if (!p.pin) return toast('PIN belum ditetapkan. Minta engineer isi PIN anda.', 'bad'); renderPin(p); }; });
    };
    if (team.length) draw();
    try { const r = await api('boot'); team = r.team; ls.set('team', team); draw(); } catch (e) { if (!team.length) $('#people').innerHTML = '<div class="banner rose">' + ic('wifiOff') + '<div class="grow"><b>Tidak dapat sambung</b>' + esc(e.message) + '</div></div>'; }
    const p = pick || (last && team.find((x) => x.id === last && x.pin));
    if (p) renderPin(p);
  }

  function renderPin(p) {
    let pin = '';
    const box = $('#who');
    const lg = $('.login'); if (lg) lg.classList.add('pinning');
    box.innerHTML = '<div class="card pin-wrap rise"><span class="avatar lg" style="margin:4px auto 10px">' + esc(initials(p.name)) + '</span><h3 style="font-size:18px">' + esc(p.name) + '</h3><p class="muted">Masukkan PIN anda</p>' +
      '<div class="pin-dots" id="dots">' + '<i></i>'.repeat(4) + '</div><div class="pad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => '<button data-k="' + n + '">' + n + '</button>').join('') +
      '<button class="fn" data-k="back">Tukar</button><button data-k="0">0</button><button class="fn" data-k="del" aria-label="Padam">⌫</button></div></div>';
    const dots = () => { $$('#dots i').forEach((d, i) => d.classList.toggle('on', i < pin.length)); };
    const go = async () => {
      $('#dots').innerHTML = '<span class="spin"></span>';
      try {
        const r = await api('login', { id: p.id, pin });
        S.session = { token: r.token, user: r.user }; ls.set('session', S.session); ls.set('lastUser', p.id);
        toast('Selamat datang, ' + r.user.name.split(' ')[0] + '!', 'ok');
        S.tab = 'home'; location.hash = 'home';
        render();
        await loadMeta(); await loadDay(S.date, true); render(); syncOutbox();
      } catch (e) {
        pin = '';
        $('#dots').innerHTML = '<i></i>'.repeat(4);
        $('#dots').classList.add('shake'); setTimeout(() => $('#dots') && $('#dots').classList.remove('shake'), 450);
        toast(e.message, 'bad');
      }
    };
    $$('.pad button', box).forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.k;
        if (k === 'back') { ls.del('lastUser'); return renderLogin(); }
        if (k === 'del') pin = pin.slice(0, -1);
        else if (pin.length < 8) pin += k;
        dots();
        if (pin.length === 4) go();
      };
    });
  }

  function logout(expired) {
    if (S.session && !expired) api('logout').catch(() => {});
    S.session = null; ls.del('session');
    while (layers.length) closeLayer(true);
    if (expired) toast('Sesi tamat. Sila log masuk semula.', 'bad');
    renderLogin();
  }

  // ---------------------------------------------------------------- shell
  function render() {
    if (!S.session) return;
    if (!$('#shell')) {
      $('#app').innerHTML = '<main class="shell" id="shell"></main><nav class="tabbar" aria-label="Menu"><div class="tabbar-in">' +
        tabBtn('home', 'home', 'Hari ini') + tabBtn('data', 'grid', 'Data') +
        '<button class="fab" id="fab" aria-label="Tambah aktiviti">' + ic('plus') + '</button>' +
        tabBtn('report', 'file', 'Laporan') + tabBtn('me', 'user', 'Saya') + '</div></nav>';
      $$('.tab').forEach((b) => { b.onclick = () => { S.tab = b.dataset.tab; location.hash = S.tab; window.scrollTo({ top: 0 }); render(); }; });
      $('#fab').onclick = () => addSheet();
    }
    $$('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
    const views = { home: viewHome, data: viewData, report: viewReport, me: viewMe };
    $('#shell').innerHTML = (views[S.tab] || viewHome)();
    bind[S.tab] && bind[S.tab]();
    renderBadges();
  }
  window.addEventListener('hashchange', () => { const t = location.hash.replace('#', ''); if (S.session && ['home', 'data', 'report', 'me'].includes(t) && t !== S.tab) { S.tab = t; render(); } });
  const tabBtn = (t, i, l) => '<button class="tab" data-tab="' + t + '">' + ic(i) + '<span>' + l + '</span></button>';
  function renderBadges() {
    const me = $('.tab[data-tab="me"]');
    if (!me) return;
    const n = S.outbox.length;
    let b = $('.badge', me);
    if (n && !b) { b = document.createElement('span'); b.className = 'badge'; me.appendChild(b); }
    if (b) { if (n) b.textContent = n; else b.remove(); }
  }

  function topbar(title) {
    const u = S.session.user;
    return '<header class="topbar"><div class="hello"><small>' + esc(title ? 'HLEP DPR · SJ Chenderoh' : greet() + ',') + '</small><h1>' + esc(title || u.name.split(' ')[0]) + '</h1></div>' +
      '<button class="avatar" data-go="me" aria-label="Profil">' + esc(initials(u.name)) + '</button></header>';
  }
  function datebar() {
    return '<div class="datebar"><button class="iconbtn" data-dprev aria-label="Hari sebelum">' + ic('left') + '</button>' +
      '<button class="datepill" data-dpick><span class="ic">' + ic('cal', 's') + '</span><span class="grow"><span class="d">' + esc(relDay(S.date)) + ' · ' + esc(dmy(S.date)) + '</span><br><span class="w">' + esc(hari(S.date) + ', ' + niceDate(S.date)) + '</span></span></button>' +
      '<button class="iconbtn" data-dnext aria-label="Hari seterusnya"' + (S.date >= today() ? ' disabled' : '') + '>' + ic('right') + '</button></div>';
  }
  function bindCommon() {
    $$('[data-go]').forEach((b) => { b.onclick = () => { S.tab = b.dataset.go; location.hash = S.tab; render(); }; });
    const setDate = async (d) => { if (d > today()) return; S.date = d; render(); await loadDay(d); render(); };
    const p = $('[data-dprev]'); if (p) p.onclick = () => setDate(addDays(S.date, -1));
    const n = $('[data-dnext]'); if (n) n.onclick = () => setDate(addDays(S.date, 1));
    const k = $('[data-dpick]'); if (k) k.onclick = () => pickDate(S.date, setDate);
  }
  function pickDate(cur, cb, opt) {
    opt = opt || {};
    const max = opt.max || today();
    const L = openLayer('<div class="field"><label for="dp">Tarikh</label><input type="date" id="dp" class="input" value="' + cur + '" max="' + max + '"' + (opt.min ? ' min="' + opt.min + '"' : '') + '></div>' +
      '<div class="chips" style="margin-top:14px">' + (opt.quick || [['Hari ini', today()], ['Semalam', addDays(today(), -1)], ['2 hari lepas', addDays(today(), -2)]]).map((x) => '<button class="chip" data-q="' + x[1] + '">' + esc(x[0]) + '</button>').join('') + '</div>',
    { title: opt.title || 'Pilih tarikh', foot: '<button class="btn primary block" data-ok>Pilih</button>' });
    const done = (v) => { if (!v) return; closeLayer(); cb(v); };
    $$('[data-q]', L.el).forEach((b) => { b.onclick = () => done(b.dataset.q); });
    $('[data-ok]', L.el).onclick = () => done($('#dp', L.el).value);
  }

  // ---------------------------------------------------------------- HOME
  function viewHome() {
    const d = S.days[S.date];
    const pend = S.outbox.filter((x) => x.payload.date === dmy(S.date));
    let h = topbar() + datebar();
    if (!S.online) h += '<div class="banner lav">' + ic('wifiOff') + '<div class="grow"><b>Tiada internet</b>Anda masih boleh tambah aktiviti. Ia dihantar bila ada signal.</div></div>';
    if (S.outbox.length) h += '<div class="banner butter" data-go="me">' + (S.syncing ? '<span class="spin"></span>' : ic('sync')) + '<div class="grow"><b>' + S.outbox.length + ' aktiviti menunggu dihantar</b>' + (S.syncing ? 'Sedang menghantar…' : 'Tekan untuk lihat') + '</div></div>';
    if (d && d.stale) h += '<div class="banner lav">' + ic('clock') + '<div class="grow">Paparan terakhir (tiada sambungan).</div></div>';
    const list = d ? d.entries : [];
    const nPhotos = list.reduce((n, e) => n + e.photos.length, 0) + pend.reduce((n, e) => n + e.photos.length, 0);
    h += '<div class="cols"><div>';
    h += '<div class="stats" style="margin-top:4px"><div class="stat lav"><span class="ic">' + ic('flag', 's') + '</span><span class="n">' + (d ? list.length + pend.length : '–') + '</span><span class="l">Aktiviti</span></div>' +
      '<div class="stat mint"><span class="ic">' + ic('image', 's') + '</span><span class="n">' + (d ? nPhotos : '–') + '</span><span class="l">Gambar</span></div>' +
      '<button class="stat peach" data-weather><span class="ic">' + ic(/rain/i.test(d && d.weather) ? 'cloud' : 'sun', 's') + '</span><span class="n sm">' + esc((d && d.weather) || 'Tetapkan') + '</span><span class="l">Cuaca</span></button></div>';
    if (!d) {
      h += '<div class="skel" style="height:120px;margin-top:22px"></div><div class="skel" style="height:120px;margin-top:10px"></div>';
    } else if (!list.length && !pend.length) {
      h += '<div class="card empty rise" style="margin-top:18px">' + ART.empty + '<h3>Belum ada aktiviti</h3><p>' + (S.date === today() ? 'Tekan butang + untuk tambah kerja hari ini bersama gambar.' : 'Tiada aktiviti untuk ' + esc(dmy(S.date)) + '.') + '</p>' +
        '<button class="btn primary" style="margin-top:16px" data-add>' + ic('camera', 's') + ' Tambah aktiviti</button></div>';
    } else {
      ['U1', 'U4'].forEach((area) => {
        const mine = list.filter((e) => e.area === area);
        const pa = pend.filter((x) => x.payload.area === area);
        if (!mine.length && !pa.length) return;
        h += '<div class="unit-h"><span class="tag ' + area + '">' + (area === 'U1' ? 'UNIT 1' : 'UNIT 4') + '</span><h2>' + (area === 'U1' ? 'Common / General' : 'Unit 4') + '</h2><span>' + (mine.length + pa.length) + '</span></div>';
        pa.forEach((x) => { h += pendingCard(x); });
        let sys = '';
        mine.forEach((e) => {
          if (e.catLabel !== sys) { sys = e.catLabel; h += '<div class="sys-h">' + esc(sys) + '</div>'; }
          h += actCard(e);
        });
      });
    }
    h += '</div><aside class="side">' + (window.innerWidth > 899 ? homeSide(d) : '') + '</aside></div>';
    return h;
  }
  function homeSide(d) {
    if (!d) return '';
    let h = '<div class="section-t" style="margin-top:4px"><h2>Ringkasan</h2></div><div class="card">';
    h += d.progress.map((p) => '<div class="pct-row"><div class="top"><b>' + esc(p.label) + '</b>' + (p.linked ? '<span class="pill wait">' + ic('link', 'xs') + ' dashboard</span>' : '') + '<span class="v">' + (p.pct == null ? '?' : p.pct) + '%</span></div><div class="bar"><i style="width:' + (p.pct || 0) + '%"></i></div></div>').join('');
    h += '</div><div class="card"><h3>Tenaga kerja</h3>' + (d.manpower.list.length ? d.manpower.list.map((m) => '<div class="row" style="justify-content:space-between;padding:6px 0"><span>' + esc(m.company) + '</span><b>' + esc(m.count) + '</b></div>').join('') : '<p>—</p>') + '</div>';
    return h;
  }
  const ST_TXT = { NS: 'Belum mula', IP: 'Sedang dibuat', CP: 'Siap' };
  function statusPill(s) { return '<span class="pill ' + esc(s) + '"><span class="dot"></span>' + esc(s) + ' · ' + (ST_TXT[s] || '') + '</span>'; }
  function actCard(e) {
    const ph = e.photos.slice(0, 3).map((id, i) => '<span class="ph"><img data-thumb="' + esc(id) + '" alt="" ' + (S.thumbs.get(id) ? 'src="' + S.thumbs.get(id) + '"' : '') + '>' +
      (i === 2 && e.photos.length > 3 ? '<span class="more">+' + (e.photos.length - 3) + '</span>' : '') + '</span>').join('');
    return '<article class="act rise" data-entry="' + esc(e.id) + '"><div class="meta">' + statusPill(e.status) + (e.shift === 'N' ? '<span class="pill N">' + ic('moon', 'xs') + ' Malam</span>' : '') +
      (e.src === 'contractor' ? '<span class="pill wait">📄 kontraktor</span>' : '') + '</div>' +
      '<div class="txt">' + esc(e.text) + '</div>' + (ph ? '<div class="strip" data-photos="' + esc(e.id) + '">' + ph + '</div>' : '') +
      '<div class="by">' + ic('user', 'xs') + esc(e.who) + ' · ' + esc(hhmm(e.at)) + (e.src === 'web' ? ' · web' : e.src === 'merged' ? ' · digabung' : ' · Telegram') + '</div>' +
      (e.edit ? '<button class="edit" data-edit="' + esc(e.id) + '" aria-label="Ubah">' + ic('edit', 's') + '</button>' : '') + '</article>';
  }
  function pendingCard(x) {
    const c = catOf(x.payload.cat);
    const ph = x.photos.slice(0, 3).map((p) => '<span class="ph"><img src="' + p.thumb + '" alt=""></span>').join('');
    return '<article class="act pending' + (x.hold ? ' err' : '') + '"><div class="meta">' + statusPill(x.payload.status) + (x.payload.shift === 'N' ? '<span class="pill N">' + ic('moon', 'xs') + ' Malam</span>' : '') +
      (x.hold ? '<span class="pill bad">' + ic('warn', 'xs') + ' gagal</span>' : '<span class="pill wait">' + (S.syncing ? '<span class="spin" style="width:12px;height:12px;border-width:2px"></span>' : ic('clock', 'xs')) + ' menunggu</span>') + '</div>' +
      '<div class="sys-h" style="margin:0 0 4px">' + esc(c ? c.label : x.payload.cat) + '</div><div class="txt">' + esc(x.payload.text || x.payload.raw) + '</div>' + (ph ? '<div class="strip">' + ph + '</div>' : '') +
      (x.hold ? '<div class="by" style="color:var(--rose)">' + esc(x.err) + '</div>' : '') + '</article>';
  }

  const bind = {};
  bind.home = function () {
    bindCommon();
    const d = S.days[S.date];
    $$('[data-add]').forEach((b) => { b.onclick = () => addSheet(); });
    const w = $('[data-weather]'); if (w) w.onclick = () => weatherSheet();
    $$('[data-edit]').forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); editSheet(d.entries.find((e) => e.id === b.dataset.edit)); }; });
    $$('[data-photos]').forEach((s) => { s.onclick = (ev) => { ev.stopPropagation(); const e = d.entries.find((x) => x.id === s.dataset.photos); const i = $$('.ph', s).indexOf(ev.target.closest('.ph')); viewer(e.photos, Math.max(0, i)); }; });
    $$('[data-entry]').forEach((a) => { a.onclick = () => { const e = d.entries.find((x) => x.id === a.dataset.entry); if (e && e.edit) editSheet(e); }; });
    if (d) loadThumbs([].concat(...d.entries.map((e) => e.photos.slice(0, 3))));
  };

  // ---------------------------------------------------------------- ADD ACTIVITY
  function addSheet(prefill) {
    if (!S.meta) return toast('Sedang memuat… cuba sebentar lagi.', 'bad');
    const last = ls.get('lastPick', null);
    const st = Object.assign({ photos: [], area: '', cat: '', status: '', shift: 'D', raw: '', text: '', date: S.date <= today() ? S.date : today(), aiDone: false }, prefill || {});
    if (st.date === today() && hourKL() < 7 && st.shift === 'N') st.date = addDays(today(), -1);
    const L = openLayer('<div id="addb"></div>', { title: 'Aktiviti baru', full: true, foot: '<button class="btn primary block" id="addgo">' + ic('check', 's') + ' Semak &amp; simpan</button>' });
    const body = $('#addb', L.el);
    const file = document.createElement('input');
    file.type = 'file'; file.accept = 'image/*'; file.multiple = true; file.hidden = true;
    L.el.appendChild(file);
    file.onchange = async () => {
      const files = Array.from(file.files || []);
      file.value = '';
      const room = MAX_PHOTOS - st.photos.length;
      if (files.length > room) toast('Maksimum ' + MAX_PHOTOS + ' gambar setiap aktiviti.', 'bad');
      for (const f of files.slice(0, room)) {
        const tmp = { cid: uid(), busy: true, thumb: '' };
        st.photos.push(tmp); draw();
        try { Object.assign(tmp, await shrink(f), { busy: false }); }
        catch (e) { st.photos.splice(st.photos.indexOf(tmp), 1); toast(e.message, 'bad'); }
        draw();
      }
    };
    const pressed = (b) => ' aria-pressed="' + (b ? 'true' : 'false') + '"';
    const draw = () => {
      const cats = S.meta.cats.filter((c) => c.area === st.area);
      let h = '';
      if (last && !st.cat) {
        const lc = catOf(last.cat);
        if (lc) h += '<div class="chips" style="margin:2px 0 6px"><button class="chip same" data-same>' + ic('repeat', 's') + ' Sama: ' + esc(lc.label) + ' · ' + esc(last.status) + ' · ' + (last.shift === 'N' ? 'Malam' : 'Siang') + '</button></div>';
      }
      h += '<div class="field"><div class="lbl"><span class="n">1</span> Gambar <span class="opt">' + st.photos.length + ' / ' + MAX_PHOTOS + '</span></div><div class="photos">' +
        st.photos.map((p, i) => '<div class="ph">' + (p.thumb ? '<img src="' + p.thumb + '" alt="Gambar ' + (i + 1) + '">' : '') + (p.busy ? '<div class="busy"><span class="spin"></span></div>' : '<button class="rm" data-rm="' + i + '" aria-label="Buang gambar">' + ic('x', 's') + '</button>') + '</div>').join('') +
        (st.photos.length < MAX_PHOTOS ? '<button class="add' + (st.photos.length ? '' : ' big') + '" data-pick>' + ic('camera') + '<span>' + (st.photos.length ? 'Tambah' : 'Ambil / pilih gambar') + '</span></button>' : '') + '</div>' +
        (st.photos.length ? '' : '<p class="hint">Tiada gambar? Boleh terus isi di bawah.</p>') + '</div>';
      h += '<div class="field"><div class="lbl"><span class="n">2</span> Kawasan</div><div class="seg">' + S.meta.areas.map((a) => '<button class="opt-card ' + a.key + '" data-area="' + a.key + '"' + pressed(st.area === a.key) + '><span class="ic">' + ic(a.key === 'U1' ? 'bolt' : 'gear', 's') + '</span><span>' + (a.key === 'U1' ? 'Unit 1' : 'Unit 4') + '<small>' + (a.key === 'U1' ? 'Common / General' : 'AHC · REMACO') + '</small></span></button>').join('') + '</div></div>';
      if (st.area) {
        let sc = null;
        h += '<div class="field"><div class="lbl"><span class="n">3</span> Sistem</div><div class="chips">';
        cats.forEach((c) => {
          if (c.scope && c.scope !== sc) { sc = c.scope; h += '<div class="chips-h">' + esc(c.scope) + '</div>'; }
          h += '<button class="chip" data-cat="' + esc(c.key) + '"' + pressed(st.cat === c.key) + '>' + esc(c.button) + '</button>';
        });
        h += '<button class="chip add" data-newcat>' + ic('plus', 's') + ' Sistem baru</button></div></div>';
      }
      if (st.cat) {
        h += '<div class="field"><div class="lbl"><span class="n">4</span> Status</div><div class="seg three">' +
          [['NS', 'flag', 'Belum mula'], ['IP', 'clock', 'Sedang dibuat'], ['CP', 'check', 'Siap']].map((s) => '<button class="opt-card st-' + s[0] + '" data-st="' + s[0] + '"' + pressed(st.status === s[0]) + '><span class="ic">' + ic(s[1], 's') + '</span><span>' + s[0] + '<small>' + s[2] + '</small></span></button>').join('') + '</div></div>';
        h += '<div class="field"><div class="lbl"><span class="n">5</span> Syif</div><div class="seg"><button class="opt-card sh-D" data-sh="D"' + pressed(st.shift === 'D') + '><span class="ic">' + ic('sun', 's') + '</span>Siang</button><button class="opt-card sh-N" data-sh="N"' + pressed(st.shift === 'N') + '><span class="ic">' + ic('moon', 's') + '</span>Malam</button></div></div>';
        h += '<div class="field"><div class="lbl"><span class="n">6</span> Apa kerja ini?</div><textarea class="input" id="raw" placeholder="Taip ringkas (BM / English). Contoh: tarik kabel 3C dari SST ke panel LV, 60m siap">' + esc(st.raw) + '</textarea>' +
          '<p class="hint">💡 Tekan ikon mikrofon pada papan kekunci untuk bercakap.</p></div>';
        if (st.text) h += '<div class="field"><div class="preview rise"><div class="k">' + ic('magic', 'xs') + (st.aiDone ? ' Ayat laporan (AI)' : ' Ayat laporan') + '</div><div class="v" id="pv" contenteditable="true" role="textbox" aria-label="Ayat laporan">' + esc(st.text) + '</div></div><p class="hint">Boleh ubah terus pada ayat di atas.</p></div>';
        h += '<div class="field"><div class="lbl">' + ic('cal', 's') + ' Tarikh kerja</div><button class="datepill" data-adate style="width:100%"><span class="ic">' + ic('cal', 's') + '</span><span class="grow"><span class="d">' + esc(relDay(st.date) + ' · ' + dmy(st.date)) + '</span>' + (st.date < today() ? '<br><span class="w">Tarikh lepas (backdate)</span>' : '') + '</span>' + ic('right', 's') + '</button></div>';
      }
      body.innerHTML = h;
      $('#addgo').innerHTML = st.text ? ic('send', 's') + ' Simpan aktiviti' : ic('magic', 's') + ' Semak &amp; simpan';
      bindAdd();
    };
    const bindAdd = () => {
      const keep = () => { const r = $('#raw', body); if (r) st.raw = r.value; const p = $('#pv', body); if (p) st.text = p.innerText.trim(); };
      $$('[data-pick]', body).forEach((b) => { b.onclick = () => file.click(); });
      $$('[data-rm]', body).forEach((b) => { b.onclick = () => { keep(); st.photos.splice(Number(b.dataset.rm), 1); draw(); }; });
      $$('[data-area]', body).forEach((b) => { b.onclick = () => { keep(); if (st.area !== b.dataset.area) { st.area = b.dataset.area; st.cat = ''; } draw(); }; });
      $$('[data-cat]', body).forEach((b) => { b.onclick = () => { keep(); st.cat = b.dataset.cat; draw(); scrollNext('[data-st]'); }; });
      $$('[data-st]', body).forEach((b) => { b.onclick = () => { keep(); st.status = b.dataset.st; draw(); }; });
      $$('[data-sh]', body).forEach((b) => { b.onclick = () => { keep(); st.shift = b.dataset.sh; if (st.shift === 'N' && st.date === today() && hourKL() < 7) { st.date = addDays(today(), -1); toast('Syif malam selepas tengah malam → tarikh semalam.', ''); } draw(); }; });
      const s = $('[data-same]', body); if (s) s.onclick = () => { keep(); Object.assign(st, { area: last.area, cat: last.cat, status: last.status, shift: last.shift }); draw(); setTimeout(() => { const r = $('#raw', body); if (r) r.focus(); }, 50); };
      const nc = $('[data-newcat]', body); if (nc) nc.onclick = () => { keep(); newCatSheet(st.area, (key) => { st.cat = key; draw(); }); };
      const r = $('#raw', body); if (r) r.oninput = () => { st.raw = r.value; if (st.text && !st.aiDone) { /* keep */ } };
      const pv = $('#pv', body); if (pv) pv.oninput = () => { st.text = pv.innerText.trim(); };
      const ad = $('[data-adate]', body); if (ad) ad.onclick = () => { keep(); pickDate(st.date, (v) => { st.date = v; draw(); }, { min: addDays(today(), -60), title: 'Tarikh kerja' }); };
    };
    const scrollNext = (sel) => setTimeout(() => { const el = $(sel, body); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
    $('#addgo').onclick = async (ev) => { const btn = ev.currentTarget;
      const r = $('#raw', body); if (r) st.raw = r.value.trim();
      const pv = $('#pv', body); if (pv) st.text = pv.innerText.trim();
      if (st.photos.some((p) => p.busy)) return toast('Tunggu gambar siap diproses.', 'bad');
      if (!st.area) return toast('Pilih kawasan.', 'bad');
      if (!st.cat) return toast('Pilih sistem.', 'bad');
      if (!st.status) { scrollNext('[data-st]'); return toast('Pilih status.', 'bad'); }
      if (!st.raw && !st.text) { if (r) r.focus(); return toast('Tulis apa kerja ini.', 'bad'); }
      if (!st.text && navigator.onLine) {
        busy(btn, true, 'AI menyusun ayat…');
        try { const p = await api('polish', { raw: st.raw, area: st.area, cat: st.cat, status: st.status, shift: st.shift }); st.text = p.line; st.aiDone = p.ai; }
        catch (e) { st.text = ''; if (!e.net) toast(e.message, 'bad'); }
        busy(btn, false);
        if (st.text) { draw(); scrollNext('#pv'); return; }
      }
      // save to the phone first, then send
      const item = { cid: uid(), created: Date.now(), photos: st.photos.map((p) => ({ cid: p.cid, blob: p.blob, thumb: p.thumb, taken: p.taken })),
        payload: { date: dmy(st.date), area: st.area, cat: st.cat, status: st.status, shift: st.shift, raw: st.raw, text: st.text } };
      ls.set('lastPick', { area: st.area, cat: st.cat, status: st.status, shift: st.shift });
      closeLayer();
      if (S.date !== st.date) { S.date = st.date; loadDay(st.date, true).then(render); }
      S.tab = 'home'; location.hash = 'home';
      await queueEntry(item);
      toast(navigator.onLine ? 'Disimpan – menghantar…' : 'Disimpan dalam telefon. Dihantar bila ada internet.', 'ok');
    };
    draw();
  }

  function newCatSheet(area, cb) {
    const scopes = (S.meta.scopes && S.meta.scopes[area]) || [];
    let scope = scopes[0] || '';
    const L = openLayer((scopes.length ? '<div class="field"><div class="lbl">Bawah skop</div><div class="chips">' + scopes.map((s) => '<button class="chip" data-sc="' + esc(s) + '" aria-pressed="' + (s === scope) + '">' + esc(s) + '</button>').join('') + '</div></div>' : '') +
      '<div class="field"><label for="ncn">Nama sistem (English)</label><input class="input" id="ncn" maxlength="40" placeholder="cth: AIR CONDITIONING" autofocus></div><p class="hint">Ia muncul dalam teks WhatsApp dan PDF sebagai kategori baru. Engineer boleh sembunyikan dalam tab Categories.</p>',
    { title: 'Sistem baru · ' + (area === 'U1' ? 'Unit 1' : 'Unit 4'), foot: '<button class="btn primary block" data-ok>' + ic('plus', 's') + ' Cipta sistem</button>' });
    $$('[data-sc]', L.el).forEach((b) => { b.onclick = () => { scope = b.dataset.sc; $$('[data-sc]', L.el).forEach((x) => x.setAttribute('aria-pressed', x === b)); }; });
    $('[data-ok]', L.el).onclick = async (e) => { const btn = e.currentTarget;
      busy(btn, true);
      try {
        const r = await api('newcat', { area, scope, name: $('#ncn', L.el).value });
        S.meta.cats = r.cats; ls.set('meta', S.meta);
        toast((r.created ? 'Sistem baru dicipta: ' : 'Sistem sedia ada dipilih: ') + r.label, 'ok');
        closeLayer(); cb(r.key);
      } catch (err) { busy(btn, false); toast(err.message, 'bad'); }
    };
  }

  // ---------------------------------------------------------------- EDIT ACTIVITY
  function editSheet(e) {
    if (!e) return;
    const st = { text: e.text, status: e.status, shift: e.shift, cat: e.cat, area: e.area };
    const L = openLayer('<div id="edb"></div>', { title: 'Ubah aktiviti', full: true,
      foot: '<div class="btn-row"><button class="btn danger" data-del style="flex:0 0 auto">' + ic('trash', 's') + '</button><button class="btn primary" data-save>' + ic('check', 's') + ' Simpan perubahan</button></div>' });
    const body = $('#edb', L.el);
    const pressed = (b) => ' aria-pressed="' + (b ? 'true' : 'false') + '"';
    const draw = () => {
      const cats = S.meta.cats.filter((c) => c.area === st.area);
      body.innerHTML = '<div class="card" style="margin-top:4px"><div class="by" style="margin:0;color:var(--ink-3);font-weight:600;font-size:12.5px">' + ic('user', 'xs') + ' ' + esc(e.who) + ' · ' + esc(dmy(e.date)) + ' ' + esc(hhmm(e.at)) + (e.photos.length ? ' · 📷 ' + e.photos.length : '') + '</div>' +
        (e.photos.length ? '<div class="strip" data-ph>' + e.photos.slice(0, 6).map((id) => '<span class="ph"><img data-thumb="' + esc(id) + '" src="' + (S.thumbs.get(id) || '') + '" alt=""></span>').join('') + '</div>' : '') + '</div>' +
        '<div class="field"><label for="et">Ayat laporan (English)</label><textarea class="input" id="et">' + esc(st.text) + '</textarea></div>' +
        '<div class="field"><div class="lbl">Status</div><div class="seg three">' + [['NS', 'flag', 'Belum mula'], ['IP', 'clock', 'Sedang dibuat'], ['CP', 'check', 'Siap']].map((s) => '<button class="opt-card st-' + s[0] + '" data-st="' + s[0] + '"' + pressed(st.status === s[0]) + '><span class="ic">' + ic(s[1], 's') + '</span><span>' + s[0] + '<small>' + s[2] + '</small></span></button>').join('') + '</div></div>' +
        '<div class="field"><div class="lbl">Syif</div><div class="seg"><button class="opt-card sh-D" data-sh="D"' + pressed(st.shift === 'D') + '><span class="ic">' + ic('sun', 's') + '</span>Siang</button><button class="opt-card sh-N" data-sh="N"' + pressed(st.shift === 'N') + '><span class="ic">' + ic('moon', 's') + '</span>Malam</button></div></div>' +
        '<div class="field"><div class="lbl">Sistem <span class="opt"><button class="link" data-flip>Tukar ke ' + (st.area === 'U1' ? 'Unit 4' : 'Unit 1') + '</button></span></div><div class="chips">' + cats.map((c) => '<button class="chip" data-cat="' + esc(c.key) + '"' + pressed(st.cat === c.key) + '>' + esc(c.button) + '</button>').join('') + '</div></div>';
      const keep = () => { st.text = $('#et', body).value; };
      $$('[data-st]', body).forEach((b) => { b.onclick = () => { keep(); st.status = b.dataset.st; draw(); }; });
      $$('[data-sh]', body).forEach((b) => { b.onclick = () => { keep(); st.shift = b.dataset.sh; draw(); }; });
      $$('[data-cat]', body).forEach((b) => { b.onclick = () => { keep(); st.cat = b.dataset.cat; draw(); }; });
      $('[data-flip]', body).onclick = () => { keep(); st.area = st.area === 'U1' ? 'U4' : 'U1'; draw(); };
      const ph = $('[data-ph]', body); if (ph) ph.onclick = (ev) => viewer(e.photos, Math.max(0, $$('.ph', ph).indexOf(ev.target.closest('.ph'))));
    };
    draw();
    loadThumbs(e.photos.slice(0, 6));
    $('[data-save]', L.el).onclick = async (ev) => { const btn = ev.currentTarget;
      st.text = $('#et', body).value;
      const ch = {};
      if (st.text.trim() !== e.text) ch.text = st.text;
      if (st.status !== e.status) ch.status = st.status;
      if (st.shift !== e.shift) ch.shift = st.shift;
      if (st.cat !== e.cat) { if (!catOf(st.cat) || catOf(st.cat).area !== st.area) return toast('Pilih sistem.', 'bad'); ch.cat = st.cat; }
      if (!Object.keys(ch).length) return closeLayer();
      busy(btn, true);
      try { await api('update', Object.assign({ id: e.id }, ch)); toast('Dikemas kini ✓', 'ok'); closeLayer(); await loadDay(S.date, true); render(); }
      catch (err) { busy(btn, false); toast(err.message, 'bad'); }
    };
    $('[data-del]', L.el).onclick = async () => {
      const own = e.src !== 'merged' && e.src !== 'contractor';
      const yes = await confirmBox('Padam aktiviti ini?', '<b>' + esc(e.text) + '</b>' + (e.photos.length && own ? '<br><br>📷 ' + e.photos.length + ' gambarnya juga dipadam dari Google Drive (masuk Trash, boleh dipulihkan dalam 30 hari).' : '') + (e.src === 'merged' ? '<br><br>🔀 Baris asal sebelum digabung akan muncul semula.' : ''), 'Ya, padam', 'danger');
      if (!yes) return;
      try { const r = await api('remove', { id: e.id }); toast('Dipadam' + (r.photos ? ' (dan ' + r.photos + ' gambar)' : '') + '.', 'ok'); closeLayer(); await loadDay(S.date, true); render(); }
      catch (err) { toast(err.message, 'bad'); }
    };
  }

  // ---------------------------------------------------------------- WEATHER
  function weatherSheet() {
    const d = S.days[S.date];
    const opts = (S.meta && S.meta.weather) || ['Sunny', 'Clear', 'Cloudy', 'Rainy', 'Hazy'];
    const ICW = { sunny: '☀️', clear: '🌤️', cloudy: '☁️', rainy: '🌧️', hazy: '🌫️' };
    const L = openLayer('<p class="muted" style="margin:0 4px 12px">' + esc(hari(S.date) + ', ' + dmy(S.date)) + (d && d.weather ? ' · sekarang <b>' + esc(d.weather) + '</b>' : '') + '</p><div class="seg" style="grid-auto-flow:row;grid-template-columns:repeat(3,1fr)">' +
      opts.map((o) => '<button class="opt-card" style="flex-direction:column;text-align:center;gap:4px" data-w="' + esc(o) + '" aria-pressed="' + (d && d.weather === o) + '"><span style="font-size:26px">' + (ICW[o.toLowerCase()] || '🌡️') + '</span>' + esc(o) + '</button>').join('') + '</div>', { title: 'Cuaca' });
    $$('[data-w]', L.el).forEach((b) => {
      b.onclick = async () => {
        try { await api('weather', { date: dmy(S.date), w: b.dataset.w }); if (d) d.weather = b.dataset.w; toast('Cuaca: ' + b.dataset.w, 'ok'); closeLayer(); render(); }
        catch (e) { toast(e.message, 'bad'); }
      };
    });
  }

  // ---------------------------------------------------------------- DATA tab
  function viewData() {
    const d = S.days[S.date];
    const eng = isEng();
    let h = topbar('Data tapak') + datebar();
    if (!d) return h + '<div class="skel" style="height:160px"></div>';
    h += '<div class="cols"><div>';
    h += '<div class="section-t"><h2>Cuaca &amp; tenaga kerja</h2></div><div class="card"><div class="list-row"><span class="ic" style="background:var(--peach-50);color:var(--peach)">' + ic('sun', 's') + '</span><div class="grow"><div class="t">' + esc(d.weather || 'Belum ditetapkan') + '</div><div class="s">Cuaca ' + esc(dmy(S.date)) + '</div></div><button class="btn soft sm" data-weather>Tukar</button></div>' +
      '<div class="list-row"><span class="ic" style="background:var(--sky-50);color:var(--sky)">' + ic('users', 's') + '</span><div class="grow"><div class="t">' + (d.manpower.list.reduce((n, m) => n + Number(m.count || 0), 0) || '—') + ' orang</div><div class="s">' + esc(d.manpower.list.map((m) => m.company + ' ' + m.count).join(' · ') || 'Tiada data') + (d.manpower.date ? ' · ' + esc(dmy(d.manpower.date)) : '') + '</div></div><button class="btn soft sm" data-mp>Kemas kini</button></div></div>';
    h += '<div class="section-t"><h2>Peratus kemajuan</h2><span>2-weeks lookahead</span></div><div class="card">' + d.progress.map((p) =>
      '<button class="pct-row" style="display:block;width:100%;text-align:left" data-pct="' + esc(p.key) + '"' + (!eng ? ' disabled' : '') + '><div class="top"><b>' + esc(p.label) + '</b>' + (p.linked ? '<span class="pill wait">' + ic('link', 'xs') + ' dashboard</span>' : '') + '<span class="v">' + (p.pct == null ? '?' : p.pct) + '%</span></div><div class="bar"><i style="width:' + (p.pct || 0) + '%"></i></div></button>').join('') +
      (eng ? '<p class="hint">🔗 = ikut Electrical Dashboard (dikemas kini setiap jam). Lain-lain: tekan untuk ubah.</p>' : '') + '</div>';
    h += '</div><div class="side">';
    h += '<div class="section-t"><h2>Rancangan esok</h2><span>' + esc(dmy(addDays(S.date, 1))) + '</span></div><div class="card">' +
      (d.plans.length ? d.plans.map((p) => '<div class="list-row"><span class="ic">' + ic('flag', 's') + '</span><div class="grow"><div class="t">' + esc(p.text) + '</div><div class="s">' + esc((p.area === 'U4' ? 'Unit 4' : 'Unit 1') + ' · ' + p.label + ' · ' + p.by) + '</div></div>' + (eng ? '<button class="iconbtn" style="width:40px;height:40px;box-shadow:none;background:var(--rose-50);color:var(--rose)" data-pdel="' + p.row + '" aria-label="Padam">' + ic('trash', 's') + '</button>' : '') + '</div>').join('')
        : '<p class="muted">Tiada rancangan. PDF guna aktiviti sebenar esok; jika tiada, rancangan ini; jika tiada, TBA.</p>') +
      (eng ? '<button class="btn soft block" style="margin-top:12px" data-plan>' + ic('plus', 's') + ' Tambah rancangan</button>' : '') + '</div>';
    h += '<div class="section-t"><h2>Bahan tiba</h2><span>' + d.materials.length + '</span></div><div class="card">' +
      (d.materials.length ? d.materials.slice(0, 12).map((m) => '<div class="list-row"><span class="ic" style="background:var(--mint-50);color:var(--mint)">' + ic('box', 's') + '</span><div class="grow"><div class="t">' + esc(m.item) + '</div><div class="s">' + esc(m.label + ' · ✅ ' + dmy(m.date)) + '</div></div>' + (eng ? '<button class="iconbtn" style="width:40px;height:40px;box-shadow:none;background:var(--rose-50);color:var(--rose)" data-mdel="' + m.row + '" aria-label="Padam">' + ic('trash', 's') + '</button>' : '') + '</div>').join('') : '<p class="muted">Tiada.</p>') +
      (eng ? '<button class="btn soft block" style="margin-top:12px" data-mat>' + ic('plus', 's') + ' Bahan tiba</button>' : '') + '</div>';
    if (!eng) h += '<p class="hint" style="margin-top:14px">Peratus, rancangan dan bahan dikemas kini oleh engineer.</p>';
    h += '</div></div>';
    return h;
  }
  bind.data = function () {
    bindCommon();
    const d = S.days[S.date];
    const w = $('[data-weather]'); if (w) w.onclick = () => weatherSheet();
    const mp = $('[data-mp]'); if (mp) mp.onclick = () => manpowerSheet();
    $$('[data-pct]').forEach((b) => { b.onclick = () => pctSheet(d.progress.find((p) => p.key === b.dataset.pct)); });
    const pl = $('[data-plan]'); if (pl) pl.onclick = () => planSheet();
    const mt = $('[data-mat]'); if (mt) mt.onclick = () => matSheet();
    $$('[data-pdel]').forEach((b) => { b.onclick = async () => { const p = d.plans.find((x) => String(x.row) === b.dataset.pdel); if (!(await confirmBox('Padam rancangan?', esc(p.text), 'Padam', 'danger'))) return; try { await api('planDel', { row: p.row, text: p.text }); await loadDay(S.date, true); render(); } catch (e) { toast(e.message, 'bad'); } }; });
    $$('[data-mdel]').forEach((b) => { b.onclick = async () => { const m = d.materials.find((x) => String(x.row) === b.dataset.mdel); if (!(await confirmBox('Padam bahan?', esc(m.item), 'Padam', 'danger'))) return; try { await api('materialDel', { row: m.row, item: m.item }); await loadDay(S.date, true); render(); } catch (e) { toast(e.message, 'bad'); } }; });
  };

  function manpowerSheet() {
    const d = S.days[S.date];
    const rows = (d.manpower.list.length ? d.manpower.list : [{ company: '', count: '' }]).map((m) => ({ company: m.company, count: m.count }));
    const L = openLayer('<p class="muted" style="margin:0 4px 10px">Senarai untuk <b>hari ini (' + esc(dmy(today())) + ')</b>.</p><div id="mpl"></div><button class="btn soft block" style="margin-top:12px" data-addr>' + ic('plus', 's') + ' Tambah syarikat</button>',
      { title: 'Tenaga kerja', foot: '<button class="btn primary block" data-ok>' + ic('check', 's') + ' Simpan</button>' });
    const draw = () => {
      $('#mpl', L.el).innerHTML = rows.map((r, i) => '<div class="row" style="margin-top:8px"><input class="input grow" data-c="' + i + '" value="' + esc(r.company) + '" placeholder="Syarikat" style="text-transform:uppercase"><input class="input" data-n="' + i + '" value="' + esc(r.count) + '" inputmode="numeric" placeholder="0" style="width:84px;text-align:center"><button class="iconbtn" style="width:46px;height:46px;box-shadow:none" data-x="' + i + '" aria-label="Buang">' + ic('x', 's') + '</button></div>').join('');
      $$('[data-c]', L.el).forEach((x) => { x.oninput = () => { rows[x.dataset.c].company = x.value; }; });
      $$('[data-n]', L.el).forEach((x) => { x.oninput = () => { rows[x.dataset.n].count = x.value.replace(/\D/g, ''); }; });
      $$('[data-x]', L.el).forEach((x) => { x.onclick = () => { rows.splice(Number(x.dataset.x), 1); draw(); }; });
    };
    draw();
    $('[data-addr]', L.el).onclick = () => { rows.push({ company: '', count: '' }); draw(); };
    $('[data-ok]', L.el).onclick = async (e) => { const btn = e.currentTarget;
      busy(btn, true);
      try { await api('manpower', { list: rows.filter((r) => r.company && r.count !== '') }); toast('Tenaga kerja disimpan ✓', 'ok'); closeLayer(); S.date = today(); await loadDay(S.date, true); render(); }
      catch (err) { busy(btn, false); toast(err.message, 'bad'); }
    };
  }

  function pctSheet(p) {
    if (!p || !isEng()) return;
    if (p.linked) return toast(p.label + ' ikut dashboard – ubah status aktiviti di website.', '');
    let v = p.pct == null ? 0 : p.pct;
    const L = openLayer('<div style="text-align:center;margin:6px 0 4px"><div id="pv" style="font-size:52px;font-weight:800;letter-spacing:-.03em;color:var(--lav-d)">' + v + '%</div></div>' +
      '<input type="range" min="0" max="100" step="1" value="' + v + '" id="pr" style="width:100%;accent-color:#8B7CF6;height:36px">' +
      '<div class="chips" style="justify-content:center;margin-top:8px">' + [-5, -1, 1, 5].map((n) => '<button class="chip" data-d="' + n + '">' + (n > 0 ? '+' : '') + n + '</button>').join('') + '</div>',
    { title: p.label, foot: '<button class="btn primary block" data-ok>' + ic('check', 's') + ' Simpan</button>' });
    const set = (n) => { v = Math.max(0, Math.min(100, n)); $('#pv', L.el).textContent = v + '%'; $('#pr', L.el).value = v; };
    $('#pr', L.el).oninput = (e) => set(Number(e.target.value));
    $$('[data-d]', L.el).forEach((b) => { b.onclick = () => set(v + Number(b.dataset.d)); });
    $('[data-ok]', L.el).onclick = async (e) => { const btn = e.currentTarget;
      busy(btn, true);
      try { await api('progress', { key: p.key, pct: v }); toast(p.label + ': ' + v + '%', 'ok'); closeLayer(); await loadDay(S.date, true); render(); }
      catch (err) { busy(btn, false); toast(err.message, 'bad'); }
    };
  }

  function catPicker(st, filter) {
    const cats = S.meta.cats.filter((c) => c.area === st.area && (!filter || filter(c)));
    return '<div class="field"><div class="lbl">Kawasan</div><div class="seg">' + S.meta.areas.map((a) => '<button class="opt-card ' + a.key + '" data-area="' + a.key + '" aria-pressed="' + (st.area === a.key) + '"><span class="ic">' + ic(a.key === 'U1' ? 'bolt' : 'gear', 's') + '</span>' + (a.key === 'U1' ? 'Unit 1' : 'Unit 4') + '</button>').join('') + '</div></div>' +
      (st.area ? '<div class="field"><div class="lbl">Sistem</div><div class="chips">' + (cats.map((c) => '<button class="chip" data-cat="' + esc(c.key) + '" aria-pressed="' + (st.cat === c.key) + '">' + esc(c.button) + '</button>').join('') || '<p class="muted">Tiada sistem.</p>') + '</div></div>' : '');
  }

  function planSheet() {
    const st = { area: '', cat: '', raw: '', text: '', date: addDays(today(), 1) };
    const L = openLayer('<div id="plb"></div>', { title: 'Rancangan', full: true, foot: '<button class="btn primary block" data-ok>' + ic('magic', 's') + ' Semak &amp; simpan</button>' });
    const body = $('#plb', L.el);
    const draw = () => {
      body.innerHTML = catPicker(st) + (st.cat ? '<div class="field"><div class="lbl">Untuk</div><div class="chips">' + [1, 2, 3].map((n) => { const dd = addDays(today(), n); return '<button class="chip" data-dd="' + dd + '" aria-pressed="' + (st.date === dd) + '">' + (n === 1 ? 'Esok' : n === 2 ? 'Lusa' : hari(dd)) + ' · ' + dmy(dd).slice(0, 5) + '</button>'; }).join('') + '</div></div>' +
        '<div class="field"><label for="plr">Apa rancangan?</label><textarea class="input" id="plr" placeholder="cth: sambung kabel di panel LV">' + esc(st.raw) + '</textarea></div>' +
        (st.text ? '<div class="field"><div class="preview"><div class="k">' + ic('magic', 'xs') + ' Ayat laporan</div><div class="v" id="plv" contenteditable="true">' + esc(st.text) + '</div></div></div>' : '') : '');
      const keep = () => { const r = $('#plr', body); if (r) st.raw = r.value; const v = $('#plv', body); if (v) st.text = v.innerText.trim(); };
      $$('[data-area]', body).forEach((b) => { b.onclick = () => { keep(); st.area = b.dataset.area; st.cat = ''; draw(); }; });
      $$('[data-cat]', body).forEach((b) => { b.onclick = () => { keep(); st.cat = b.dataset.cat; draw(); }; });
      $$('[data-dd]', body).forEach((b) => { b.onclick = () => { keep(); st.date = b.dataset.dd; draw(); }; });
      $('[data-ok]', L.el).innerHTML = st.text ? ic('check', 's') + ' Simpan rancangan' : ic('magic', 's') + ' Semak &amp; simpan';
    };
    draw();
    $('[data-ok]', L.el).onclick = async (e) => { const btn = e.currentTarget;
      const r = $('#plr', body); if (r) st.raw = r.value.trim();
      const v = $('#plv', body); if (v) st.text = v.innerText.trim();
      if (!st.cat) return toast('Pilih kawasan dan sistem.', 'bad');
      if (!st.raw && !st.text) return toast('Tulis rancangan.', 'bad');
      busy(btn, true);
      try {
        if (!st.text) { const p = await api('polish', { raw: st.raw, area: st.area, cat: st.cat, mode: 'plan' }); st.text = p.line; busy(btn, false); draw(); return; }
        await api('plan', { area: st.area, cat: st.cat, text: st.text, date: dmy(st.date) });
        toast('Rancangan disimpan ✓', 'ok'); closeLayer(); await loadDay(S.date, true); render();
      } catch (err) { busy(btn, false); toast(err.message, 'bad'); }
    };
  }

  function matSheet() {
    const st = { area: '', cat: '', item: '', date: today() };
    const L = openLayer('<div id="mtb"></div>', { title: 'Bahan tiba', full: true, foot: '<button class="btn primary block" data-ok>' + ic('check', 's') + ' Simpan</button>' });
    const body = $('#mtb', L.el);
    const draw = () => {
      body.innerHTML = catPicker(st, (c) => c.mat) + (st.cat ? '<div class="field"><label for="mti">Nama bahan</label><input class="input" id="mti" value="' + esc(st.item) + '" placeholder="cth: 500kVA SST 1 & 2"></div>' +
        '<div class="field"><div class="lbl">Tarikh tiba</div><div class="chips">' + [['Hari ini', today()], ['Semalam', addDays(today(), -1)]].map((x) => '<button class="chip" data-dd="' + x[1] + '" aria-pressed="' + (st.date === x[1]) + '">' + x[0] + '</button>').join('') + '<button class="chip" data-other>' + ic('cal', 's') + ' ' + esc(dmy(st.date)) + '</button></div></div>' : '');
      const keep = () => { const i = $('#mti', body); if (i) st.item = i.value; };
      $$('[data-area]', body).forEach((b) => { b.onclick = () => { keep(); st.area = b.dataset.area; st.cat = ''; draw(); }; });
      $$('[data-cat]', body).forEach((b) => { b.onclick = () => { keep(); st.cat = b.dataset.cat; draw(); }; });
      $$('[data-dd]', body).forEach((b) => { b.onclick = () => { keep(); st.date = b.dataset.dd; draw(); }; });
      const o = $('[data-other]', body); if (o) o.onclick = () => { keep(); pickDate(st.date, (v) => { st.date = v; draw(); }, { title: 'Tarikh tiba' }); };
    };
    draw();
    $('[data-ok]', L.el).onclick = async (e) => { const btn = e.currentTarget;
      const i = $('#mti', body); if (i) st.item = i.value.trim();
      if (!st.cat) return toast('Pilih kawasan dan sistem.', 'bad');
      if (!st.item) return toast('Tulis nama bahan.', 'bad');
      busy(btn, true);
      try { await api('material', { area: st.area, cat: st.cat, item: st.item, date: dmy(st.date) }); toast('Bahan disimpan ✓', 'ok'); closeLayer(); await loadDay(S.date, true); render(); }
      catch (err) { busy(btn, false); toast(err.message, 'bad'); }
    };
  }

  // ---------------------------------------------------------------- REPORT tab
  function viewReport() {
    const eng = isEng();
    const u = S.session.user;
    let h = topbar('Laporan') + datebar();
    h += '<div class="cols"><div>';
    h += '<div class="card"><div class="row"><span class="ic" style="width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:var(--lav-50);color:var(--lav-d)">' + ic('file') + '</span><div class="grow"><h3>PDF harian</h3><p>Daily Progress Report – ' + esc(dmy(S.date)) + '</p></div></div>' +
      '<button class="btn primary block" style="margin-top:14px" data-pdf="1">' + ic('spark', 's') + ' Jana PDF</button>' +
      (u.telegram ? '<p class="hint">PDF dijana oleh bot dan dihantar ke Telegram anda. Ia juga boleh dimuat turun di sini.</p>' : '<p class="hint">⚠️ Akaun anda tiada Telegram bot – minta engineer jana PDF.</p>') + '</div>';
    if (eng) {
      h += '<div class="card"><div class="row"><span class="ic" style="width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:#DDF7E7;color:#11804A">' + ic('wa') + '</span><div class="grow"><h3>Teks WhatsApp</h3><p>Unit 1 dan Unit 4, sama seperti /today</p></div></div>' +
        '<button class="btn wa block" style="margin-top:14px" data-wa>' + ic('wa', 's') + ' Jana teks WhatsApp</button><div id="waout"></div></div>';
      h += '<div class="card"><div class="row"><span class="ic" style="width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:var(--peach-50);color:var(--peach)">' + ic('cal') + '</span><div class="grow"><h3>PDF mingguan</h3><p>7 hari: ' + esc(dmy(addDays(S.date, -6)) + ' – ' + dmy(S.date)) + '</p></div></div>' +
        '<button class="btn soft block" style="margin-top:14px" data-pdf="7">' + ic('file', 's') + ' Jana PDF mingguan</button></div>';
    }
    h += '</div><div class="side"><div class="section-t"><h2>Laporan ' + esc(dmy(S.date)) + '</h2><button class="link" data-rl>' + ic('sync', 'xs') + ' Muat semula</button></div><div class="card" id="replist"><div class="skel" style="height:54px"></div></div></div></div>';
    return h;
  }
  bind.report = function () {
    bindCommon();
    $$('[data-pdf]').forEach((b) => { b.onclick = () => pdfFlow(Number(b.dataset.pdf)); });
    const w = $('[data-wa]'); if (w) w.onclick = (e) => waGen(e.currentTarget);
    const rl = $('[data-rl]'); if (rl) rl.onclick = () => loadReports();
    loadReports();
  };
  async function loadReports() {
    const box = $('#replist');
    if (!box) return;
    try {
      const r = await api('reports', { date: dmy(S.date), days: 1 });
      if (!$('#replist')) return;
      box.innerHTML = r.list.length ? r.list.map((x) => '<div class="list-row"><span class="ic">' + ic('file', 's') + '</span><div class="grow"><div class="t">Rev ' + x.rev + '</div><div class="s">' + esc((x.by || '—') + ' · ' + dmy(String(x.at).slice(0, 10)) + ' ' + hhmm(x.at)) + '</div></div>' +
        (x.ready ? '<button class="btn soft sm" data-dl="' + x.rev + '">' + ic('download', 's') + '</button>' : '<span class="pill wait">sedang dijana</span>') + '</div>').join('') : '<p class="muted">Belum ada PDF untuk tarikh ini.</p>';
      $$('[data-dl]', box).forEach((b) => { b.onclick = (e) => downloadPdf(r.docNo, Number(b.dataset.dl), e.currentTarget); });
    } catch (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
  }
  async function downloadPdf(docNo, rev, btn) {
    busy(btn, true);
    try {
      const r = await api('pdf', { docNo, rev }, { timeout: 120000 });
      const bin = atob(r.b64); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = r.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { toast(e.message, 'bad'); }
    busy(btn, false);
  }

  async function waGen(btn) {
    busy(btn, true, 'Menjana…');
    const out = $('#waout');
    try {
      const r = await api('wa', { date: dmy(S.date) });
      out.innerHTML = (r.warn.length ? '<div class="banner butter" style="margin-top:12px">' + ic('warn') + '<div class="grow">' + r.warn.map(esc).join('<br>') + '</div></div>' : '') +
        r.texts.map((t, i) => '<div class="field"><div class="lbl">' + esc(t.area === 'U1' ? 'Unit 1' : 'Unit 4') + '</div><div class="pre" id="wa' + i + '">' + esc(t.text) + '</div><div class="btn-row" style="margin-top:8px"><button class="btn ghost sm" data-copy="' + i + '">' + ic('copy', 's') + ' Salin</button><button class="btn wa sm" data-share="' + i + '">' + ic('wa', 's') + ' WhatsApp</button></div></div>').join('');
      $$('[data-copy]', out).forEach((b) => { b.onclick = async () => { const t = r.texts[Number(b.dataset.copy)].text; try { await navigator.clipboard.writeText(t); toast('Disalin – tampal dalam WhatsApp.', 'ok'); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast('Disalin.', 'ok'); } }; });
      $$('[data-share]', out).forEach((b) => { b.onclick = () => { const t = r.texts[Number(b.dataset.share)].text; window.open('https://wa.me/?text=' + encodeURIComponent(t), '_blank'); }; });
    } catch (e) { toast(e.message, 'bad'); }
    busy(btn, false);
  }

  async function pdfFlow(days) {
    const start = days === 7 ? addDays(S.date, -6) : S.date;
    const label = days === 7 ? dmy(start) + ' – ' + dmy(S.date) : dmy(start);
    const u = S.session.user;
    if (!u.telegram) return toast('PDF dihantar melalui Telegram bot. Akaun anda tiada Telegram – minta engineer jana.', 'bad');
    const L = openLayer('<div id="pf"></div>', { title: days === 7 ? 'PDF mingguan' : 'PDF harian' });
    const box = $('#pf', L.el);
    // 1) headline (engineer, AI on): the same choice the bot asks for in Telegram
    if (isEng() && S.meta && S.meta.ai && S.meta.headlineAi) {
      box.innerHTML = '<div class="row" style="gap:12px"><span class="spin"></span><span class="muted">AI menulis tajuk utama…</span></div>';
      let hl;
      try { hl = await api('headline', { date: dmy(start), days }, { timeout: 90000 }); } catch (e) { box.innerHTML = '<div class="banner rose">' + esc(e.message) + '</div>'; return; }
      if (!hl.decided && hl.draft) {
        const choice = await new Promise((res) => {
          box.innerHTML = '<p class="muted" style="margin:0 4px 10px">Tajuk ini dicetak di bawah tajuk laporan – ' + esc(label) + '.</p><div class="preview"><div class="k">' + ic('magic', 'xs') + ' Tajuk utama (AI)</div><div class="v" id="hlv" contenteditable="true">' + esc(hl.draft) + '</div></div><p class="hint">Boleh ubah terus pada ayat di atas (English).</p>' +
            '<div class="stack" style="margin-top:14px"><button class="btn primary block" data-hok>' + ic('check', 's') + ' Guna tajuk ini</button><button class="btn ghost block" data-hno>Tanpa tajuk</button></div>';
          $('[data-hok]', box).onclick = () => { const t = $('#hlv', box).innerText.trim(); res({ text: t, ai: t === hl.draft }); };
          $('[data-hno]', box).onclick = () => res({ text: '', ai: false });
        });
        try { await api('headlineSet', { date: dmy(start), days, text: choice.text, ai: choice.ai }); } catch (e) { toast(e.message, 'bad'); }
      }
    }
    // 2) ask the bot, then watch ReportLog
    const steps = ['Hantar permintaan ke bot', 'Bot menjana PDF (lebih kurang 1 minit)', 'PDF siap'];
    const drawSteps = (k) => { box.innerHTML = '<p class="muted" style="margin:0 4px">' + esc(label) + '</p><ul class="steps">' + steps.map((s, i) => '<li class="' + (i < k ? 'done' : i === k ? 'now' : '') + '"><span class="s">' + (i < k ? ic('check', 's') : i === k ? '<span class="spin" style="width:16px;height:16px;border-width:2.5px"></span>' : i + 1) + '</span>' + esc(s) + '</li>').join('') + '</ul><div id="pfend"></div>'; };
    drawSteps(0);
    let since;
    try { const r = await api('report', { date: dmy(start), days }, { timeout: 100000 }); since = r.since; }
    catch (e) { if (!e.net) { box.innerHTML = '<div class="banner rose">' + ic('warn') + '<div class="grow">' + esc(e.message) + '</div></div>'; return; } since = null; }
    drawSteps(1);
    const t0 = Date.now();
    while (!L.closed && Date.now() - t0 < 5 * 60000) {
      try {
        const r = await api('reports', { date: dmy(start), days });
        const hit = r.list.find((x) => x.ready && (!since || String(x.at) >= since));
        if (hit) {
          drawSteps(3);
          $('#pfend', box).innerHTML = '<div class="banner mint" style="margin-top:8px">' + ic('telegram') + '<div class="grow"><b>' + esc(r.docNo) + ' · Rev ' + hit.rev + '</b>Juga dihantar ke Telegram anda.</div></div><button class="btn primary block" style="margin-top:12px" data-dl>' + ic('download', 's') + ' Muat turun PDF</button>';
          $('[data-dl]', box).onclick = (e) => downloadPdf(r.docNo, hit.rev, e.currentTarget);
          if (S.tab === 'report') loadReports();
          return;
        }
      } catch (e) { /* keep waiting */ }
      await sleep(6000);
    }
    if (!L.closed) $('#pfend', box).innerHTML = '<div class="banner butter">' + ic('clock') + '<div class="grow">Masih dijana. Semak Telegram anda, atau tekan Muat semula dalam senarai laporan.</div></div>';
  }

  // ---------------------------------------------------------------- ME tab
  function viewMe() {
    const u = S.session.user;
    let h = topbar('Profil');
    h += '<div class="cols"><div>';
    h += '<div class="card"><div class="row" style="gap:14px"><span class="avatar lg">' + esc(initials(u.name)) + '</span><div class="grow"><h3 style="font-size:18px">' + esc(u.name) + '</h3><p>' + (u.eng ? 'Engineer' : 'Juruteknik') + '</p>' +
      '<div style="margin-top:6px">' + (u.telegram ? '<span class="pill ok">' + ic('telegram', 'xs') + ' Telegram bersambung</span>' : '<span class="pill NS">Tiada Telegram</span>') + '</div></div></div></div>';
    h += '<div class="section-t"><h2>Menunggu dihantar</h2><span>' + S.outbox.length + '</span></div><div class="card">';
    h += S.outbox.length ? S.outbox.map((x) => { const c = catOf(x.payload.cat); return '<div class="list-row"><span class="ic">' + (x.hold ? ic('warn', 's') : ic('clock', 's')) + '</span><div class="grow"><div class="t">' + esc(x.payload.text || x.payload.raw) + '</div><div class="s">' + esc(x.payload.date + ' · ' + (c ? c.label : x.payload.cat) + ' · 📷 ' + x.photos.length) + (x.err ? '<br><span style="color:var(--rose)">' + esc(x.err) + '</span>' : '') + '</div></div><button class="iconbtn" style="width:40px;height:40px;box-shadow:none;background:var(--rose-50);color:var(--rose)" data-ob="' + esc(x.cid) + '" aria-label="Buang">' + ic('trash', 's') + '</button></div>'; }).join('') +
      '<button class="btn soft block" style="margin-top:12px" data-sync>' + ic('sync', 's') + ' Hantar sekarang</button>' : '<p class="muted">' + ic('check', 'xs') + ' Semua aktiviti sudah dihantar.</p>';
    h += '</div>';
    h += '</div><div class="side">';
    if (u.eng) h += '<div class="section-t"><h2>Tetapan laporan</h2><span>PTW · PIC · masa</span></div><div class="card" id="setl"><button class="btn soft block" data-setl>' + ic('gear', 's') + ' Buka tetapan</button></div>';
    h += '<div class="section-t"><h2>Akaun</h2></div><div class="card">' +
      '<button class="list-row" style="width:100%;text-align:left" data-pin><span class="ic">' + ic('key', 's') + '</span><span class="grow t">Tukar PIN</span>' + ic('right', 's') + '</button>' +
      '<button class="list-row" style="width:100%;text-align:left" data-install><span class="ic">' + ic('phone', 's') + '</span><span class="grow"><span class="t">Pasang di skrin utama</span><br><span class="s">Buka seperti app biasa</span></span>' + ic('right', 's') + '</button>' +
      '<button class="list-row" style="width:100%;text-align:left;color:var(--rose)" data-out><span class="ic" style="background:var(--rose-50);color:var(--rose)">' + ic('logout', 's') + '</span><span class="grow t">Log keluar</span></button></div>';
    h += '<p class="hint" style="text-align:center;margin-top:18px">HLEP DPR web-app ' + APP_VERSION + (S.meta ? ' · backend ' + esc(S.meta.v) + ' · bot ' + esc(S.meta.bot) : '') + '</p>';
    h += '</div></div>';
    return h;
  }
  bind.me = function () {
    bindCommon();
    const sy = $('[data-sync]'); if (sy) sy.onclick = async (e) => { const btn = e.currentTarget; S.outbox.forEach((x) => { x.hold = false; }); await Promise.all(S.outbox.map((x) => idb.put('outbox', x))); busy(btn, true); await syncOutbox(); };
    $$('[data-ob]').forEach((b) => { b.onclick = async () => { if (!(await confirmBox('Buang aktiviti ini?', 'Ia belum dihantar. Gambarnya juga dibuang dari telefon.', 'Buang', 'danger'))) return; await idb.del('outbox', b.dataset.ob); await refreshOutbox(); render(); }; });
    $('[data-out]').onclick = async () => { if (S.outbox.length && !(await confirmBox('Log keluar?', S.outbox.length + ' aktiviti belum dihantar akan kekal dalam telefon ini.', 'Log keluar', 'danger'))) return; logout(); };
    $('[data-pin]').onclick = () => pinSheet();
    $('[data-install]').onclick = async () => {
      if (S.install) { S.install.prompt(); S.install = null; return; }
      openLayer('<div class="stack"><div class="banner lav">' + ic('phone') + '<div class="grow"><b>iPhone (Safari)</b>Tekan butang Kongsi ⬆️ → <b>Add to Home Screen</b>.</div></div><div class="banner mint">' + ic('phone') + '<div class="grow"><b>Android (Chrome)</b>Tekan menu ⋮ → <b>Install app</b> / <b>Add to Home screen</b>.</div></div></div>', { title: 'Pasang app' });
    };
    const sl = $('[data-setl]'); if (sl) sl.onclick = () => settingsList();
  };

  function pinSheet() {
    const L = openLayer('<div class="field"><label for="po">PIN sekarang</label><input class="input" id="po" type="password" inputmode="numeric" maxlength="8" autocomplete="current-password"></div><div class="field"><label for="pn">PIN baru (4 nombor)</label><input class="input" id="pn" type="password" inputmode="numeric" maxlength="8" autocomplete="new-password"></div>',
      { title: 'Tukar PIN', foot: '<button class="btn primary block" data-ok>Simpan PIN</button>' });
    $('[data-ok]', L.el).onclick = async (e) => { const btn = e.currentTarget;
      busy(btn, true);
      try { const r = await api('pin', { old: $('#po', L.el).value, pin: $('#pn', L.el).value }); S.session.token = r.token; ls.set('session', S.session); toast('PIN ditukar ✓', 'ok'); closeLayer(); }
      catch (err) { busy(btn, false); toast(err.message, 'bad'); }
    };
  }

  async function settingsList() {
    const box = $('#setl');
    box.innerHTML = '<div class="skel" style="height:54px"></div>';
    try {
      const r = await api('settings');
      box.innerHTML = r.list.map((s, i) => '<button class="list-row" style="width:100%;text-align:left" data-s="' + i + '"><span class="grow"><span class="t">' + esc(s.label) + '</span><br><span class="s">' + esc(String(s.value).split('\n')[0].slice(0, 60) || '—') + '</span></span>' + ic('edit', 's') + '</button>').join('');
      $$('[data-s]', box).forEach((b) => {
        b.onclick = () => {
          const s = r.list[Number(b.dataset.s)];
          const L = openLayer('<div class="field"><label for="sv">' + esc(s.label) + '</label><textarea class="input" id="sv" style="min-height:160px">' + esc(s.value) + '</textarea><p class="hint">Boleh beberapa baris. Sama seperti /settings dalam Telegram.</p></div>', { title: 'Tetapan', foot: '<button class="btn primary block" data-ok>Simpan</button>' });
          $('[data-ok]', L.el).onclick = async (e) => { const btn = e.currentTarget;
            busy(btn, true);
            try { await api('settingSet', { key: s.key, value: $('#sv', L.el).value }); toast('Dikemas kini ✓', 'ok'); closeLayer(); settingsList(); }
            catch (err) { busy(btn, false); toast(err.message, 'bad'); }
          };
        };
      });
    } catch (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
  }

  // expose a little for the preview tools
  window.HLEP = { S, api, render, version: APP_VERSION };
  start();
})();
