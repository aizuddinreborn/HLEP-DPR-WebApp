// Faster entry: carry on yesterday's unfinished work, voice notes, a system suggested from the photo, paste and drag-drop.
import { H, canRecord, record, micError } from './ui.js';
const { $, $$, esc, ic, ls, api, toast, S, dmy } = H;

// ---------- "Sambung": work still in progress on each system's last working day ----------
function homeTop(d) {
  const list = d.carry || [];
  if (!list.length || S.date !== H.today() || ls.get('carryHide', '') === S.date) return '';
  return '<div class="carry-h"><h2>Sambung kerja sebelum ini</h2><button data-carryx>Sembunyi</button></div><div class="carry">' + list.map((c, i) =>
    '<div class="carry-it"><div class="k">' + esc(c.catLabel) + '<span>' + esc(H.relDay(c.date) === 'Semalam' ? 'semalam' : dmy(c.date).slice(0, 5)) + '</span></div><div class="t">' + esc(c.text) + '</div>' +
    '<div class="btn-row"><button class="btn soft" data-carry="' + i + '" data-as="IP">' + ic('repeat', 's') + ' Sambung</button><button class="btn mint" data-carry="' + i + '" data-as="CP">' + ic('check', 's') + ' Siap</button></div></div>').join('') + '</div>';
}
function homeBind(d) {
  const x = $('[data-carryx]'); if (x) x.onclick = () => { ls.set('carryHide', S.date); H.render(); };
  $$('[data-carry]').forEach((b) => {
    b.onclick = () => {
      const c = d.carry[Number(b.dataset.carry)];
      H.buzz();
      // "Sambung" keeps the wording (still ongoing); "Siap" lets the AI rewrite it as completed
      if (b.dataset.as === 'IP') H.addSheet({ area: c.area, cat: c.cat, status: 'IP', shift: c.shift, raw: c.raw || c.text, text: c.text, date: S.date });
      else H.addSheet({ area: c.area, cat: c.cat, status: 'CP', shift: c.shift, raw: c.text, date: S.date });
    };
  });
}

// ---------- inside the add-activity sheet ----------
function add(ctx) {
  const { st, body, L, draw, keep, addFiles } = ctx;
  if (!L.quick) {
    L.quick = { rec: null, busy: '' };
    // paste a screenshot / drop photos from the laptop
    const onPaste = (e) => {
      if (L.closed || H.layers[H.layers.length - 1] !== L) return;
      const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter((f) => /^image\//.test(f.type));
      if (files.length) { e.preventDefault(); keep(); addFiles(files); toast(files.length + ' gambar ditampal.', 'ok'); }
    };
    document.addEventListener('paste', onPaste);
    const prev = L.onClose;
    L.onClose = () => { document.removeEventListener('paste', onPaste); if (L.quick.rec) L.quick.rec.cancel(); if (prev) prev(); };
    L.el.addEventListener('dragover', (e) => { e.preventDefault(); L.el.classList.add('dropping'); });
    L.el.addEventListener('dragleave', () => L.el.classList.remove('dropping'));
    L.el.addEventListener('drop', (e) => { e.preventDefault(); L.el.classList.remove('dropping'); const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []); if (files.length) { keep(); addFiles(files); } });
  }
  const q = L.quick;
  const meta = S.meta || {};

  // a system suggested from the first photo (before a system is chosen)
  const ph = $('.photos', body);
  const ready = st.photos.find((p) => !p.busy && p.blob);
  if (ph && meta.guess && ready && !st.cat) {
    const row = document.createElement('div');
    row.className = 'ai-row';
    row.innerHTML = '<button class="ai-btn" data-guess' + (q.busy ? ' disabled' : '') + '>' + (q.busy === 'guess' ? '<span class="spin" style="width:16px;height:16px;border-width:2px"></span> AI melihat gambar…' : ic('sparkles', 's') + ' Cadang sistem &amp; ayat dari gambar') + '</button>';
    ph.after(row);
    $('[data-guess]', row).onclick = async () => {
      if (!navigator.onLine) return toast('Perlu internet untuk cadangan AI.', 'bad');
      keep(); q.busy = 'guess'; draw();
      try {
        await api('upload', { cid: ready.cid, date: dmy(st.date), mime: 'image/jpeg', b64: await H.blobToB64(ready.blob), taken: ready.taken }, { timeout: 90000 });
        const g = await api('guess', { cid: ready.cid, area: st.area }, { timeout: 90000 });
        if (g.cat) {
          st.area = g.area; st.cat = g.cat;
          if (g.line && !st.raw && !st.text) { st.text = g.line; st.aiDone = true; }
          toast('AI cadang: ' + g.label + '. Semak sebelum simpan.', 'ok');
        } else toast('AI tidak pasti sistemnya. Pilih sendiri.', '');
      } catch (e) { toast(e.message, 'bad'); }
      q.busy = ''; draw();
    };
  }

  // a voice note → the report line
  const raw = $('#raw', body);
  if (raw && meta.voice && canRecord()) {
    const row = document.createElement('div');
    row.className = 'ai-row';
    row.innerHTML = '<button class="ai-btn' + (q.rec ? ' rec' : '') + '" data-voice' + (q.busy ? ' disabled' : '') + '>' +
      (q.busy === 'voice' ? '<span class="spin" style="width:16px;height:16px;border-width:2px"></span> AI mendengar…' : q.rec ? '<span class="dot"></span> Merakam… tekan untuk berhenti' : ic('mic', 's') + ' Rakam nota suara') + '</button>';
    raw.after(row);
    const hint = raw.parentElement.querySelector('.hint'); if (hint) hint.remove();
    const stop = async () => {
      const r = q.rec; q.rec = null; q.busy = 'voice'; keep(); draw();
      try {
        const blob = await r.stop();
        if (!blob) toast('Rakaman terlalu pendek.', 'bad');
        else {
          const out = await api('voice', { b64: await H.blobToB64(blob), mime: 'audio/wav', area: st.area, cat: st.cat, status: st.status || 'IP', shift: st.shift }, { timeout: 90000 });
          st.raw = (st.raw ? st.raw + ' ' : '') + (out.transcript || '');
          if (out.line) { st.text = out.line; st.aiDone = true; }
          toast('Nota suara ditukar kepada ayat laporan.', 'ok');
        }
      } catch (e) { toast(e.message || 'Tidak dapat mendengar.', 'bad'); }
      q.busy = ''; if (!L.closed) draw();
    };
    $('[data-voice]', row).onclick = async () => {
      if (q.rec) return stop();
      if (!navigator.onLine) return toast('Perlu internet untuk nota suara.', 'bad');
      try { q.rec = await record(120000, () => { if (q.rec) stop(); }); } catch (e) { return micError(e); }
      H.buzz(15); keep(); draw();
    };
  }
}

export function init() {
  H.HOOK.homeTop = homeTop;
  H.HOOK.homeBind = homeBind;
  H.HOOK.add = add;
}
