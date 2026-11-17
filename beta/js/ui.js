// Shared helpers for the 2.0 feature modules. The core (app.js) exposes itself as window.HLEP.
export const H = window.HLEP;
const { esc, ls, toast, ic, S } = H;

// ---------- theme ----------
export const themePref = () => ls.get('theme', 'auto');
export function applyTheme(pref) {
  if (pref) ls.set('theme', pref);
  const p = themePref();
  const t = p === 'light' || p === 'dark' ? p : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;
  const m = document.getElementById('themecolor');
  if (m) m.content = t === 'dark' ? '#13111D' : '#F4F1FF';
  return t;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (themePref() === 'auto') applyTheme(); });

// ---------- text ----------
export async function copyText(t, msg) {
  try { await navigator.clipboard.writeText(t); }
  catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(msg || 'Disalin.', 'ok');
}
/** The phone's share sheet when it has one, else the clipboard. */
export async function shareText(text, title) {
  if (navigator.share) {
    try { await navigator.share({ title: title || 'HLEP DPR', text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  copyText(text, 'Disalin – tampal di mana-mana.');
}

/** Escaped text with the search words marked. */
export function hl(text, words) {
  let out = esc(text);
  (words || []).filter((w) => w && w.length > 1).forEach((w) => {
    const re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![^<]*>)', 'ig');
    out = out.replace(re, '<mark>$1</mark>');
  });
  return out;
}

/** A small, safe subset of Markdown (the assistant's answers): paragraphs, lists, bold, headings. */
export function md(src, cite) {
  const inline = (s) => {
    let t = esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<b>$1</b>');
    if (cite) t = t.replace(/\[([AMP]\d+)\]/g, (m, id) => cite(id));
    return t;
  };
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push('</' + list + '>'); list = null; } };
  String(src || '').split('\n').forEach((line) => {
    const l = line.trim();
    if (!l) { close(); return; }
    let m;
    if ((m = l.match(/^#{1,4}\s+(.*)$/))) { close(); out.push('<h4>' + inline(m[1]) + '</h4>'); return; }
    if ((m = l.match(/^[-*•]\s+(.*)$/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
    if ((m = l.match(/^\d+[.)]\s+(.*)$/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
    close();
    out.push('<p>' + inline(l) + '</p>');
  });
  close();
  return out.join('');
}

// ---------- what the backend offers ----------
/** True when this backend has a 2.0 feature ("search", "insights", "cal", "carry"). */
export const has = (f) => !!(S.meta && (S.meta.feat || []).indexOf(f) >= 0);
/** The pages are 2.0 but the backend is older (it sends no feature list): the new screens explain instead of failing. */
export const oldBackend = () => !!(S.meta && !S.meta.feat);
export const upgradeCard = (what) => '<div class="card chat-off"><div class="orb">' + ic('tool') + '</div><h3>' + esc(what) + ' belum tersedia</h3>' +
  '<p>Backend app ini masih versi lama (' + esc((S.meta && S.meta.v) || '?') + '). Engineer perlu kemas kini Apps Script ke versi w2.0. Aktiviti, Data dan Laporan berfungsi seperti biasa.</p></div>';

// ---------- small pieces of UI ----------
export const unitName = (a) => (a === 'U4' ? 'Unit 4' : 'Unit 1');
export const tagm = (a) => '<span class="tagm ' + esc(a) + '">' + (a === 'U4' ? 'U4' : 'U1') + '</span>';
export const srcName = (s) => (s === 'web' ? 'web' : s === 'merged' ? 'digabung' : s === 'contractor' ? 'PDF kontraktor' : 'Telegram');
export const dayWord = (n) => (n === 0 ? 'hari ini' : n === 1 ? 'semalam' : n + ' hari lepas');
export const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

/** An activity as a result row (search, chat sources, history): shows its date and system. */
export function resCard(e, words) {
  const ph = e.photos.slice(0, 3).map((id, i) => '<span class="ph"><img data-thumb="' + esc(id) + '" alt="" ' + (S.thumbs.get(id) ? 'src="' + S.thumbs.get(id) + '"' : '') + '>' +
    (i === 2 && e.photos.length > 3 ? '<span class="more">+' + (e.photos.length - 3) + '</span>' : '') + '</span>').join('');
  return '<article class="act" data-res="' + esc(e.id) + '"><div class="sysline">' + tagm(e.area) + esc(e.catLabel) + '</div><div class="meta">' + H.statusPill(e.status) +
    (e.shift === 'N' ? '<span class="pill N">' + ic('moon', 'xs') + ' Malam</span>' : '') + '</div>' +
    '<div class="txt">' + hl(e.text, words) + '</div>' + (ph ? '<div class="strip">' + ph + '</div>' : '') +
    '<div class="by">' + ic('user', 'xs') + esc(e.who) + ' · ' + esc(H.dmy(e.date)) + ' · ' + esc(srcName(e.src)) + '</div></article>';
}

// ---------- voice: record → 16 kHz mono WAV (what the backend's AI reads everywhere) ----------
export const canRecord = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext));

function wav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Starts recording. Returns { stop() → Promise<Blob|null>, cancel() }. Stops by itself after maxMs. */
export async function record(maxMs, onAuto) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const ended = new Promise((res) => { rec.onstop = res; });
  rec.start();
  const t0 = Date.now();
  const off = () => stream.getTracks().forEach((t) => t.stop());
  const timer = setTimeout(() => { if (rec.state === 'recording' && onAuto) onAuto(); }, maxMs || 90000);
  return {
    async stop() {
      clearTimeout(timer);
      if (rec.state !== 'inactive') rec.stop();
      await ended; off();
      if (Date.now() - t0 < 700 || !chunks.length) return null;
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      try {
        const audio = await ctx.decodeAudioData(await new Blob(chunks, { type: rec.mimeType }).arrayBuffer());
        const rate = 16000;
        const offl = new OfflineAudioContext(1, Math.max(1, Math.ceil(audio.duration * rate)), rate);
        const src = offl.createBufferSource();
        src.buffer = audio; src.connect(offl.destination); src.start();
        const done = await offl.startRendering();
        return wav(done.getChannelData(0), rate);
      } finally { if (ctx.close) ctx.close(); }
    },
    cancel() { clearTimeout(timer); try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { /* already stopped */ } off(); }
  };
}

export function micError(e) {
  const n = e && e.name;
  toast(n === 'NotAllowedError' || n === 'SecurityError' ? 'Mikrofon disekat. Benarkan mikrofon untuk laman ini.' : n === 'NotFoundError' ? 'Tiada mikrofon pada peranti ini.' : 'Tidak dapat merakam. Cuba lagi.', 'bad');
}
