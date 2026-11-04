// Local preview: serves app/ and answers /api with the REAL web backend (dist/WebApp.gs) running
// against the simulated bot + Sheet (backend/test/world.js), seeded with a demo day.
//   node backend/build.js && node tools/dev-server.js [port]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeWorld } = require('../backend/test/world');
const photos = require('./demo-photos');

const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const APP = path.join(__dirname, '..', 'app');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

// friendly fake AI for the demo (BM notes → English report lines)
const AI = {
  'tarik kabel 3C dari SST ke panel LV, 60m siap': 'Cable pulling of 3C power cable from SST to LV panel is ongoing (60 m completed).',
  'pasang rak bateri dalam bilik bateri': 'Installed battery racks inside the battery room.',
  'uji IR kabel LV dan MV': 'IR test for LV & MV cables completed.',
  'buka bearing bawah NDE': 'Removed the bottom half bearing (NDE).',
  'sambung kabel di panel LV': 'Continue cable termination at the LV panel.',
  'pasang DB 415VAC baru di bilik suis': 'Installation of the new 415VAC DB in the switch room is ongoing.',
  'cuci dan periksa stator': 'Cleaning and inspection of the stator is ongoing.'
};
function responder(body) {
  const parts = body.contents[0].parts;
  const txt = parts.filter((p) => p.text).map((p) => p.text).join('\n');
  if (/single word OK/.test(txt)) return 'OK';
  if (/^Lines from the electrical/.test(txt)) return 'Cable pulling from SST to LV panel 60 m completed; Unit 4 stator cleaning and inspection ongoing';
  if (/Does the NEW line report the SAME/.test(txt)) return '{"same": 0}';
  const note = ((txt.match(/Note: ([\s\S]*)$/) || [])[1] || '').trim();
  if (AI[note]) return AI[note];
  const t = note.charAt(0).toUpperCase() + note.slice(1);
  return /[.!?]$/.test(t) ? t : t + '.';
}

async function main() {
  const files = await photos.make();
  const W = makeWorld({ now: Date.now(), responder });
  const { env } = W;
  env.spreadsheet.getName = () => 'HLEP DPR Bot';
  // real thumbnails in the preview
  const getFile = W.web.DriveApp.getFileById;
  W.web.DriveApp.getFileById = (id) => { const f = getFile(id); if (f && f.getBlob && f.getThumbnail) f.getThumbnail = () => f.getBlob(); return f; };
  W.webExec(() => W.web.setup());
  const sheet = env.sheets.find((s) => s.name === 'WebUsers');
  [['', 'Azhar', 'tech'], ['', 'Nisa', 'tech'], ['', 'Zafran', 'tech']].forEach((r) => sheet.appendRow([r[0], r[1], r[2], '', '', 'Y', '', '', '']));
  const h = sheet.data[0];
  sheet.data.forEach((row, i) => { if (i > 0) row[h.indexOf('new_pin')] = '1234'; });
  env.clock.add(61000);
  const team = W.api('boot').team;
  const tok = (name) => W.api('login', { id: team.find((t) => t.name === name).id, pin: '1234' }).token;
  const jpg = (n) => fs.readFileSync(files.find((f) => f.indexOf(n) >= 0)).toString('base64');
  const today = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
  let k = 0;
  const add = (who, area, cat, status, shift, raw, pics) => {
    const t = tok(who);
    const ids = pics.map((p) => W.api('upload', { t, cid: 'seed' + (k++) + 'xxxxxxxx', date: today, mime: 'image/jpeg', b64: jpg(p) }).id);
    const line = W.api('polish', { t, raw, area, cat, status, shift }).line;
    env.clock.add(7 * 60000);
    return W.api('save', { t, cid: 'seedsave' + (k++) + 'xxxxx', date: today, area, cat, status, shift, raw, text: line, photos: ids });
  };
  if (!process.env.EMPTY) {
    add('Ali Firdaus', 'U1', 'U1_EPS', 'IP', 'D', 'tarik kabel 3C dari SST ke panel LV, 60m siap', ['cable', 'panel', 'cable']);
    add('Azhar', 'U1', 'U1_EPS', 'CP', 'D', 'pasang rak bateri dalam bilik bateri', ['battery', 'battery']);
    add('Nisa', 'U1', 'U1_PHCRANE', 'IP', 'D', 'Punchlist closing for PH crane limit switch', ['crane']);
    add('Zafran', 'U4', 'U4_MS_GEN', 'IP', 'D', 'cuci dan periksa stator', ['stator', 'stator', 'stator', 'stator']);
    add('Aizuddin', 'U4', 'U4_RC_GTX', 'CP', 'D', 'GTx oil sampling completed', ['transformer']);
    const E = tok('Aizuddin');
    W.api('weather', { t: E, date: today, w: 'Sunny' });
    W.api('manpower', { t: E, list: [{ company: 'KEM LETRIK', count: 8 }, { company: 'SCI', count: 9 }, { company: 'MS REMACO', count: 30 }] });
    W.api('plan', { t: E, area: 'U1', cat: 'U1_EPS', text: 'Continue cable termination at the LV panel.' });
  }
  console.log('Team PIN for every demo user: 1234');

  http.createServer((req, res) => {
    env.clock.set(Date.now());
    if (req.method === 'POST' && req.url.split('?')[0] === '/api') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let out;
        try {
          const j = JSON.parse(body || '{}');
          out = W.webExec(() => W.web.doPost({ postData: { contents: JSON.stringify(j) } })).content;
        } catch (e) { out = JSON.stringify({ ok: false, err: String(e.message || e) }); }
        const delay = Number(process.env.DELAY || 250);
        setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out); }, delay);
      });
      return;
    }
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    if (p === '/config.js') { res.writeHead(200, { 'Content-Type': TYPES['.js'] }); res.end("window.HLEP_CONFIG = { api: '/api' };"); return; }
    const f = path.join(APP, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  }).listen(PORT, () => console.log('HLEP DPR preview on http://localhost:' + PORT));
}
main().catch((e) => { console.error(e); process.exit(1); });
