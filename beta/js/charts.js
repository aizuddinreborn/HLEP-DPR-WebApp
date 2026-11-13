// Small hand-drawn SVG charts (no library). Colours come from CSS tokens, so they follow the theme.
import { H } from './ui.js';
const { esc } = H;

const r1 = (n) => Math.round(n * 10) / 10;
/** A bar with rounded top corners only, anchored to the baseline. */
const topRound = (x, y, w, h, r) => {
  r = Math.min(r, w / 2, h);
  return 'M' + r1(x) + ' ' + r1(y + h) + 'V' + r1(y + r) + 'q0 ' + (-r) + ' ' + r + ' ' + (-r) + 'H' + r1(x + w - r) + 'q' + r + ' 0 ' + r + ' ' + r + 'V' + r1(y + h) + 'Z';
};
const niceMax = (m) => { if (m <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(m))); const f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

/** Activities per day, stacked by status (CP at the baseline). days: [{date, cp, ip, ns}]. */
export function stackBars(days, sel) {
  const W = 340, Hh = 150, L = 22, B = 20, T = 8;
  const max = niceMax(Math.max(1, ...days.map((d) => d.cp + d.ip + d.ns)));
  const pw = (W - L) / days.length;
  const bw = Math.max(3, Math.min(22, pw - (days.length > 20 ? 2 : 5)));
  const y = (v) => T + (Hh - T - B) * (1 - v / max);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Aktiviti setiap hari mengikut status">';
  [0, max / 2, max].forEach((v) => { s += '<line class="grid" x1="' + L + '" x2="' + W + '" y1="' + r1(y(v)) + '" y2="' + r1(y(v)) + '"/><text x="' + (L - 5) + '" y="' + r1(y(v) + 3) + '" text-anchor="end">' + Math.round(v) + '</text>'; });
  const every = days.length > 20 ? 5 : days.length > 10 ? 2 : 1;
  days.forEach((d, i) => {
    const cx = L + pw * i + pw / 2;
    const x = cx - bw / 2;
    if (sel === i) s += '<rect class="sel" x="' + r1(cx - pw / 2 + 1) + '" y="' + T + '" width="' + r1(pw - 2) + '" height="' + (Hh - T - B) + '" rx="6"/>';
    let base = 0;
    const segs = [['cp', 'var(--st-cp)'], ['ip', 'var(--st-ip)'], ['ns', 'var(--st-ns)']].filter((k) => d[k[0]] > 0);
    segs.forEach((k, j) => {
      const v = d[k[0]];
      const y1 = y(base + v), h = y(base) - y1;
      const gap = j ? 2 : 0;                      // a surface-coloured gap between segments
      if (h - gap <= 0.5) { base += v; return; }
      s += j === segs.length - 1 ? '<path d="' + topRound(x, y1, bw, h - gap, 4) + '" fill="' + k[1] + '"/>' : '<rect x="' + r1(x) + '" y="' + r1(y1) + '" width="' + r1(bw) + '" height="' + r1(h - gap) + '" fill="' + k[1] + '"/>';
      base += v;
    });
    if ((days.length - 1 - i) % every === 0) s += '<text x="' + r1(cx) + '" y="' + (Hh - 5) + '" text-anchor="middle">' + Number(d.date.slice(8)) + '</text>';
    s += '<rect class="bar-hit" data-bar="' + i + '" x="' + r1(cx - pw / 2) + '" y="0" width="' + r1(pw) + '" height="' + Hh + '"><title>' + esc(H.dmy(d.date)) + ': ' + (d.cp + d.ip + d.ns) + ' aktiviti</title></rect>';
  });
  return s + '</svg>';
}

/** One measure over days as thin bars (manpower). pts: [{date, v|null}]. */
export function miniBars(pts, sel) {
  const W = 340, Hh = 96, L = 22, B = 18, T = 6;
  const max = niceMax(Math.max(1, ...pts.map((p) => p.v || 0)));
  const pw = (W - L) / pts.length;
  const bw = Math.max(3, Math.min(18, pw - (pts.length > 20 ? 2 : 5)));
  const y = (v) => T + (Hh - T - B) * (1 - v / max);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Tenaga kerja setiap hari">';
  [0, max].forEach((v) => { s += '<line class="grid" x1="' + L + '" x2="' + W + '" y1="' + r1(y(v)) + '" y2="' + r1(y(v)) + '"/><text x="' + (L - 5) + '" y="' + r1(y(v) + 3) + '" text-anchor="end">' + Math.round(v) + '</text>'; });
  const every = pts.length > 20 ? 5 : pts.length > 10 ? 2 : 1;
  pts.forEach((p, i) => {
    const cx = L + pw * i + pw / 2;
    if (sel === i) s += '<rect class="sel" x="' + r1(cx - pw / 2 + 1) + '" y="' + T + '" width="' + r1(pw - 2) + '" height="' + (Hh - T - B) + '" rx="6"/>';
    if (p.v) s += '<path d="' + topRound(cx - bw / 2, y(p.v), bw, y(0) - y(p.v), 4) + '" fill="var(--series)"/>';
    if ((pts.length - 1 - i) % every === 0) s += '<text x="' + r1(cx) + '" y="' + (Hh - 4) + '" text-anchor="middle">' + Number(p.date.slice(8)) + '</text>';
    s += '<rect class="bar-hit" data-mp="' + i + '" x="' + r1(cx - pw / 2) + '" y="0" width="' + r1(pw) + '" height="' + Hh + '"><title>' + esc(H.dmy(p.date)) + ': ' + (p.v == null ? 'tiada data' : p.v + ' orang') + '</title></rect>';
  });
  return s + '</svg>';
}

/** Tiny trend line for a list row. hist: [{date, pct}]. */
export function spark(hist) {
  if (!hist || hist.length < 2) return '';
  const W = 64, Hh = 22;
  const t0 = Date.parse(hist[0].date), t1 = Date.parse(hist[hist.length - 1].date) || t0 + 1;
  const x = (d) => 2 + (W - 6) * ((Date.parse(d) - t0) / Math.max(1, t1 - t0));
  const y = (p) => Hh - 3 - (Hh - 6) * (p / 100);
  const pts = hist.map((h) => r1(x(h.date)) + ',' + r1(y(h.pct))).join(' ');
  const last = hist[hist.length - 1];
  return '<svg width="' + W + '" height="' + Hh + '" viewBox="0 0 ' + W + ' ' + Hh + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="var(--series)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="' + r1(x(last.date)) + '" cy="' + r1(y(last.pct)) + '" r="3" fill="var(--series)" stroke="var(--surface)" stroke-width="1.5"/></svg>';
}

/** Progress % over time (0–100), with a point per update. Returns the SVG; points carry data-pt. */
export function pctLine(hist, sel) {
  const W = 340, Hh = 170, L = 28, B = 22, T = 10, R = 10;
  const t0 = Date.parse(hist[0].date), t1 = Date.parse(hist[hist.length - 1].date);
  const span = Math.max(86400000, t1 - t0);
  const x = (d) => L + (W - L - R) * ((Date.parse(d) - t0) / span);
  const y = (p) => T + (Hh - T - B) * (1 - p / 100);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Kemajuan mengikut masa">';
  [0, 50, 100].forEach((v) => { s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + r1(y(v)) + '" y2="' + r1(y(v)) + '"/><text x="' + (L - 5) + '" y="' + r1(y(v) + 3) + '" text-anchor="end">' + v + '%</text>'; });
  // a step line: the % holds until someone updates it
  let dpath = '';
  hist.forEach((h, i) => { dpath += (i ? 'H' + r1(x(h.date)) + 'V' + r1(y(h.pct)) : 'M' + r1(x(h.date)) + ' ' + r1(y(h.pct))); });
  s += '<path d="' + dpath + 'V' + r1(y(0)) + 'H' + r1(x(hist[0].date)) + 'Z" fill="var(--series)" opacity=".1"/><path d="' + dpath + '" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
  hist.forEach((h, i) => {
    s += '<circle cx="' + r1(x(h.date)) + '" cy="' + r1(y(h.pct)) + '" r="' + (sel === i ? 6 : 4) + '" fill="var(--series)" stroke="var(--surface)" stroke-width="2"/>' +
      '<circle class="bar-hit" data-pt="' + i + '" cx="' + r1(x(h.date)) + '" cy="' + r1(y(h.pct)) + '" r="14"><title>' + esc(H.dmy(h.date)) + ': ' + h.pct + '%</title></circle>';
  });
  const lab = (h, anchor) => '<text x="' + r1(x(h.date)) + '" y="' + (Hh - 5) + '" text-anchor="' + anchor + '">' + esc(H.dmy(h.date).slice(0, 5)) + '</text>';
  s += lab(hist[0], 'start') + (hist.length > 1 && t1 > t0 ? lab(hist[hist.length - 1], 'end') : '');
  return s + '</svg>';
}

/** Progress ring for the hero tile (white on the gradient). */
export function ring(pct) {
  const r = 36, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct || 0));
  return '<svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="' + r + '" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="8"/>' +
    '<circle cx="42" cy="42" r="' + r + '" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + r1(c * p / 100) + ' ' + r1(c) + '"/></svg>';
}
