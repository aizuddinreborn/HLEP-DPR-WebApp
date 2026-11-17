// Local preview of the BETA: serves beta/ and answers /api with the REAL web backend (dist/WebApp.gs) running as a
// second Apps Script project in SANDBOX mode (setupBeta: a private copy of the simulated Sheet), with three weeks of
// demo records. The AI is a scripted stand-in that makes real lookups through the backend's own tool loop.
//   node backend/build.js && node tools/beta-server.js [port]        PIN for every demo user: 1234
//   MODE=live: serves app/ against the LIVE web project (real data mode, not the sandbox) instead.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeWorld } = require('../backend/test/world');
const photos = require('./demo-photos');

const PORT = Number(process.argv[2] || process.env.PORT || 8090);
const LIVE = process.env.MODE === 'live';
const APP = path.join(__dirname, '..', LIVE ? 'app' : 'beta');
const DAY = 86400000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const ymd = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
const dmy = (s) => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);

// the bot's own AI calls (polish, voice, photo guess): plain stand-ins
function responder(body) {
  const parts = body.contents[0].parts;
  const txt = parts.filter((p) => p.text).map((p) => p.text).join('\n');
  if (parts.some((p) => p.inlineData && /^audio\//.test(p.inlineData.mimeType))) return JSON.stringify({ transcript: 'tarik kabel kawalan dari panel LV ke DB baru, 30 meter siap', line: 'Control cable pulling from the LV panel to the new DB is ongoing (30 m completed).' });
  if (parts.some((p) => p.inlineData && /^image\//.test(p.inlineData.mimeType))) return JSON.stringify({ category: 'U1_EPS', line: 'Cable tray installation along the switch room wall is ongoing.' });
  if (/single word OK/.test(txt)) return 'OK';
  if (/Does the NEW line report the SAME/.test(txt)) return '{"same": 0}';
  const note = ((txt.match(/Note: ([\s\S]*)$/) || [])[1] || '').trim();
  let t = note.charAt(0).toUpperCase() + note.slice(1);
  if (/Status: CP|completed/i.test(txt) && / is ongoing/.test(t)) t = t.replace(/ is ongoing( \([^)]*\))?\.?$/, ' completed.');
  return /[.!?)]$/.test(t) ? t : t + '.';
}

// ---------- the scripted assistant ----------
const lastQ = (body) => { for (let i = body.contents.length - 1; i >= 0; i--) { const c = body.contents[i]; if (c.role === 'user' && c.parts.some((p) => p.text)) return { i, text: c.parts.filter((p) => p.text).map((p) => p.text).join(' ') }; } return { i: 0, text: '' }; };
function chatModel(body) {
  const q = lastQ(body);
  const t = q.text.toLowerCase();
  const res = [];
  body.contents.slice(q.i + 1).forEach((c) => c.parts.forEach((p) => { if (p.functionResponse) res.push({ name: p.functionResponse.name, out: p.functionResponse.response.result || p.functionResponse.response }); }));
  const today = ymd(Date.now());
  const call = (name, args) => ({ parts: [{ functionCall: { name, args } }] });
  const say = (text) => ({ parts: [{ text }] });
  if (!res.length) {
    if (/ringkaskan dalam 3|siapa yang melapor|whatsapp/.test(t)) {
      const prev = body.contents.slice(0, q.i).filter((c) => c.role === 'model').pop();
      const before = prev ? prev.parts.map((p) => p.text || '').join(' ') : '';
      if (/siapa/.test(t)) return call('cari_aktiviti', { from: ymd(Date.now() - 2 * DAY), limit: 6 });
      if (/whatsapp/.test(t)) return say('*Progress update*\n' + (before.replace(/\[[AMP]\d+\]/g, '').split('\n').filter((l) => /^[-•]/.test(l.trim())).slice(0, 5).join('\n') || '- Works are progressing as recorded in the daily report.'));
      return say('Ringkasnya:\n- Kerja utama masih berjalan mengikut rekod.\n- Beberapa aktiviti sudah siap.\n- Semak senarai “Perlu perhatian” di Papan untuk yang tertinggal.');
    }
    if (/bahan|material|tiba|arriv|sampai/.test(t)) return call('bahan_tiba', {});
    if (/belum siap|masih|ongoing|sedang/.test(t)) return call('cari_aktiviti', { status: 'IP', from: ymd(Date.now() - 6 * DAY), limit: 8 });
    if (/siap|completed|selesai/.test(t)) return call('cari_aktiviti', { status: 'CP', from: ymd(Date.now() - 6 * DAY), limit: 8 });
    if (/rancangan|esok|plan/.test(t)) return call('rancangan', {});
    if (/tenaga|manpower|berapa orang/.test(t)) return call('tenaga_kerja', {});
    if (/lama tiada|tiada kemas/.test(t)) return call('status_semasa', {});
    if (/status|terkini/.test(t)) { const m = t.match(/status terkini ([a-z0-9 &/-]+?)(\?| \(|$)/); return call('status_semasa', m ? { system: m[1].trim() } : {}); }
    if (/kemajuan|progress|hari ini|ringkas/.test(t)) return call('ringkasan_hari', { date: today });
    return call('cari_aktiviti', { q: q.text.slice(0, 80), limit: 8 });
  }
  const r = res[res.length - 1], o = r.out || {};
  const line = (x) => '- ' + (x.date ? dmy(x.date) + ' · ' : '') + (x.system ? '**' + x.system + '**: ' : '') + x.text + ' (' + x.status + ') [' + x.ref + ']';
  if (o.error) return say('Maaf, saya tidak dapat menyemak rekod itu. Cuba tanya dengan cara lain.');
  if (r.name === 'bahan_tiba') {
    if (!o.total) return say('Tiada rekod bahan tiba yang sepadan.');
    const f = o.items[0];
    return say('Bahan terakhir yang direkod tiba ialah **' + f.item + '** untuk ' + f.system + ' pada **' + dmy(f.arrived) + '** [' + f.ref + '].\n\nSemua yang direkod:\n' + o.items.slice(0, 6).map((m) => '- ' + dmy(m.arrived) + ' · ' + m.item + ' (' + m.system + ') [' + m.ref + ']').join('\n'));
  }
  if (r.name === 'cari_aktiviti') {
    if (!o.total) return say('Saya tidak jumpa aktiviti yang sepadan dalam rekod. Cuba perkataan lain atau tempoh yang lebih panjang.');
    if (/siapa/.test(t)) return say('Dalam rekod terkini, pelapor ialah:\n' + o.items.slice(0, 5).map((x) => '- **' + x.by + '** · ' + dmy(x.date) + ' · ' + x.system + ' [' + x.ref + ']').join('\n'));
    const head = /belum siap|masih|sedang/.test(t) ? 'Ada **' + o.total + ' kerja masih berjalan (IP)** dalam 7 hari lepas:' : /siap|selesai/.test(t) ? '**' + o.total + ' aktiviti siap (CP)** dalam 7 hari lepas:' : 'Saya jumpa **' + o.total + ' aktiviti** (dari ' + dmy(o.earliest) + ' hingga ' + dmy(o.latest) + '):';
    return say(head + '\n' + o.items.slice(0, 6).map(line).join('\n') + (o.total > 6 ? '\n\nAda ' + (o.total - 6) + ' lagi. Buka Cari untuk senarai penuh.' : ''));
  }
  if (r.name === 'status_semasa') {
    const sys = (o.systems || []).filter((s) => s.last_update);
    if (!sys.length) return say('Belum ada aktiviti direkod untuk sistem itu.');
    if (/lama tiada|tiada kemas/.test(t)) {
      const old = sys.slice().sort((a, b) => b.days_since - a.days_since).slice(0, 4);
      return say('Sistem yang paling lama tiada kemas kini:\n' + old.map((s) => '- **' + s.system + '** (' + s.unit + '): ' + s.days_since + ' hari, terakhir ' + dmy(s.last_update) + (s.lines && s.lines[0] ? ' [' + s.lines[0].ref + ']' : '')).join('\n'));
    }
    return say(sys.slice(0, 3).map((s) => '**' + s.system + '** (' + s.unit + ')' + (s.percent != null ? ' · ' + s.percent + '%' : '') + ' · kemas kini terakhir ' + dmy(s.last_update) + ':\n' + (s.lines || []).slice(0, 4).map((l) => '- ' + l.text + ' (' + l.status + ') [' + l.ref + ']').join('\n')).join('\n\n'));
  }
  if (r.name === 'ringkasan_hari') {
    if (!o.activities_total) return say('Belum ada aktiviti direkod untuk ' + dmy(o.date) + '.');
    const cp = o.activities.filter((a) => a.status === 'CP').length;
    return say('**' + o.weekday + ', ' + dmy(o.date) + '**: ' + o.activities_total + ' aktiviti (' + cp + ' siap)' + (o.weather ? ', cuaca ' + o.weather : '') + (o.manpower && o.manpower.total ? ', ' + o.manpower.total + ' orang di tapak' : '') + '.\n' +
      o.activities.slice(0, 6).map(line).join('\n') + (o.plan_for_next_day.length ? '\n\nRancangan esok: ' + o.plan_for_next_day.map((p) => p.text + ' [' + p.ref + ']').join(' ') : ''));
  }
  if (r.name === 'rancangan') return say(o.total ? 'Rancangan yang direkod:\n' + o.items.map((p) => '- ' + dmy(p.date) + ' · **' + p.system + '**: ' + p.text + ' [' + p.ref + ']').join('\n') : 'Tiada rancangan direkod untuk tempoh itu. PDF akan menulis TBA.');
  if (r.name === 'tenaga_kerja') return say('Tenaga kerja semasa: **' + (o.current.total || 0) + ' orang**' + (o.current.date ? ' (dikemas kini ' + dmy(o.current.date) + ')' : '') + '.\n' + Object.keys(o.current.by_company || {}).map((k) => '- ' + k + ': ' + o.current.by_company[k]).join('\n'));
  return say('Rekod sudah disemak.');
}

// ---------- three weeks of site records ----------
const PLAN = [
  // [days ago, who, area, cat, status, shift, line, raw, photos]
  [17, 'Ali Firdaus', 'U1', 'U1_EPS', 'IP', 'D', 'Installation of cable trays along the switch room wall is ongoing.', 'pasang dulang kabel sepanjang dinding bilik suis', ['cable']],
  [16, 'Azhar', 'U1', 'U1_EPS', 'CP', 'D', 'Installed cable trays along the switch room wall.', '', ['cable']],
  [16, 'Zafran', 'U4', 'U4_MS_GEN', 'IP', 'D', 'Dismantling of the generator top cover is ongoing.', 'buka penutup atas generator', ['stator']],
  [15, 'Nisa', 'U1', 'U1_FIRE', 'IP', 'D', 'Installation of fire alarm conduits at the turbine floor is ongoing.', 'pasang paip konduit penggera kebakaran', []],
  [14, 'Ali Firdaus', 'U1', 'U1_EPS', 'IP', 'D', 'Cable pulling of 3C power cable from SST to LV panel is ongoing (20 m completed).', 'tarik kabel 3C dari SST ke panel LV, 20m', ['cable', 'panel']],
  [14, 'Zafran', 'U4', 'U4_MS_GEN', 'CP', 'N', 'Removed the generator top cover.', '', ['stator']],
  [13, 'Azhar', 'U1', 'U1_PHCRANE', 'IP', 'D', 'Inspection of the PH crane festoon cable is ongoing.', 'periksa kabel festoon kren PH', ['crane']],
  [12, 'Ali Firdaus', 'U1', 'U1_EPS', 'IP', 'D', 'Cable pulling of 3C power cable from SST to LV panel is ongoing (40 m completed).', 'tarik kabel 3C dari SST ke panel LV, 40m', ['cable']],
  [12, 'Aizuddin', 'U4', 'U4_RC_GTX', 'IP', 'D', 'GTx oil filtration is ongoing.', '', ['transformer']],
  [10, 'Azhar', 'U1', 'U1_EPS', 'IP', 'D', 'Installation of battery racks inside the battery room is ongoing.', 'pasang rak bateri dalam bilik bateri', ['battery']],
  [10, 'Zafran', 'U4', 'U4_MS_GEN', 'IP', 'D', 'Removal of the top half bearing (DE) is ongoing.', 'buka bearing atas DE', ['stator', 'stator']],
  [9, 'Nisa', 'U1', 'U1_FIRE', 'CP', 'D', 'Installed fire alarm conduits at the turbine floor.', '', []],
  [9, 'Ali Firdaus', 'U1', 'U1_EPS', 'CP', 'D', 'Installed battery racks inside the battery room.', '', ['battery', 'battery']],
  [8, 'Zafran', 'U4', 'U4_MS_GEN', 'CP', 'N', 'Removed the top half bearing (DE).', '', ['stator']],
  [7, 'Ali Firdaus', 'U1', 'U1_EPS', 'CP', 'D', 'IR test for LV & MV cables completed.', 'uji IR kabel LV dan MV', ['panel']],
  [7, 'Azhar', 'U1', 'U1_PHCRANE', 'IP', 'D', 'Punchlist closing for the PH crane limit switch is ongoing.', '', ['crane']],
  [6, 'Aizuddin', 'U4', 'U4_RC_GTX', 'CP', 'D', 'GTx oil filtration completed.', '', ['transformer']],
  [5, 'Ali Firdaus', 'U1', 'U1_EPS', 'IP', 'D', 'Cable pulling of 3C power cable from SST to LV panel is ongoing (60 m completed).', 'tarik kabel 3C dari SST ke panel LV, 60m siap', ['cable', 'panel', 'cable']],
  [5, 'Zafran', 'U4', 'U4_MS_GEN', 'IP', 'D', 'Cleaning and inspection of the stator is ongoing.', 'cuci dan periksa stator', ['stator', 'stator', 'stator']],
  [3, 'Nisa', 'U1', 'U1_EPS', 'IP', 'D', 'Installation of the new 415VAC DB in the switch room is ongoing.', 'pasang DB 415VAC baru di bilik suis', ['panel']],
  [2, 'Aizuddin', 'U4', 'U4_RC_GTX', 'CP', 'D', 'GTx oil sampling completed.', '', ['transformer']],
  [2, 'Azhar', 'U1', 'U1_EPS', 'CP', 'D', 'Cable pulling of 3C power cable from SST to LV panel completed (85 m).', '', ['cable']],
  [1, 'Ali Firdaus', 'U1', 'U1_EPS', 'IP', 'D', 'Cable termination at the LV panel is ongoing.', 'sambung kabel di panel LV', ['panel', 'cable']],
  [1, 'Zafran', 'U4', 'U4_MS_GEN', 'IP', 'N', 'Cleaning and inspection of the stator is ongoing (60% completed).', '', ['stator']],
  [1, 'Nisa', 'U1', 'U1_EPS', 'IP', 'D', 'Installation of the new 415VAC DB in the switch room is ongoing (wiring stage).', '', ['panel']],
  [0, 'Ali Firdaus', 'U1', 'U1_EPS', 'IP', 'D', 'Cable termination at the LV panel is ongoing (12 of 20 cores).', 'sambung kabel di panel LV, 12 dari 20 core', ['panel', 'panel']],
  [0, 'Azhar', 'U1', 'U1_PHCRANE', 'CP', 'D', 'Punchlist closing for the PH crane limit switch completed.', '', ['crane']]
];
const EXTRA = {      // days ago → engineer's entries
  16: { w: 'Sunny', mp: [['KEM LETRIK', 6], ['SCI', 8]] }, 14: { w: 'Cloudy', pct: [['U1_EPS', 30]], mat: [['U1', 'U1_EPS', 'Cable tray 300mm (40 lengths)']] },
  12: { w: 'Sunny', mp: [['KEM LETRIK', 8], ['SCI', 8], ['MS REMACO', 22]] }, 10: { w: 'Rainy', pct: [['U1_EPS', 41]], mat: [['U1', 'U1_EPS', 'Battery rack 110VDC']] },
  9: { w: 'Sunny' }, 7: { w: 'Sunny', pct: [['U1_EPS', 52]], mp: [['KEM LETRIK', 8], ['SCI', 9], ['MS REMACO', 26]] }, 5: { w: 'Hazy', mat: [['U4', 'U4_RC_GTX', 'GTx bushing gasket set']] },
  3: { w: 'Cloudy', pct: [['U1_EPS', 58]] }, 2: { w: 'Sunny', mat: [['U1', 'U1_EPS', '415VAC distribution board']] },
  1: { w: 'Sunny', pct: [['U1_EPS', 63]], mp: [['KEM LETRIK', 8], ['SCI', 9], ['MS REMACO', 30]], plan: [['U1', 'U1_EPS', 'Continue cable termination at the LV panel.']] },
  0: { mp: [['KEM LETRIK', 8], ['SCI', 9], ['MS REMACO', 30]] }
};

async function main() {
  const files = await photos.make();
  const now = Date.now();
  const W = makeWorld({ now: now - 18 * DAY, responder });
  const { env } = W;
  env.spreadsheet.getName = () => 'HLEP DPR Bot';
  W.chatModel = chatModel;
  const thumbs = (web) => { const g = web.DriveApp.getFileById; web.DriveApp.getFileById = (id) => { const f = g(id); if (f && f.getBlob && f.getThumbnail) f.getThumbnail = () => f.getBlob(); return f; }; };
  thumbs(W.web);
  W.webExec(() => W.web.setup());
  const sheet = env.sheets.find((s) => s.name === 'WebUsers');
  [['', 'Azhar', 'tech'], ['', 'Nisa', 'tech'], ['', 'Zafran', 'tech']].forEach((r) => sheet.appendRow([r[0], r[1], r[2], '', '', 'Y', '', '', '']));
  const pins = (sh) => { const h = sh.data[0]; sh.data.forEach((row, i) => { if (i > 0) row[h.indexOf('new_pin')] = '1234'; }); };
  pins(sheet);
  env.clock.add(61000);
  const team = W.api('boot').team;
  const toks = {};
  const tok = (name) => toks[name] || (toks[name] = W.api('login', { id: team.find((t) => t.name === name).id, pin: '1234' }).token);
  const jpg = (n) => fs.readFileSync(files.find((f) => f.indexOf(n) >= 0)).toString('base64');
  let k = 0;
  for (let ago = 17; ago >= 0; ago--) {
    env.clock.set(now - ago * DAY - (ago ? 0 : 3600000));
    const date = dmy(ymd(env.clock.now ? env.clock.now() : now - ago * DAY));
    PLAN.filter((p) => p[0] === ago).forEach((p) => {
      const t = tok(p[1]);
      const ids = p[8].map((n) => W.api('upload', { t, cid: 'seed' + (k++) + 'xxxxxxxx', date, mime: 'image/jpeg', b64: jpg(n) }).id);
      const r = W.api('save', { t, cid: 'seedsave' + (k++) + 'xxxxx', date, area: p[2], cat: p[3], status: p[4], shift: p[5], raw: p[7], text: p[6], photos: ids });
      if (!r.ok) console.log('seed failed:', r.err, p[6]);
      env.clock.add(9 * 60000);
    });
    const x = EXTRA[ago];
    if (x) {
      const E = tok('Aizuddin');
      if (x.w) W.api('weather', { t: E, date, w: x.w });
      if (x.mp) W.api('manpower', { t: E, list: x.mp.map((m) => ({ company: m[0], count: m[1] })) });
      (x.pct || []).forEach((p) => W.api('progress', { t: E, key: p[0], pct: p[1] }));
      (x.mat || []).forEach((m) => W.api('material', { t: E, area: m[0], cat: m[1], item: m[2], date }));
      (x.plan || []).forEach((p) => W.api('plan', { t: E, area: p[0], cat: p[1], text: p[2] }));
    }
  }
  env.clock.set(now);

  // the BETA project: its own Script properties, then setupBeta → a private copy
  // (MODE=live serves the live project only; it may also be an older backend, set with WEB_CODE)
  let B = null;
  if (!LIVE) {
    B = W.newWeb({ SHEET_URL: 'https://docs.google.com/spreadsheets/d/SHEET123/edit#gid=0', GEMINI_API_KEY: 'AIzaFAKEKEY' });
    thumbs(B.web);
    const log = B.webExec(() => B.web.setupBeta());
    const copy = W.books[B.sep.props.SHEET_ID];
    pins(copy._sheets.find((s) => s.name === 'WebUsers'));
    console.log(String(log).split('\n').filter((l) => /Mode:|Tanya DPR|ready/.test(l)).join('\n'));
  }
  env.clock.add(61000);
  console.log('Team PIN for every demo user: 1234');

  http.createServer((req, res) => {
    env.clock.set(Date.now());
    if (req.method === 'POST' && req.url.split('?')[0] === '/api') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        let out;
        const X = LIVE ? W : B;
        try { out = X.webExec(() => X.web.doPost({ postData: { contents: JSON.stringify(JSON.parse(body || '{}')) } })).content; }
        catch (e) { out = JSON.stringify({ ok: false, err: String(e.message || e) }); }
        const delay = /"a":"chat"/.test(body) ? Number(process.env.CHAT_DELAY || 1800) : Number(process.env.DELAY || 200);
        setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out); }, delay);
      });
      return;
    }
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    if (p === '/config.js') { res.writeHead(200, { 'Content-Type': TYPES['.js'] }); res.end(LIVE ? "self.HLEP_CONFIG = { api: '/api' };" : "self.HLEP_CONFIG = { channel: 'beta', api: '/api', video: '' };"); return; }
    const f = path.join(APP, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  }).listen(PORT, () => console.log('HLEP DPR ' + (LIVE ? 'LIVE-mode' : 'BETA') + ' preview on http://localhost:' + PORT));
}
main().catch((e) => { console.error(e); process.exit(1); });
