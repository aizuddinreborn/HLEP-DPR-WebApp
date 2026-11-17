// Activity detail: tap an activity to read it properly (photos, original note, who/when), then act on it.
import { H, shareText, unitName, srcName, has } from './ui.js';
const { $, $$, esc, ic, api, S, dmy } = H;

function open(e) {
  if (!e) return;
  const chat = S.meta && S.meta.chat && S.meta.chat.on;
  const L = H.openLayer('<div id="dtb"></div>', { title: 'Aktiviti', full: true });
  const body = $('#dtb', L.el);
  let hist = null;
  const next = (fn) => { H.closeLayer(); H.whenSettled(fn); };
  const draw = () => {
    const raw = String(e.raw || '').trim();
    body.innerHTML =
      (e.photos.length ? '<div class="gal">' + e.photos.map((id, i) => '<button data-g="' + i + '" aria-label="Gambar ' + (i + 1) + '"><img data-thumb="' + esc(id) + '" src="' + (S.thumbs.get(id) || '') + '" alt=""></button>').join('') + '</div>' : '') +
      '<div class="act-meta" style="display:flex;gap:6px;flex-wrap:wrap">' + H.statusPill(e.status) + (e.shift === 'N' ? '<span class="pill N">' + ic('moon', 'xs') + ' Malam</span>' : '<span class="pill D">' + ic('sun', 'xs') + ' Siang</span>') +
      (e.src === 'contractor' ? '<span class="pill wait">📄 kontraktor</span>' : '') + '</div>' +
      '<p class="d-text">' + esc(e.text) + '</p>' +
      (raw && raw.toLowerCase() !== String(e.text).toLowerCase() ? '<div class="d-raw">“' + esc(raw) + '”<small style="display:block;font-style:normal;color:var(--ink-3);font-size:12px;margin-top:4px">Nota asal</small></div>' : '') +
      '<div class="acts-row">' +
      (e.edit ? '<button data-a="edit"><span class="ic">' + ic('edit', 's') + '</span>Ubah</button>' : '') +
      '<button data-a="cont"><span class="ic" style="background:var(--peach-50);color:var(--peach)">' + ic('repeat', 's') + '</span>Sambung</button>' +
      '<button data-a="share"><span class="ic" style="background:var(--mint-50);color:var(--mint)">' + ic('share', 's') + '</span>Kongsi</button>' +
      (chat ? '<button data-a="ask"><span class="ic" style="background:var(--pink-50);color:#C0508A">' + ic('sparkles', 's') + '</span>Tanya</button>' : '') + '</div>' +
      '<div class="card" style="margin-top:14px"><dl class="kv"><dt>Tarikh kerja</dt><dd>' + esc(H.hari(e.date) + ', ' + dmy(e.date)) + '</dd><dt>Kawasan</dt><dd>' + esc(unitName(e.area)) + '</dd><dt>Sistem</dt><dd>' + esc(e.catLabel) + '</dd>' +
      '<dt>Dilapor oleh</dt><dd>' + esc(e.who || '—') + '</dd><dt>Dihantar</dt><dd>' + esc(dmy(String(e.at).slice(0, 10)) + ' ' + H.hhmm(e.at)) + '</dd><dt>Melalui</dt><dd>' + esc(srcName(e.src)) + '</dd>' + (e.photos.length ? '<dt>Gambar</dt><dd>' + e.photos.length + '</dd>' : '') + '</dl></div>' +
      (!has('search') ? '' : '<div class="section-t"><h2>Sistem ini sebelum &amp; selepas</h2><span>' + esc(e.catLabel) + '</span></div><div class="card" id="dth">' +
      (hist === null ? '<div class="skel" style="height:70px"></div>' : hist.length ? '<ul class="tl">' + hist.map((x) => '<li class="' + (x.id === e.id ? 'cur' : '') + '"><button data-h="' + esc(x.id) + '"><span class="when">' + esc(dmy(x.date)) + ' · ' + esc(x.status) + (x.id === e.id ? ' · aktiviti ini' : '') + '</span><span class="what">' + esc(x.text) + '</span></button></li>').join('') + '</ul>' +
        '<button class="btn soft sm block" style="margin-top:12px" data-all>' + ic('search', 's') + ' Semua rekod sistem ini</button>' : '<p class="muted">Tiada rekod lain untuk sistem ini.</p>') + '</div>');
    $$('[data-g]', body).forEach((b) => { b.onclick = () => H.viewer(e.photos, Number(b.dataset.g)); });
    $$('[data-a]', body).forEach((b) => {
      b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'edit') return next(() => H.editSheet(e));
        if (a === 'cont') return next(() => H.addSheet({ area: e.area, cat: e.cat, status: 'IP', shift: e.shift, raw: e.raw || e.text, text: e.text, date: H.today() }));
        if (a === 'share') return shareText(dmy(e.date) + ' · ' + unitName(e.area) + ' · ' + e.catLabel + '\n' + e.text + ' (' + e.status + ')', 'Aktiviti HLEP');
        if (a === 'ask') return next(() => H.HOOK.ask('Tentang kerja ini (' + e.catLabel + ', ' + dmy(e.date) + '): "' + e.text + '". Apa perkembangan selepas itu?', true));
      };
    });
    $$('[data-h]', body).forEach((b) => { b.onclick = () => { const x = hist.find((y) => y.id === b.dataset.h); if (x && x.id !== e.id) next(() => open(x)); }; });
    const al = $('[data-all]', body); if (al) al.onclick = () => next(() => H.HOOK.search && H.HOOK.search({ cat: e.cat, catLabel: e.catLabel }));
  };
  draw();
  H.loadThumbs(e.photos);
  if (has('search')) api('search', { cat: e.cat, limit: 8 }).then((r) => { hist = r.items; }).catch(() => { hist = []; }).then(() => { if (!L.closed) { draw(); H.loadThumbs(e.photos); } });
}

export function init() { H.HOOK.entry = open; }
