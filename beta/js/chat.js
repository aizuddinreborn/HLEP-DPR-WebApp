// Tanya DPR: ask about the records in plain words. The backend looks things up and answers with its sources.
// The assistant only reads: nothing it says changes a record.
import { H, md, copyText, shareText, unitName, tagm, canRecord, record, micError, oldBackend, upgradeCard } from './ui.js';
const { $, $$, esc, ic, ls, api, toast, S, dmy } = H;

const KEEP = 40;            // messages kept on the phone
const SEND = 9;             // the question plus the 8 before it go to the backend
const st = {
  msgs: ls.get('chat', []),
  busy: false,
  draft: '',
  hint: '',
  fresh: -1,                // index of the answer to type out once
  rec: null,
  hearing: false
};
const save = () => ls.set('chat', st.msgs.slice(-KEEP));

const HINTS = ['Membaca rekod…', 'Mencari aktiviti berkaitan…', 'Menyemak tarikh…', 'Menyusun jawapan…'];

function suggestions() {
  const cats = (S.meta && S.meta.cats) || [];
  const pick = cats.find((c) => /EPS|ELECTRICAL|POWER/i.test(c.key + c.label)) || cats[0];
  const sys = pick ? (pick.button || pick.label) : 'EPS';
  return [
    ['flag', 'Apa kemajuan kerja hari ini?'],
    ['box', 'Bila bahan terakhir tiba di tapak?'],
    ['clock', 'Kerja apa yang masih belum siap?'],
    ['check', 'Apa yang siap minggu ini?'],
    ['bolt', 'Apa status terkini ' + sys + '?'],
    ['bell', 'Sistem mana lama tiada kemas kini?'],
    ['cal', 'Apa rancangan esok?'],
    ['users', 'Berapa tenaga kerja hari ini?']
  ];
}
const FOLLOW = ['Ringkaskan dalam 3 poin', 'Siapa yang melaporkannya?', 'Tulis untuk WhatsApp (English)'];

function offView(c) {
  const why = c && c.why;
  const msg = why === 'eng' ? ['Untuk engineer sahaja', 'Tanya DPR dibuka kepada engineer buat masa ini.']
    : why === 'off' ? ['Tanya DPR ditutup', 'Engineer telah menutup ciri ini. Ia boleh dibuka semula dalam Saya → Tetapan.']
      : ['Perlukan kunci AI', 'Engineer: tambah GEMINI_API_KEY dalam Script properties projek Apps Script, kemudian buka semula app.'];
  return '<div class="card chat-off"><div class="orb">' + ic('sparkles') + '</div><h3>' + msg[0] + '</h3><p>' + msg[1] + '</p></div>';
}

function refCard(r, n) {
  if (r.kind === 'entry') {
    const e = r.entry;
    return '<button class="ref-card" data-ref="' + esc(r.ref) + '"><span class="k"><span class="cite">' + n + '</span>' + tagm(e.area) + '<span>' + esc(e.catLabel) + '</span><span>' + esc(dmy(e.date)) + '</span></span>' +
      '<span class="t">' + esc(e.text) + '</span><span class="s">' + H.statusPill(e.status) + (e.photos.length ? '<span>📷 ' + e.photos.length + '</span>' : '') + '</span></button>';
  }
  if (r.kind === 'material') {
    return '<button class="ref-card" data-ref="' + esc(r.ref) + '"><span class="k"><span class="cite">' + n + '</span>' + tagm(r.area) + '<span>' + esc(r.label) + '</span><span>' + esc(dmy(r.date)) + '</span></span>' +
      '<span class="t">' + esc(r.item) + '</span><span class="s">' + ic('box', 'xs') + ' Bahan tiba</span></button>';
  }
  return '<button class="ref-card" data-ref="' + esc(r.ref) + '"><span class="k"><span class="cite">' + n + '</span>' + tagm(r.area) + '<span>' + esc(r.label) + '</span><span>' + esc(dmy(r.date)) + '</span></span>' +
    '<span class="t">' + esc(r.text) + '</span><span class="s">' + ic('flag', 'xs') + ' Rancangan' + (r.by ? ' · ' + esc(r.by) : '') + '</span></button>';
}

function msgHtml(m, i) {
  if (m.role === 'user') return '<div class="msg me"><div class="bub">' + esc(m.text) + '</div></div>';
  if (m.err) return '<div class="msg ai err"><div class="bub">' + esc(m.text) + '</div><div class="msg-tools"><button data-retry>' + ic('sync', 'xs') + ' Cuba lagi</button></div></div>';
  const refs = m.refs || [];
  const num = (id) => { const k = refs.findIndex((r) => r.ref === id); return k < 0 ? '' : '<button class="cite" data-cite="' + esc(id) + '" data-m="' + i + '">' + (k + 1) + '</button>'; };
  const steps = m.steps || [];
  const last = i === st.msgs.length - 1;
  return '<div class="msg ai" data-mi="' + i + '">' +
    (steps.length ? '<details class="looked"><summary>' + ic('search', 'xs') + ' ' + steps.length + ' semakan rekod ' + ic('chevDown', 'xs') + '</summary><ul>' + steps.map((s) => '<li>' + esc(s.t) + '</li>').join('') + '</ul></details>' : '') +
    '<div class="bub" data-bub>' + md(m.text, num) + '</div>' +
    (refs.length ? '<div class="refs" data-refs="' + i + '">' + refs.map((r, k) => refCard(r, k + 1)).join('') + '</div>' : '') +
    '<div class="msg-tools"><button data-copy="' + i + '">' + ic('copy', 'xs') + ' Salin</button><button data-share="' + i + '">' + ic('share', 'xs') + ' Kongsi</button></div>' +
    (last && !st.busy ? '<div class="follow">' + FOLLOW.map((f) => '<button data-ask="' + esc(f) + '">' + esc(f) + '</button>').join('') + '</div>' : '') + '</div>';
}

function view() {
  const c = S.meta && S.meta.chat;
  let h = H.topbar('Tanya DPR', 'Jawapan daripada rekod laporan');
  if (oldBackend()) return h + upgradeCard('Tanya DPR');
  if (S.meta && !(c && c.on)) return h + offView(c);
  h += '<div class="chat-wrap">';
  if (!st.msgs.length) {
    h += '<div class="chat-hero rise"><div class="orb">' + ic('sparkles') + '</div><h2>Tanya apa sahaja</h2><p>Kemajuan kerja, bila bahan tiba, bila aktiviti siap. Jawapan disertakan rekod sumbernya.</p></div>' +
      '<div class="sugg-t">Cuba tanya</div><div class="sugg">' + suggestions().map((s) => '<button class="sugg-b" data-ask="' + esc(s[1]) + '"><span class="ic">' + ic(s[0], 's') + '</span><span class="grow">' + esc(s[1]) + '</span></button>').join('') + '</div>';
  } else {
    h += '<div class="msgs">' + st.msgs.map(msgHtml).join('') +
      (st.busy ? '<div class="msg ai"><div class="bub typing"><span class="dots"><i></i><i></i><i></i></span><span data-hint>' + esc(st.hint || HINTS[0]) + '</span></div></div>' : '') + '</div>' +
      (!st.busy ? '<p class="chat-note"><button class="link" data-clear>' + ic('trash', 'xs') + ' Mula perbualan baru</button></p>' : '');
  }
  h += '<p class="chat-note">AI boleh tersilap. Tekan nombor sumber untuk semak rekod asal.</p></div>';
  h += '<div class="composer"><div class="composer-in"><textarea id="cq" rows="1" placeholder="Tanya tentang kerja, bahan, tarikh…" enterkeyhint="send" aria-label="Soalan">' + esc(st.draft) + '</textarea>' +
    (canRecord() && S.meta && S.meta.voice ? '<button class="cbtn' + (st.rec ? ' rec' : '') + '" data-mic aria-label="' + (st.rec ? 'Berhenti merakam' : 'Tanya dengan suara') + '">' + (st.hearing ? '<span class="spin"></span>' : ic(st.rec ? 'stop' : 'mic')) + '</button>' : '') +
    '<button class="cbtn send" data-send aria-label="Hantar"' + (st.busy ? ' disabled' : '') + '>' + ic('up') + '</button></div></div>';
  return h;
}

const toBottom = (smooth) => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });

function typeOut(el, html) {
  // reveal the finished answer piece by piece (the backend answers in one go)
  const full = document.createElement('div');
  full.innerHTML = html;
  const nodes = [];
  const walk = (n) => { n.childNodes.forEach((c) => { if (c.nodeType === 3) nodes.push(c); else walk(c); }); };
  walk(full);
  const texts = nodes.map((n) => n.textContent);
  const total = texts.reduce((a, t) => a + t.length, 0);
  nodes.forEach((n) => { n.textContent = ''; });
  el.innerHTML = '';
  while (full.firstChild) el.appendChild(full.firstChild);
  const step = Math.max(2, Math.ceil(total / 90));
  let shown = 0;
  const tick = () => {
    if (!el.isConnected) return;
    shown = Math.min(total, shown + step);
    let left = shown;
    nodes.forEach((n, i) => { const t = texts[i]; n.textContent = left >= t.length ? t : t.slice(0, Math.max(0, left)); left -= t.length; });
    if (shown < total) { requestAnimationFrame(tick); if (window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 160) toBottom(); }
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { nodes.forEach((n, i) => { n.textContent = texts[i]; }); return; }
  tick();
}

function openRef(m, id) {
  const r = (m.refs || []).find((x) => x.ref === id);
  if (!r) return;
  if (r.kind === 'entry') return H.openEntry(r.entry);
  const body = r.kind === 'material'
    ? '<dl class="kv"><dt>Bahan</dt><dd>' + esc(r.item) + '</dd><dt>Sistem</dt><dd>' + esc(unitName(r.area) + ' · ' + r.label) + '</dd><dt>Tarikh tiba</dt><dd>' + esc(dmy(r.date)) + '</dd></dl>'
    : '<p class="d-text">' + esc(r.text) + '</p><dl class="kv" style="margin-top:12px"><dt>Sistem</dt><dd>' + esc(unitName(r.area) + ' · ' + r.label) + '</dd><dt>Dirancang untuk</dt><dd>' + esc(dmy(r.date)) + '</dd>' + (r.by ? '<dt>Oleh</dt><dd>' + esc(r.by) + '</dd>' : '') + '</dl>';
  const L = H.openLayer('<div class="card">' + body + '</div>', { title: r.kind === 'material' ? 'Bahan tiba' : 'Rancangan',
    foot: r.date <= H.today() ? '<button class="btn soft block" data-day>' + ic('cal', 's') + ' Buka hari ' + esc(dmy(r.date)) + '</button>' : '' });
  const b = $('[data-day]', L.el);
  if (b) b.onclick = () => { H.closeLayer(); H.whenSettled(() => { H.go('home', 'data'); H.setDate(r.date); }); };
}

async function ask(text) {
  text = String(text || '').trim();
  if (!text || st.busy) return;
  if (!navigator.onLine) return toast('Tanya DPR perlukan internet.', 'bad');
  st.msgs.push({ role: 'user', text });
  st.draft = ''; st.busy = true; st.hint = HINTS[0];
  save();
  draw(true);
  let k = 0;
  const timer = setInterval(() => { k = Math.min(k + 1, HINTS.length - 1); st.hint = HINTS[k]; const el = $('[data-hint]'); if (el) el.textContent = st.hint; }, 3500);
  try {
    const hist = st.msgs.filter((m) => !m.err).slice(-SEND).map((m) => ({ role: m.role, text: m.text }));
    const r = await api('chat', { messages: hist }, { timeout: 120000 });
    st.msgs.push({ role: 'assistant', text: r.reply, refs: r.refs || [], steps: r.steps || [], provider: r.provider, at: Date.now() });
    st.fresh = st.msgs.length - 1;
    H.buzz(12);
  } catch (e) {
    st.msgs.push({ role: 'assistant', err: true, text: e.message || 'Tidak dapat menjawab sekarang.' });
    if (/^chat_/.test(e.code || '')) H.loadMeta().catch(() => {});
  }
  clearInterval(timer);
  st.busy = false;
  save();
  draw(true);
}

function draw(bottom) {
  if (S.tab !== 'chat') return;
  H.render();
  if (bottom) requestAnimationFrame(() => toBottom(true));
}

async function mic() {
  if (st.hearing) return;
  if (!st.rec) {
    try { st.rec = await record(45000, () => mic()); } catch (e) { return micError(e); }
    H.buzz(15); keepDraft(); draw();
    return;
  }
  const r = st.rec; st.rec = null; st.hearing = true; keepDraft(); draw();
  try {
    const blob = await r.stop();
    if (!blob) toast('Rakaman terlalu pendek.', 'bad');
    else {
      const out = await api('voice', { b64: await H.blobToB64(blob), mime: 'audio/wav' }, { timeout: 90000 });
      st.draft = (st.draft ? st.draft + ' ' : '') + (out.transcript || '').trim();
    }
  } catch (e) { toast(e.message || 'Tidak dapat mendengar.', 'bad'); }
  st.hearing = false;
  draw();
  const q = $('#cq'); if (q) { q.focus(); grow(q); }
}

const keepDraft = () => { const q = $('#cq'); if (q) st.draft = q.value; };
const grow = (q) => { q.style.height = '44px'; q.style.height = Math.min(120, q.scrollHeight) + 'px'; };

function bind() {
  H.bindCommon();
  const q = $('#cq');
  if (q) {
    grow(q);
    q.oninput = () => { st.draft = q.value; grow(q); };
    q.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(q.value); } };
  }
  const s = $('[data-send]'); if (s) s.onclick = () => { H.buzz(); ask(q.value); };
  const m = $('[data-mic]'); if (m) m.onclick = () => mic();
  $$('[data-ask]').forEach((b) => { b.onclick = () => { H.buzz(); ask(b.dataset.ask); }; });
  const c = $('[data-clear]'); if (c) c.onclick = async () => { if (!(await H.confirmBox('Mula perbualan baru?', 'Perbualan ini dipadam dari telefon ini. Rekod laporan tidak terjejas.', 'Padam', 'danger'))) return; st.msgs = []; save(); draw(); };
  const rt = $('[data-retry]'); if (rt) rt.onclick = () => { const i = st.msgs.length - 1; if (!st.msgs[i] || !st.msgs[i].err) return; st.msgs.pop(); const u = st.msgs.pop(); save(); ask(u ? u.text : ''); };
  $$('[data-copy]').forEach((b) => { b.onclick = () => copyText(plain(st.msgs[Number(b.dataset.copy)]), 'Jawapan disalin.'); });
  $$('[data-share]').forEach((b) => { b.onclick = () => shareText(plain(st.msgs[Number(b.dataset.share)]), 'Tanya DPR'); });
  $$('[data-cite]').forEach((b) => {
    b.onclick = () => {
      const card = $('.ref-card[data-ref="' + b.dataset.cite + '"]', $('[data-refs="' + b.dataset.m + '"]'));
      if (!card) return;
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      card.classList.add('hot'); setTimeout(() => card.classList.remove('hot'), 1400);
    };
  });
  $$('[data-refs]').forEach((box) => { const m = st.msgs[Number(box.dataset.refs)]; $$('.ref-card', box).forEach((card) => { card.onclick = () => openRef(m, card.dataset.ref); }); });
  if (st.fresh >= 0) {
    const el = $('.msg[data-mi="' + st.fresh + '"] [data-bub]');
    st.fresh = -1;
    if (el) typeOut(el, el.innerHTML);
  }
}

/** The answer as plain text, sources listed underneath. */
function plain(m) {
  if (!m) return '';
  const refs = m.refs || [];
  let t = String(m.text).replace(/\*\*/g, '').replace(/\[([AMP]\d+)\]/g, (x, id) => { const k = refs.findIndex((r) => r.ref === id); return k < 0 ? '' : '[' + (k + 1) + ']'; });
  if (refs.length) t += '\n\nSumber:\n' + refs.map((r, k) => '[' + (k + 1) + '] ' + dmy(r.kind === 'entry' ? r.entry.date : r.date) + ' · ' + (r.kind === 'entry' ? r.entry.catLabel + ' · ' + r.entry.text : r.kind === 'material' ? r.label + ' · ' + r.item : r.label + ' · ' + r.text)).join('\n');
  return t;
}

/** Other screens hand a question over ("Tanya tentang ini"). */
export function askAbout(text, send) {
  H.whenSettled(() => {
    H.go('chat');
    if (send) ask(text);
    else { st.draft = text; draw(); const q = $('#cq'); if (q) q.focus(); }
  });
}

export function init() {
  H.VIEWS.chat = { render: view, bind };
  H.HOOK.ask = askAbout;
}
