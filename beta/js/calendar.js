// Date picker as a month grid: each day shows how many activities it has, so old records are one tap away.
import { H, oldBackend } from './ui.js';
const { $, $$, esc, ic, api, dmy } = H;

const months = {};          // 'yyyy-mm' → { days: { ymd: { n, cp } }, at }
const BULAN_PENUH = ['Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun', 'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'];

function open(cur, cb) {
  if (oldBackend()) return H.pickDate(cur, cb);          // the old backend has no day counts: the plain picker
  let month = cur.slice(0, 7);
  const today = H.today();
  const L = H.openLayer('<div id="calb"></div>', { title: 'Pilih tarikh' });
  const body = $('#calb', L.el);
  const shift = (m, n) => { const p = m.split('-').map(Number); const d = new Date(Date.UTC(p[0], p[1] - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const load = (m) => {
    const c = months[m];
    if (c && Date.now() - c.at < 120000) return;
    api('cal', { month: m }).then((r) => { months[m] = { days: r.days, at: Date.now() }; if (!L.closed && month === m) draw(); }).catch(() => {});
  };
  const pick = (d) => { H.closeLayer(); H.whenSettled(() => cb(d)); };
  const draw = () => {
    const p = month.split('-').map(Number);
    const first = new Date(Date.UTC(p[0], p[1] - 1, 1));
    const len = new Date(Date.UTC(p[0], p[1], 0)).getUTCDate();
    const lead = (first.getUTCDay() + 6) % 7;          // Monday first
    const data = months[month];
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span></span>';
    let total = 0, daysWith = 0;
    for (let d = 1; d <= len; d++) {
      const ymd = month + '-' + String(d).padStart(2, '0');
      const x = data && data.days[ymd];
      if (x) { total += x.n; daysWith++; }
      cells += '<button class="cal-d' + (x ? ' has' : '') + (x && x.cp === x.n ? ' full' : '') + (ymd === today ? ' today' : '') + (ymd === cur ? ' sel' : '') + '" data-d="' + ymd + '"' + (ymd > today ? ' disabled' : '') +
        ' aria-label="' + esc(dmy(ymd)) + (x ? ', ' + x.n + ' aktiviti' : '') + '">' + d + (x ? '<small>' + x.n + '</small>' : '') + '</button>';
    }
    body.innerHTML = '<div class="cal-h"><button class="iconbtn sm" data-m="-1" aria-label="Bulan sebelum">' + ic('left', 's') + '</button><b>' + BULAN_PENUH[p[1] - 1] + ' ' + p[0] + '</b>' +
      '<button class="iconbtn sm" data-m="1" aria-label="Bulan seterusnya"' + (shift(month, 1) > today.slice(0, 7) ? ' disabled' : '') + '>' + ic('right', 's') + '</button></div>' +
      '<div class="calgrid">' + ['Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab', 'Ahd'].map((w) => '<span class="dow">' + w + '</span>').join('') + cells + '</div>' +
      '<p class="cal-sum">' + (data ? (total ? total + ' aktiviti dalam ' + daysWith + ' hari · nombor = bilangan aktiviti' : 'Tiada aktiviti direkod bulan ini') : 'Memuatkan bilangan aktiviti…') + '</p>' +
      '<div class="chips" style="justify-content:center;margin-top:12px">' + [['Hari ini', today], ['Semalam', H.addDays(today, -1)]].map((q) => '<button class="chip sm" data-d="' + q[1] + '">' + q[0] + '</button>').join('') + '</div>';
    $$('[data-d]', body).forEach((b) => { b.onclick = () => { H.buzz(); pick(b.dataset.d); }; });
    $$('[data-m]', body).forEach((b) => { b.onclick = () => { month = shift(month, Number(b.dataset.m)); load(month); draw(); }; });
  };
  load(month);
  draw();
}

export function init() { H.HOOK.calendar = open; }
