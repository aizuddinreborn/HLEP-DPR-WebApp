// Papan: progress at a glance. One request ("insights") feeds the whole screen; the last copy shows at once.
import { H, unitName, tagm, dayWord, oldBackend, upgradeCard } from './ui.js';
import { stackBars, miniBars, spark, pctLine, ring } from './charts.js';
const { $, $$, esc, ic, ls, api, S, dmy } = H;

const st = { days: ls.get('boardDays', 14), data: {}, at: {}, busy: {}, err: '', bar: -1, mp: -1, more: false };

function load(force) {
  const n = st.days;
  if (!st.data[n]) { const c = ls.get('ins.' + n, null); if (c) st.data[n] = c; }
  if (st.busy[n] || (!force && st.at[n] && Date.now() - st.at[n] < 60000)) return;
  st.busy[n] = true;
  api('insights', { date: dmy(H.today()), days: n }).then((r) => { st.data[n] = r; st.at[n] = Date.now(); st.err = ''; ls.set('ins.' + n, r); })
    .catch((e) => { st.err = e.message; })
    .then(() => { st.busy[n] = false; if (S.tab === 'board' && st.days === n && !H.layers.length) H.render(); });
}

const delta = (now, prev, unit) => {
  if (!prev && !now) return '<span class="d">sama seperti sebelum</span>';
  const d = now - prev;
  if (!d) return '<span class="d">sama seperti ' + unit + ' sebelum</span>';
  return '<span class="d ' + (d > 0 ? 'up' : 'down') + '">' + ic(d > 0 ? 'trendUp' : 'trendDown') + (d > 0 ? '+' : '') + d + ' berbanding ' + unit + ' sebelum</span>';
};

const ATTN = {
  imports: (a) => ['file', 'lav', a.n + ' senarai PDF kontraktor belum disemak', 'Tanda dan simpan ke dalam laporan'],
  quiet: (a) => ['clock', 'rose', a.label + ': tiada kemas kini ' + a.days + ' hari', a.n + ' kerja masih IP sejak ' + dmy(a.date) + ' · ' + unitName(a.area)],
  nopct: (a) => ['chart', '', a.label + ': peratus belum diisi', 'Ada aktiviti, tetapi tiada % kemajuan'],
  pct: (a) => ['chart', '', a.label + ': % tidak berubah ' + a.days + ' hari', 'Kekal ' + a.pct + '% sejak ' + dmy(a.date)],
  weather: () => ['sun', 'sky', 'Cuaca hari ini belum ditetapkan', 'Dicetak dalam PDF dan teks WhatsApp'],
  manpower: (a) => ['users', 'sky', 'Tenaga kerja hari ini belum dikemas kini', a.last ? 'Terakhir: ' + dmy(a.last) : 'Belum pernah diisi'],
  plan: (a) => ['flag', 'lav', 'Tiada rancangan untuk esok', dmy(a.date) + ' · PDF akan tulis TBA jika kosong']
};

function view() {
  if (oldBackend()) return H.topbar('Papan', 'Kemajuan sekilas pandang') + upgradeCard('Papan');
  load();
  const d = st.data[st.days];
  let h = H.topbar('Papan', 'Kemajuan sekilas pandang');
  h += '<div class="segbar" role="tablist" aria-label="Tempoh">' + [7, 14, 30].map((n) => '<button class="segb" role="tab" data-days="' + n + '" aria-selected="' + (st.days === n) + '">' + n + ' hari</button>').join('') + '</div>';
  if (!d) {
    if (st.err && !st.busy[st.days]) return h + '<div class="banner rose">' + ic('wifiOff') + '<div class="grow"><b>Tidak dapat memuatkan papan</b>' + esc(st.err) + '</div></div><button class="btn soft block" style="margin-top:12px" data-reload>' + ic('sync', 's') + ' Cuba lagi</button>';
    return h + '<div class="skel" style="height:112px"></div><div class="skel" style="height:86px;margin-top:10px"></div><div class="skel" style="height:220px;margin-top:10px"></div>';
  }
  const k = d.kpi, p = d.prev, unit = d.range.days + ' hari';
  const withPct = d.systems.filter((s) => s.hasPct && s.pct != null);
  const avg = withPct.length ? Math.round(withPct.reduce((n, s) => n + s.pct, 0) / withPct.length) : null;
  if (st.err) h += '<div class="banner lav" style="margin-bottom:10px">' + ic('clock') + '<div class="grow">Paparan terakhir (' + esc(st.err) + ')</div></div>';

  h += '<div class="kpis">';
  h += '<div class="kpi hero"><div class="ringw">' + ring(avg) + '<b>' + (avg == null ? '–' : avg + '%') + '</b></div><div class="grow"><div class="l">Purata kemajuan</div><div class="n">' + withPct.length + ' <small style="color:rgba(255,255,255,.8)">sistem diukur</small></div>' +
    '<div class="d">' + esc(dmy(d.range.from).slice(0, 5) + ' – ' + dmy(d.range.to)) + '</div></div></div>';
  h += '<div class="kpi"><div class="l">' + ic('flag', 'xs') + ' Aktiviti</div><div class="n">' + k.acts + '</div>' + delta(k.acts, p.acts, unit) + '</div>';
  h += '<div class="kpi"><div class="l">' + ic('check', 'xs') + ' Siap (CP)</div><div class="n">' + k.cp + ' <small>/ ' + k.acts + '</small></div>' + delta(k.cp, p.cp, unit) + '</div>';
  h += '<div class="kpi"><div class="l">' + ic('image', 'xs') + ' Gambar</div><div class="n">' + k.photos + '</div>' + delta(k.photos, p.photos, unit) + '</div>';
  h += '<div class="kpi"><div class="l">' + ic('users', 'xs') + ' Orang melapor</div><div class="n">' + k.people + '</div><span class="d">' + k.workDays + ' hari ada rekod</span></div>';
  h += '</div>';

  h += '<div class="cols"><div>';
  // attention
  const at = d.attention || [];
  h += '<div class="section-t"><h2>Perlu perhatian</h2><span>' + (at.length || '') + '</span></div><div class="card">';
  if (!at.length) h += '<div class="allgood">' + ic('check') + ' Semua kemas. Tiada yang tertinggal.</div>';
  else {
    const show = st.more ? at : at.slice(0, 4);
    h += show.map((a) => { const x = (ATTN[a.kind] || (() => ['info', '', a.kind, '']))(a); return '<button class="attn-row" data-attn="' + at.indexOf(a) + '"><span class="ic ' + x[1] + '">' + ic(x[0], 's') + '</span><span class="grow"><b>' + esc(x[2]) + '</b><small>' + esc(x[3]) + '</small></span>' + ic('right', 's') + '</button>'; }).join('');
    if (at.length > 4) h += '<button class="btn soft sm block" style="margin-top:8px" data-more>' + (st.more ? 'Tunjuk kurang' : 'Lihat semua (' + at.length + ')') + '</button>';
  }
  h += '</div>';

  // activities per day
  const sel = d.perDay[st.bar];
  h += '<div class="section-t"><h2>Aktiviti setiap hari</h2><span>' + k.acts + ' dalam ' + unit + '</span></div><div class="card">' + stackBars(d.perDay, st.bar) +
    '<div class="legend"><span><i style="background:var(--st-cp)"></i>Siap (CP)</span><span><i style="background:var(--st-ip)"></i>Sedang dibuat (IP)</span><span><i style="background:var(--st-ns)"></i>Belum mula (NS)</span></div>' +
    '<div class="tip">' + (sel ? '<b>' + esc(H.hari(sel.date) + ' ' + dmy(sel.date)) + '</b><span>' + sel.n + ' aktiviti · CP ' + sel.cp + ' · IP ' + sel.ip + ' · NS ' + sel.ns + '</span>' + (sel.weather ? '<span>' + esc(sel.weather) + '</span>' : '') + '<button data-open="' + sel.date + '">Buka hari ›</button>'
      : '<span>Tekan mana-mana bar untuk butiran hari itu.</span>') + '</div></div>';

  // manpower
  const mpPts = d.perDay.map((x) => ({ date: x.date, v: x.mp }));
  if (mpPts.some((x) => x.v != null)) {
    const ms = mpPts[st.mp];
    h += '<div class="section-t"><h2>Tenaga kerja</h2><span>' + (d.manpower.total ? d.manpower.total + ' orang · ' + dmy(d.manpower.date).slice(0, 5) : '') + '</span></div><div class="card">' + miniBars(mpPts, st.mp) +
      '<div class="tip">' + (ms ? '<b>' + esc(dmy(ms.date)) + '</b><span>' + (ms.v == null ? 'tidak dikemas kini hari itu' : ms.v + ' orang') + '</span>' : '<span>' + esc(d.manpower.list.map((m) => m.company + ' ' + m.count).join(' · ') || 'Tiada data') + '</span>') + '</div></div>';
  }
  h += '</div><div class="side">';

  // systems
  const pctS = d.systems.filter((s) => s.hasPct).sort((a, b) => (b.n - a.n) || ((b.pct || 0) - (a.pct || 0)));
  h += '<div class="section-t"><h2>Kemajuan sistem</h2><span>tekan untuk sejarah</span></div><div class="card">' + (pctS.map((s) => {
    const up = s.pct != null && s.pctPrev != null ? s.pct - s.pctPrev : 0;
    return '<button class="sysrow" data-sys="' + esc(s.key) + '"><div class="top">' + tagm(s.area) + '<b>' + esc(s.label) + '</b>' + (up > 0 ? '<span class="up">+' + up + '</span>' : '') + '<span class="v">' + (s.pct == null ? '?' : s.pct) + '%</span></div>' +
      '<div class="bar"><i style="width:' + (s.pct || 0) + '%"></i></div><div class="sub"><span class="grow' + (s.since != null && s.since >= 3 && s.ip ? ' late' : '') + '">' +
      (s.last ? 'Aktiviti terakhir ' + dayWord(s.since) + (s.ip ? ' · ' + s.ip + ' IP' : '') : 'Belum ada aktiviti') + '</span>' + spark(s.hist) + '</div></button>';
  }).join('') || '<p class="muted">Tiada sistem dengan peratus.</p>') + '</div>';
  const other = d.systems.filter((s) => !s.hasPct && s.n).sort((a, b) => b.n - a.n);
  if (other.length) {
    h += '<div class="section-t"><h2>Sistem lain yang aktif</h2><span>' + unit + '</span></div><div class="card">' + other.map((s) => '<button class="attn-row" data-sys="' + esc(s.key) + '"><span class="grow"><b>' + tagm(s.area) + ' ' + esc(s.label) + '</b><small>' + s.n + ' aktiviti · terakhir ' + dayWord(s.since) + '</small></span>' + ic('right', 's') + '</button>').join('') + '</div>';
  }

  // team
  const top = Math.max(1, ...d.team.map((t) => t.range));
  h += '<div class="section-t"><h2>Pasukan</h2><span>aktiviti dalam ' + unit + '</span></div><div class="card">' + d.team.map((t) =>
    '<div class="team-row"><span class="avatar">' + esc(H.initials(t.name)) + '</span><span class="grow"><b>' + esc(t.name) + '</b><small>' + (t.today ? t.today + ' hari ini' : t.last ? 'terakhir ' + esc(dmy(t.last.slice(0, 10))) : 'belum ada rekod') + '</small></span>' +
    '<span class="mini"><i style="width:' + Math.round(100 * t.range / top) + '%"></i></span><span class="n">' + t.range + '</span></div>').join('') + '</div>';

  // arrivals
  h += '<div class="section-t"><h2>Bahan tiba</h2><span>' + d.materials.length + ' dalam ' + unit + '</span></div><div class="card">' +
    (d.materials.length ? d.materials.slice(0, 6).map((m) => '<div class="list-row"><span class="ic" style="background:var(--mint-50);color:var(--mint)">' + ic('box', 's') + '</span><div class="grow"><div class="t">' + esc(m.item) + '</div><div class="s">' + esc(m.label + ' · ' + dmy(m.date)) + '</div></div></div>').join('')
      : '<p class="muted">Tiada bahan tiba dalam tempoh ini' + (d.materialsTotal ? ' (' + d.materialsTotal + ' keseluruhan).' : '.') + '</p>') + '</div>';

  if (S.meta && S.meta.chat && S.meta.chat.on) h += '<button class="ask-card" data-askb><span class="ic">' + ic('sparkles') + '</span><span class="grow"><b>Tanya DPR tentang tempoh ini</b><small>Contoh: ringkaskan kemajuan ' + unit + ' lepas</small></span>' + ic('right', 's') + '</button>';
  h += '<p class="hint" style="text-align:center;margin-top:14px">' + d.total + ' aktiviti direkod sejak ' + esc(d.first ? dmy(d.first) : '—') + (st.busy[st.days] ? ' · mengemas kini…' : '') + '</p>';
  h += '</div></div>';
  return h;
}

function sysSheet(s) {
  let sel = -1;
  const L = H.openLayer('<div id="sysb"></div>', { title: s.label,
    foot: '<div class="btn-row"><button class="btn soft" data-find>' + ic('search', 's') + ' Rekod</button>' + (S.meta && S.meta.chat && S.meta.chat.on ? '<button class="btn primary" data-askb>' + ic('sparkles', 's') + ' Tanya DPR</button>' : '') + '</div>' });
  const body = $('#sysb', L.el);
  const draw = () => {
    const pt = s.hist[sel];
    body.innerHTML = '<div class="card"><div class="row"><div class="grow"><p class="muted" style="font-weight:700;font-size:12.5px">' + esc(unitName(s.area)) + (s.linked ? ' · ikut Electrical Dashboard' : '') + '</p>' +
      '<div style="font-size:40px;font-weight:800;letter-spacing:-.03em;color:var(--lav-d);line-height:1.1">' + (s.hasPct ? (s.pct == null ? '?' : s.pct) + '%' : s.n + ' <span style="font-size:15px;color:var(--ink-3)">aktiviti</span>') + '</div></div>' +
      '<div style="text-align:right;font-size:12.5px;font-weight:700;color:var(--ink-3)">' + (s.last ? 'Aktiviti terakhir<br><b style="color:var(--ink)">' + esc(dmy(s.last)) + '</b>' : 'Belum ada aktiviti') + '</div></div>' +
      (s.hasPct ? '<div class="bar" style="margin-top:10px"><i style="width:' + (s.pct || 0) + '%"></i></div>' : '') + '</div>' +
      (s.hist && s.hist.length ? '<div class="section-t"><h2>Sejarah peratus</h2><span>' + s.hist.length + ' kemas kini</span></div><div class="card">' + pctLine(s.hist, sel) +
        '<div class="tip">' + (pt ? '<b>' + esc(dmy(pt.date)) + '</b><span>' + pt.pct + '%</span>' : '<span>Tekan titik untuk tarikh dan nilai.' + (s.pctBy ? ' Terakhir oleh ' + esc(s.pctBy) + '.' : '') + '</span>') + '</div></div>' : '') +
      '<div class="card" style="margin-top:12px"><dl class="kv"><dt>Aktiviti dalam tempoh</dt><dd>' + s.n + '</dd><dt>Pada hari kerja terakhir</dt><dd>' + s.cp + ' siap · ' + s.ip + ' sedang dibuat</dd></dl></div>';
    $$('[data-pt]', body).forEach((c) => { c.onclick = () => { sel = Number(c.dataset.pt); draw(); }; });
  };
  draw();
  $('[data-find]', L.el).onclick = () => { H.closeLayer(); H.whenSettled(() => H.HOOK.search && H.HOOK.search({ cat: s.key, catLabel: s.label })); };
  const a = $('[data-askb]', L.el); if (a) a.onclick = () => { H.closeLayer(); H.HOOK.ask('Apa status terkini ' + s.label + ' (' + unitName(s.area) + ')? Apa yang masih belum siap?', true); };
}

function attnGo(a) {
  const home = (seg) => { if (S.date !== H.today()) H.setDate(H.today()); H.go('home', seg); };
  if (a.kind === 'imports') return home('acts');
  if (a.kind === 'quiet') return H.HOOK.search && H.HOOK.search({ cat: a.key, catLabel: a.label, status: 'IP' });
  if (a.kind === 'weather') { home('acts'); return H.weatherSheet(); }
  if (a.kind === 'plan' && H.isEng()) { home('data'); return H.planSheet(); }
  home('data');
}

function bind() {
  H.bindCommon();
  const d = st.data[st.days];
  $$('[data-days]').forEach((b) => { b.onclick = () => { H.buzz(); st.days = Number(b.dataset.days); st.bar = -1; st.mp = -1; ls.set('boardDays', st.days); H.render(); }; });
  const rl = $('[data-reload]'); if (rl) rl.onclick = () => { st.err = ''; load(true); H.render(); };
  if (!d) return;
  $$('[data-bar]').forEach((r) => { r.onclick = () => { st.bar = st.bar === Number(r.dataset.bar) ? -1 : Number(r.dataset.bar); keepScroll(); }; });
  $$('[data-mp]').forEach((r) => { r.onclick = () => { st.mp = st.mp === Number(r.dataset.mp) ? -1 : Number(r.dataset.mp); keepScroll(); }; });
  const o = $('[data-open]'); if (o) o.onclick = () => { H.setDate(o.dataset.open); H.go('home', 'acts'); };
  $$('[data-attn]').forEach((b) => { b.onclick = () => attnGo(d.attention[Number(b.dataset.attn)]); });
  const m = $('[data-more]'); if (m) m.onclick = () => { st.more = !st.more; keepScroll(); };
  $$('[data-sys]').forEach((b) => { b.onclick = () => sysSheet(d.systems.find((s) => s.key === b.dataset.sys)); });
  const a = $('[data-askb]'); if (a) a.onclick = () => H.HOOK.ask('Ringkaskan kemajuan kerja ' + d.range.days + ' hari lepas: apa yang siap, apa yang masih berjalan, dan apa yang perlu perhatian.', true);
}
const keepScroll = () => { const y = window.scrollY; H.render(); window.scrollTo(0, y); };

/** After a save elsewhere the numbers are stale. */
export function refresh() { st.at = {}; }

export function init() {
  H.VIEWS.board = { render: view, bind };
  H.HOOK.boardRefresh = refresh;
}
