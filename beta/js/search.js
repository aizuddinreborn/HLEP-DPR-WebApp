// Cari: find any old record by words (Malay or English), unit, status, period, system.
import { H, resCard, unitName, oldBackend } from './ui.js';
const { $, $$, esc, ic, ls, api, dmy } = H;

const PERIODS = [['', 'Bila-bila'], ['7', '7 hari'], ['30', '30 hari'], ['90', '90 hari']];

function open(preset) {
  if (oldBackend()) return H.toast('Carian perlukan backend versi w2.0. Minta engineer kemas kini.', 'bad');
  preset = preset || {};
  const f = { q: preset.q || '', unit: preset.unit || '', status: preset.status || '', period: preset.period || '', photos: false, cat: preset.cat || '', catLabel: preset.catLabel || '' };
  let res = null, items = [], busy = false, err = '', seq = 0, timer = null;
  const L = H.openLayer('<div class="searchbar">' + ic('search', 's') + '<input id="sq" type="search" enterkeyhint="search" autocomplete="off" placeholder="cth: kabel, battery rack, IR test" value="' + esc(f.q) + '" autofocus><button data-x aria-label="Kosongkan">' + ic('x', 's') + '</button></div>' +
    '<div class="fchips" id="sf"></div><div id="sr"></div>', { title: 'Cari rekod', full: true });
  const box = $('#sr', L.el), input = $('#sq', L.el);
  const active = () => f.q.trim() || f.unit || f.status || f.period || f.photos || f.cat;

  const chips = () => {
    const c = (k, v, label, on) => '<button class="chip sm' + (on ? ' on' : '') + '" data-f="' + k + '" data-v="' + esc(v) + '">' + label + '</button>';
    $('#sf', L.el).innerHTML = (f.cat ? '<button class="chip sm on" data-f="cat" data-v="">' + esc(f.catLabel || f.cat) + ' ' + ic('x', 'xs') + '</button>' : '') +
      c('unit', 'U1', 'Unit 1', f.unit === 'U1') + c('unit', 'U4', 'Unit 4', f.unit === 'U4') +
      c('status', 'CP', 'Siap', f.status === 'CP') + c('status', 'IP', 'Sedang dibuat', f.status === 'IP') + c('status', 'NS', 'Belum mula', f.status === 'NS') +
      PERIODS.slice(1).map((p) => c('period', p[0], p[1], f.period === p[0])).join('') + c('photos', '1', ic('image', 'xs') + ' Bergambar', f.photos);
    $$('[data-f]', L.el).forEach((b) => {
      b.onclick = () => {
        const k = b.dataset.f, v = b.dataset.v;
        if (k === 'photos') f.photos = !f.photos; else if (k === 'cat') { f.cat = ''; f.catLabel = ''; } else f[k] = f[k] === v ? '' : v;
        H.buzz(); chips(); run(true);
      };
    });
  };

  const body = (off) => ({ q: f.q.trim(), unit: f.unit, status: f.status, cat: f.cat, photos: f.photos, from: f.period ? dmy(H.addDays(H.today(), -(Number(f.period) - 1))) : '', limit: 30, offset: off || 0 });

  const draw = () => {
    if (!active()) {
      const rec = ls.get('recent', []);
      box.innerHTML = '<div class="card empty" style="margin-top:16px;padding:26px 18px"><h3>Cari dalam semua rekod</h3><p>Taip dalam BM atau English. “kabel” juga jumpa “cable”; “siap” jumpa “completed”.</p></div>' +
        (rec.length ? '<div class="res-h">Carian terakhir<span><button class="link" data-clr>Padam</button></span></div><div class="recent">' + rec.map((r) => '<button class="chip sm" data-rec="' + esc(r) + '">' + ic('history', 'xs') + ' ' + esc(r) + '</button>').join('') + '</div>' : '');
      $$('[data-rec]', box).forEach((b) => { b.onclick = () => { input.value = f.q = b.dataset.rec; run(true); }; });
      const cl = $('[data-clr]', box); if (cl) cl.onclick = () => { ls.del('recent'); draw(); };
      return;
    }
    if (!res) { box.innerHTML = err ? '<div class="banner rose" style="margin-top:14px">' + ic('warn') + '<div class="grow">' + esc(err) + '</div></div>' : '<div class="skel" style="height:110px;margin-top:14px"></div><div class="skel" style="height:110px;margin-top:10px"></div>'; return; }
    let h = '';
    const mats = res.materials || [];
    if (mats.length) h += '<div class="res-h">Bahan tiba<span>' + res.materialsTotal + '</span></div><div class="card">' + mats.slice(0, 5).map((m) => '<div class="list-row"><span class="ic" style="background:var(--mint-50);color:var(--mint)">' + ic('box', 's') + '</span><div class="grow"><div class="t">' + esc(m.item) + '</div><div class="s">' + esc(unitName(m.area) + ' · ' + m.label + ' · tiba ' + dmy(m.date)) + '</div></div></div>').join('') + '</div>';
    h += '<p class="res-n">' + (res.total ? res.total + ' aktiviti dijumpai' + (res.loose ? ' (padanan hampir: tidak semua perkataan sepadan)' : '') : 'Tiada aktiviti sepadan.') + (busy ? ' · mencari…' : '') + '</p>';
    if (!res.total && !mats.length) h += '<div class="card empty" style="margin-top:10px;padding:24px 18px"><h3>Tiada padanan</h3><p>Cuba perkataan lain, buang penapis, atau tanya Tanya DPR.</p>' + (H.S.meta && H.S.meta.chat && H.S.meta.chat.on && f.q.trim() ? '<button class="btn soft" style="margin-top:14px" data-ask>' + ic('sparkles', 's') + ' Tanya DPR</button>' : '') + '</div>';
    let date = '';
    items.forEach((e) => {
      if (e.date !== date) { date = e.date; h += '<div class="res-h">' + esc(H.relDay(e.date) === H.hari(e.date) ? H.hari(e.date) : H.relDay(e.date)) + ' · ' + esc(dmy(e.date)) + '<span>' + items.filter((x) => x.date === date).length + '</span></div>'; }
      h += resCard(e, res.words);
    });
    if (res.more) h += '<button class="btn soft block" style="margin-top:14px" data-moreb>Muat lagi (' + (res.total - items.length) + ')</button>';
    box.innerHTML = h;
    $$('[data-res]', box).forEach((a) => { a.onclick = () => { const e = items.find((x) => x.id === a.dataset.res); if (e) H.openEntry(e); }; });
    const mb = $('[data-moreb]', box); if (mb) mb.onclick = () => { H.busy(mb, true); run(false, items.length); };
    const ab = $('[data-ask]', box); if (ab) ab.onclick = () => { H.closeLayer(); H.HOOK.ask(f.q.trim(), true); };
    H.loadThumbs([].concat(...items.map((e) => e.photos.slice(0, 3))));
  };

  const run = (now, off) => {
    clearTimeout(timer);
    if (!active()) { res = null; items = []; seq++; return draw(); }
    const go = async () => {
      const my = ++seq;
      busy = true; err = '';
      if (!off) { if (!res) draw(); }
      try {
        const r = await api('search', body(off));
        if (my !== seq || L.closed) return;
        if (off) { items = items.concat(r.items); res.more = r.more; } else { res = r; items = r.items; }
        const q = f.q.trim();
        if (q.length > 2 && r.total) { const rec = ls.get('recent', []).filter((x) => x !== q); rec.unshift(q); ls.set('recent', rec.slice(0, 8)); }
      } catch (e) { if (my !== seq) return; err = e.message; if (!off) res = null; else H.toast(e.message, 'bad'); }
      busy = false;
      draw();
    };
    if (now) go(); else timer = setTimeout(go, 350);
  };

  input.oninput = () => { f.q = input.value; run(false); };
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); run(true); } };
  $('[data-x]', L.el).onclick = () => { input.value = f.q = ''; input.focus(); run(true); };
  chips();
  if (active()) run(true); else draw();
  if (window.innerWidth <= 899 && !active()) setTimeout(() => input.focus(), 350);
}

export function init() {
  H.HOOK.search = open;
  // "/" or Ctrl/⌘+K on a laptop
  document.addEventListener('keydown', (e) => {
    if (!H.S.session || H.layers.length) return;
    const typing = /^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if ((e.key === '/' && !typing) || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); open(); }
  });
}
