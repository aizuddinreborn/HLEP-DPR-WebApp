'use strict';
// End-to-end checks: the web backend and the unchanged Telegram bot sharing one simulated Sheet + Drive.
//   node backend/build.js && node backend/test/web_test.js
const { makeWorld } = require('./world');

let fails = 0;
let passes = 0;
function ok(c, m) { if (c) { passes++; console.log('  ✅ ' + m); } else { fails++; console.log('  ❌ FAIL: ' + m); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const W = makeWorld();
const { env, api, rows } = W;
const JPG = Buffer.from('\xFF\xD8\xFFFAKEJPEG-site-photo', 'binary').toString('base64');
let cidN = 1;
const cid = () => 'c' + Date.now().toString(36) + (cidN++) + 'abcdef';

section('Setup of the web backend (separate project)');
const setupLog = W.webExec(() => W.web.setup());
ok(/Web-app backend ready/.test(setupLog), 'setup() reports ready');
ok(W.sep.props.SHEET_ID === 'SHEET123', 'Sheet id taken from SHEET_URL');
ok(W.sep.props.PHOTO_FOLDER_ID === env.props.PHOTO_FOLDER_ID && W.sep.props.REPORT_FOLDER_ID === env.props.REPORT_FOLDER_ID, 'found the bot\'s Photos and Reports folders');
ok(/Jana PDF via bot: on/.test(setupLog) && /AI wording: on/.test(setupLog), 'PDF link and AI detected');
let WU = rows('WebUsers');
ok(WU.length === 2 && WU.find((r) => r.user_id === '111').role === 'eng' && WU.find((r) => r.user_id === '222').role === 'tech', 'WebUsers tab filled from the bot\'s approved users (same user_id, same role)');
ok(env.sheets[env.sheets.length - 1].name === 'WebUsers', 'WebUsers is the last tab');
ok(!Object.keys(env.props).some((k) => /^w[tp]_|WEB_SALT/.test(k)), 'nothing written into the bot\'s Script properties');

section('The bot is not disturbed by the new tab');
env.uiQueue.push('', '');
W.botExec(() => W.bot.menuSetup());
ok(!!env.sheets.find((s) => s.name === 'WebUsers') && rows('WebUsers').length === 2, 'bot Setup run again keeps WebUsers and its rows');
W.say('222', '/help');
ok(/Cara guna/.test(W.last('222').text), 'bot still answers in Telegram');

section('Login with PIN');
let boot = api('boot');
ok(boot.ok && boot.team.length === 2 && boot.team.every((t) => !t.pin), 'boot lists the team, no PINs yet');
let r = api('login', { id: '222', pin: '1234' });
ok(!r.ok && r.code === 'nopin', 'no PIN yet → asked to get one from the engineer');
W.setCellByKey('WebUsers', 'user_id', '111', 'new_pin', 4321);     // typed in Sheets → a number
W.setCellByKey('WebUsers', 'user_id', '222', 'new_pin', '1234');
env.clock.add(61000);
boot = api('boot');
WU = rows('WebUsers');
ok(boot.team.every((t) => t.pin), 'PINs typed in new_pin are picked up');
ok(WU.every((u) => u.new_pin === '' && /^Y /.test(u.pin_set)), 'new_pin cells wiped, pin_set = Y + date');
ok(!JSON.stringify(env.sheets.find((s) => s.name === 'WebUsers').data).match(/1234|4321/), 'no PIN or hash anywhere in the Sheet');
r = api('login', { id: '222', pin: '9999' });
ok(!r.ok && r.code === 'pin', 'wrong PIN refused');
for (let i = 0; i < 4; i++) api('login', { id: '222', pin: '0000' });
r = api('login', { id: '222', pin: '1234' });
ok(!r.ok && r.code === 'locked', 'locked after 5 wrong PINs');
env.clock.add(16 * 60000);
r = api('login', { id: '222', pin: '1234' });
ok(r.ok && /^[a-f0-9]{48}$/.test(r.token) && r.user.name === 'Ali Firdaus' && !r.user.eng && r.user.telegram, 'right PIN → session for the technician');
const T = r.token;
r = api('login', { id: '111', pin: '4321' });
ok(r.ok && r.user.eng, 'engineer logs in');
const E = r.token;
ok(!api('meta', { t: 'bad' }).ok && api('meta', { t: 'f'.repeat(48) }).code === 'auth', 'bad token refused');

section('Meta: categories as in the bot');
const meta = api('meta', { t: T });
ok(meta.ok && meta.cats.length === 12 && meta.cats[0].key === 'U1_EPS' && meta.cats[0].label === 'EPS', '12 systems, bot order and labels');
ok(meta.status.map((s) => s.key).join() === 'NS,IP,CP' && meta.weather.length === 5 && meta.pdf && meta.ai, 'statuses, weather options, PDF and AI on');
ok(meta.scopes.U4.join('|') === 'AHC Scopes|REMACO Scopes' && meta.scopes.U1.length === 0, 'Unit 4 scopes for new systems');

section('Technician adds an activity with 2 photos');
const c1 = cid(), c2 = cid();
const p1 = api('upload', { t: T, cid: c1, date: '10/10/2026', mime: 'image/jpeg', b64: JPG });
const p1again = api('upload', { t: T, cid: c1, date: '10/10/2026', mime: 'image/jpeg', b64: JPG });
const p2 = api('upload', { t: T, cid: c2, date: '10/10/2026', mime: 'image/jpeg', b64: JPG });
ok(p1.ok && p2.ok && p1.id !== p2.id && p1again.id === p1.id, 'photos uploaded; the same photo sent twice is stored once');
const f1 = env.files[p1.id];
const dayFolder = env.folders[f1._parent];
ok(dayFolder._name === '2026-10-10' && env.folders[dayFolder._parent]._name === '2026-10' && env.folders[dayFolder._parent]._parent === env.props.PHOTO_FOLDER_ID, 'saved in the bot\'s Photos/2026-10/2026-10-10 folder');
ok(/^2026-10-10_\d{6}_AliFirdaus_\d{3}\.jpg$/.test(f1._name), 'file named like the bot\'s photos: ' + f1._name);
ok(!api('upload', { t: T, cid: cid(), date: '10/10/2026', mime: 'application/pdf', b64: JPG }).ok, 'non-image refused');
const pol = api('polish', { t: T, raw: 'tarik kabel 3C dari SST ke panel LV, 60m siap', area: 'U1', cat: 'U1_EPS', status: 'IP', shift: 'D' });
ok(pol.ok && pol.ai && pol.line === 'Cable pulling of 3C power cable from SST to LV panel is ongoing (60 m completed).', 'AI line with the bot\'s own prompt');
const ai = env.gemini.calls[env.gemini.calls.length - 1].body;
ok(/Owner's Engineer/.test(ai.systemInstruction.parts[0].text) && /Status: In progress/.test(ai.contents[0].parts[0].text), 'same system prompt + context as Telegram');
const sc = cid();
let sv = api('save', { t: T, cid: sc, date: '10/10/2026', area: 'U1', cat: 'U1_EPS', status: 'IP', shift: 'D', raw: 'tarik kabel 3C dari SST ke panel LV, 60m siap', text: pol.line, photos: [p1.id, p2.id] });
ok(sv.ok && /^E\d{12}[0-9A-F]{4}$/.test(sv.id) && !sv.again && !sv.dup, 'saved with a bot-style entry id');
let row = rows('Entries').find((e) => e.entry_id === sv.id);
ok(row && row.work_date === '2026-10-10' && row.reporter === 'Ali Firdaus' && row.user_id === '222' && row.area === 'U1' && row.category_key === 'U1_EPS' && row.category === 'EPS' && row.status === 'IP' && row.shift === 'D', 'Entries row: date, reporter, user_id, area, system, status, shift');
ok(row.photo_ids === p1.id + ',' + p2.id && row.photo_links.split('\n').length === 2 && row.source === 'web' && row.media_group === 'web:' + sc && row.deleted === '' && row.backdated === '', 'photos, source = web, deleted empty');
ok(rows('Entries')[0] && Object.keys(rows('Entries')[0]).join() === 'entry_id,work_date,received_at,reporter,user_id,area,category_key,category,status,shift,raw_text,activity_text,photo_links,photo_ids,media_group,source,deleted,source_ref,backdated', 'Entries columns unchanged');
const again = api('save', { t: T, cid: sc, date: '10/10/2026', area: 'U1', cat: 'U1_EPS', status: 'IP', shift: 'D', text: pol.line, photos: [p1.id, p2.id] });
ok(again.again && again.id === sv.id && rows('Entries').length === 1, 'offline queue re-send → still one row');
ok(!api('save', { t: T, cid: cid(), date: '10/10/2026', area: 'U4', cat: 'U1_EPS', status: 'IP', shift: 'D', text: 'x' }).ok, 'system from the other unit refused');
ok(!api('save', { t: T, cid: cid(), date: '11/10/2026', area: 'U1', cat: 'U1_EPS', status: 'IP', shift: 'D', text: 'x' }).ok, 'future date refused');
ok(!api('save', { t: T, cid: cid(), date: '10/10/2026', area: 'U1', cat: 'U1_EPS', status: 'IP', shift: 'D', text: 'x', photos: [env.props.REPORT_FOLDER_ID] }).ok, 'a file outside Photos cannot be attached');

section('The bot reads the web entry like its own');
W.say('222', '/semak');
let sm = strip(W.last('222').text);
ok(/1\. EPS · IP · Ali Firdaus · 📷2 ✏️/.test(sm) && /Cable pulling of 3C/.test(sm), 'Telegram /semak lists it, with 2 photos and ✏️ (his own)');
W.say('111', '/today');
W.tap('111', 'go:2026-10-10');
const waBot = W.msgsTo('111').filter((m) => /^<pre>/.test(m.text)).map((m) => strip(m.text));
ok(waBot.some((t) => /Cable pulling of 3C power cable from SST to LV panel is ongoing \(60 m completed\)\./.test(t)), 'bot WhatsApp text includes the web line');

section('Day view in the web-app');
// a Telegram entry by the engineer, for the same day
W.say('111', 'pasang rak bateri dalam bilik bateri');
W.tap('111', 'newt'); W.tap('111', 'a:U1'); W.tap('111', 'c:U1_EPS'); W.tap('111', 's:CP'); W.tap('111', 'f:D'); W.tap('111', 'ok');
let day = api('day', { t: T, date: '10/10/2026' });
ok(day.ok && day.entries.length === 2 && day.day === 'Sabtu', 'both entries (web + Telegram), day name in BM');
const mine = day.entries.find((e) => e.src === 'web');
const engs = day.entries.find((e) => e.src !== 'web');
ok(mine.edit && engs.edit && mine.del && !engs.del && mine.photos.length === 2, 'w1.2: technician may edit every line, but delete only his own');
ok(api('day', { t: E, date: '10/10/2026' }).entries.every((e) => e.edit), 'engineer may edit all');
r = api('update', { t: T, id: engs.id, text: 'battery racks installed inside the battery room' });
ok(r.ok && r.entry.text === 'Battery racks installed inside the battery room.' && rows('Entries').find((e) => e.entry_id === engs.id).user_id === '111', 'w1.2: technician edits the engineer\'s line (owner unchanged)');
api('update', { t: E, id: engs.id, text: engs.text });
r = api('update', { t: T, id: mine.id, status: 'CP', text: 'cable pulling of 3C cable completed' });
ok(r.ok && r.entry.status === 'CP' && r.entry.text === 'Cable pulling of 3C cable completed.', 'own line: status + wording changed (cleaned like the bot)');
r = api('update', { t: E, id: mine.id, cat: 'U1_GEN' });
ok(r.ok && rows('Entries').find((e) => e.entry_id === mine.id).category === 'GENERATOR', 'engineer moves it to another system');
api('update', { t: E, id: mine.id, cat: 'U1_EPS' });
const th = api('thumbs', { t: T, ids: [p1.id, env.props.REPORT_FOLDER_ID, 'nope'] });
ok(th.ok && /^data:image\/png;base64,/.test(th.thumbs[p1.id]) && th.thumbs[env.props.REPORT_FOLDER_ID] === '' && th.thumbs.nope === '', 'thumbnails only for files in Photos');

section('Duplicate check (same rule as the bot)');
const dc = cid();
const pd = api('upload', { t: E, cid: cid(), date: '10/10/2026', mime: 'image/jpeg', b64: JPG });
sv = api('save', { t: E, cid: dc, date: '10/10/2026', area: 'U1', cat: 'U1_EPS', status: 'CP', shift: 'D', text: 'Cable pulling of 3C cable completed.', photos: [pd.id] });
ok(sv.dup && sv.dup.who === 'Ali Firdaus' && sv.dup.photos === 2, 'same words by someone else → asked "same work?"');
r = api('remove', { t: E, id: sv.id });
ok(r.ok && r.photos === 1 && env.files[pd.id]._trashed && rows('Entries').find((e) => e.entry_id === sv.id).deleted === 'Y', '"Ya, sama" → entry deleted, its photo to Drive trash');
env.gemini.same = '{"same": 1}';
sv = api('save', { t: E, cid: cid(), date: '10/10/2026', area: 'U1', cat: 'U1_EPS', status: 'IP', shift: 'N', text: 'Pulled 3C cable SST to LV.' });
ok(sv.dup && sv.dup.text === 'Cable pulling of 3C cable completed.', 'AI says same work → asked');
env.gemini.same = '{"same": 0}';
api('remove', { t: E, id: sv.id });
ok(!api('remove', { t: T, id: engs.id }).ok, 'technician cannot delete the engineer\'s line');

section('New system from the web-app');
r = api('newcat', { t: T, area: 'U4', scope: 'AHC Scopes', name: 'Air conditioning' });
ok(r.ok && r.created && r.key === 'U4_AIRCONDITIONIN' && r.cats.some((c) => c.key === r.key && c.label === 'AHC · AIR CONDITIONING'), 'created like the bot (key, scope, label)');
r = api('newcat', { t: T, area: 'U4', scope: 'AHC Scopes', name: 'air  conditioning' });
ok(r.ok && !r.created && rows('Categories').length === 13, 'same name again → existing one used');
env.cache.cats = undefined; delete env.cache.cats;
W.say('222', '/semak');
const catRow = rows('Categories').find((c) => c.key === 'U4_AIRCONDITIONIN');
ok(catRow.group === 'AIR CONDITIONING' && catRow.active === 'Y' && catRow.button === '🆕 AIR CONDITIONING', 'Categories row the bot understands');

section('Weather, manpower, progress, plan, material');
ok(api('weather', { t: T, date: '10/10/2026', w: 'Cloudy' }).ok && api('day', { t: T, date: '10/10/2026' }).weather === 'Cloudy', 'weather saved (anyone, like /weather)');
r = api('manpower', { t: T, list: [{ company: 'kem letrik', count: 8 }, { company: 'SCI', count: '9' }, { company: '', count: 3 }] });
ok(r.ok && r.list.length === 2 && rows('Manpower').filter((m) => m.date === '2026-10-10').map((m) => m.company + m.count).join() === 'KEM LETRIK8,SCI9', 'manpower saved for today, upper-case');
ok(api('progress', { t: T, key: 'U1_DTHOIST', pct: 95 }).code === 'eng', 'progress: engineer only');
r = api('progress', { t: E, key: 'U1_DTHOIST', pct: 95 });
ok(r.ok && api('day', { t: E, date: '10/10/2026' }).progress.find((p) => p.key === 'U1_DTHOIST').pct === 95, 'DT HOIST % saved');
ok(!api('progress', { t: E, key: 'U4_MS_GEN', pct: 5 }).ok, 'no % for a system without %');
// a dashboard-linked row cannot be typed over
W.botExec(() => W.bot.appendRow_('Progress', { date: '2026-10-10', category_key: 'U1_EPS', category: 'EPS', percent: 52, updated_by: 'Dashboard', updated_at: '2026-10-10 09:00:00' }));
r = api('progress', { t: E, key: 'U1_EPS', pct: 10 });
ok(!r.ok && /dashboard/.test(r.err) && api('day', { t: E, date: '10/10/2026' }).progress.find((p) => p.key === 'U1_EPS').linked, 'EPS follows the dashboard: shown as linked, not editable');
r = api('plan', { t: E, area: 'U1', cat: 'U1_EPS', raw: 'sambung kabel di panel LV' });
ok(r.ok && r.date === '2026-10-11' && r.text === 'Continue cable termination at the LV panel.', 'plan for tomorrow, AI plan wording');
const AIP = env.gemini.calls[env.gemini.calls.length - 1].body.systemInstruction.parts[0].text;
ok(/TOMORROW'S WORK ACTIVITIES/.test(AIP), 'uses the bot\'s plan prompt');
ok(api('plan', { t: T, area: 'U1', cat: 'U1_EPS', text: 'x' }).code === 'eng', 'plan: engineer only (as /plan)');
day = api('day', { t: E, date: '10/10/2026' });
ok(day.plans.length === 1 && day.plans[0].label === 'EPS', 'plan shows in the day view');
r = api('material', { t: E, area: 'U1', cat: 'U1_EPS', item: '415VAC DB No. 3', date: '10/10/2026' });
ok(r.ok && rows('Materials').some((m) => m.item === '415VAC DB No. 3' && m.arrived_date === '2026-10-10'), 'material arrival saved');
ok(!api('material', { t: E, area: 'U1', cat: 'U1_FIRE', item: 'x', date: '10/10/2026' }).ok, 'only systems with a material list');

section('WhatsApp text: identical to the bot');
const waWeb = api('wa', { t: E, date: '10/10/2026' });
W.tap('111', 'go:2026-10-10');
const pres = W.msgsTo('111').filter((m) => /^<pre>/.test(m.text)).slice(-2).map((m) => strip(m.text));
ok(waWeb.ok && waWeb.texts.length === 2 && waWeb.texts[0].text === pres[0] && waWeb.texts[1].text === pres[1], 'web WhatsApp text = bot /today text, both units');
ok(/415VAC DB No\. 3 ✅ 10\/10\/26/.test(waWeb.texts[0].text) && /DT HOIST – 95%/.test(waWeb.texts[0].text) && /Weather: Cloudy/.test(waWeb.texts[0].text), 'includes the material, the % and the weather from the web-app');
ok(api('wa', { t: T, date: '10/10/2026' }).code === 'eng', 'WhatsApp text: engineer only (as /today)');

section('Headline + PDF through the bot');
r = api('headline', { t: E, date: '10/10/2026' });
ok(r.ok && !r.decided && r.draft === 'EPS cable pulling 60 m completed; Unit 4 NDE bottom bearing removed', 'AI headline drafted with the bot\'s prompt');
ok(api('headlineSet', { t: E, date: '10/10/2026', text: r.draft, ai: true }).ok && rows('Headlines').some((h) => h.key === 'D20261010' && /Aizuddin \(AI\) · web/.test(h.by)), 'headline saved in the Headlines tab');
ok(api('headline', { t: E, date: '10/10/2026' }).decided, 'now decided');
const docsBefore = env.tg.calls.filter((c) => c.method === 'sendDocument').length;
r = api('report', { t: E, date: '10/10/2026' });
const sent = env.tg.calls.filter((c) => c.method === 'sendDocument');
ok(r.ok && sent.length === docsBefore + 1 && sent[sent.length - 1].p.chat_id === '111', 'bot built the PDF and sent it to the engineer\'s Telegram');
ok(W.botCalls[W.botCalls.length - 1].message.text === '/report 10/10/2026' && /^web\d+/.test(W.botCalls[W.botCalls.length - 1].update_id), 'sent to the bot as "/report 10/10/2026"');
ok(!W.msgsTo('111').slice(-3).some((m) => /hl:ok/.test(JSON.stringify(m.kb))), 'bot did not ask for the headline again');
const doc = env.docs[env.docs.length - 1];
const docTxt = JSON.stringify(doc.body);
ok(/Cable pulling of 3C cable completed/.test(docTxt) && /EPS cable pulling 60 m completed/.test(docTxt), 'PDF holds the web line and the headline');
let rep = api('reports', { t: E, date: '10/10/2026' });
ok(rep.ok && rep.list.length === 1 && rep.list[0].ready && rep.docNo === 'HLEP-CEND-ELEC-DPR-20261010', 'ReportLog row ready, doc no. as the bot');
const pdf = api('pdf', { t: E, docNo: rep.docNo, rev: 0 });
ok(pdf.ok && Buffer.from(pdf.b64, 'base64').toString().indexOf('%PDF') === 0, 'PDF downloadable in the web-app');
r = api('report', { t: T, date: '10/10/2026' });
ok(r.ok && env.tg.calls.filter((c) => c.method === 'sendDocument').pop().p.chat_id === '222', 'technician can also ask (as /report): goes to his Telegram');
ok(api('reports', { t: T, date: '10/10/2026' }).list[0].rev === 1, 'Rev went up to 1');
ok(api('report', { t: T, date: '04/10/2026', days: 7 }).code === 'eng', 'weekly: engineer only');
W.botTimeout = true;
r = api('report', { t: E, date: '10/10/2026' });
W.botTimeout = false;
ok(r.ok && r.slow && api('reports', { t: E, date: '10/10/2026' }).list.length === 3, 'slow bot (60 s UrlFetch limit) → app keeps watching, PDF still made');

section('People without Telegram, PIN reset, removal');
const sh = env.sheets.find((s) => s.name === 'WebUsers');
sh.appendRow(['', 'Nisa', 'tech', '5555', '', '', '', '', '']);
env.clock.add(61000);
boot = api('boot');
const nisa = boot.team.find((t) => t.name === 'Nisa');
ok(nisa && /^W\d{5}$/.test(nisa.id) && nisa.pin, 'new person without Telegram gets a W-id');
const N = api('login', { id: nisa.id, pin: '5555' });
ok(N.ok && !N.user.telegram, 'Nisa logs in');
r = api('report', { t: N.token, date: '10/10/2026' });
ok(!r.ok && r.code === 'notg', 'PDF needs a Telegram account: clear message');
sv = api('save', { t: N.token, cid: cid(), date: '09/10/2026', area: 'U4', cat: 'U4_TD_ED', status: 'CP', shift: 'N', text: 'Post vibration test done.' });
row = rows('Entries').find((e) => e.entry_id === sv.id);
ok(sv.ok && row.user_id === nisa.id && row.backdated === 'Y' && row.shift === 'N', 'past-date night entry saved as backdated');
r = api('pin', { t: N.token, old: '5555', pin: '7777' });
ok(r.ok && api('meta', { t: N.token }).code === 'auth' && api('meta', { t: r.token }).ok, 'own PIN change: old sessions end, new one works');
W.setCellByKey('WebUsers', 'user_id', nisa.id, 'active', 'N');
env.clock.add(61000);
ok(api('meta', { t: r.token }).code === 'auth' && !api('login', { id: nisa.id, pin: '7777' }).ok && !api('boot').team.some((t) => t.id === nisa.id), 'active = N → logged out and hidden');
ok(api('logout', { t: T }).ok && api('meta', { t: T }).code === 'auth', 'log out ends the session');

section('Settings (PTW etc.)');
const T2 = api('login', { id: '222', pin: '1234' }).token;
ok(api('settings', { t: T2 }).code === 'eng', 'settings: engineer only');
r = api('settingSet', { t: E, key: 'PTW_U1', value: '1. U1 Electrical (HV) - 22/07/2026 until 30/11/2026' });
ok(r.ok && rows('Settings').find((s) => s.key === 'PTW_U1').value === '1. U1 Electrical (HV) - 22/07/2026 until 30/11/2026' && rows('PtwLog').some((p) => /30\/11\/2026/.test(p.value)), 'PTW changed + dated PTW history kept');
ok(!api('settingSet', { t: E, key: 'ADMIN_CODE', value: '1' }).ok, 'other settings cannot be changed here');

section('w1.1 · PDF photo limit in Tetapan laporan (engineer only)');
let sl = api('settings', { t: E });
const ph = sl.list.find((s) => s.key === 'PHOTOS_PER_ACTIVITY');
ok(ph && ph.num && ph.num.min === 0 && ph.num.max === 9 && ph.value === '2', 'photo limit listed as a number 0–9, current value 2 (bot default)');
ok(api('settingSet', { t: T2, key: 'PHOTOS_PER_ACTIVITY', value: '5' }).code === 'eng', 'technician cannot change it');
ok(!api('settingSet', { t: E, key: 'PHOTOS_PER_ACTIVITY', value: '10' }).ok && !api('settingSet', { t: E, key: 'PHOTOS_PER_ACTIVITY', value: 'abc' }).ok && !api('settingSet', { t: E, key: 'PHOTOS_PER_ACTIVITY', value: '' }).ok, '10, letters and empty refused');
r = api('settingSet', { t: E, key: 'PHOTOS_PER_ACTIVITY', value: ' 5 ' });
ok(r.ok && String(rows('Settings').find((s) => s.key === 'PHOTOS_PER_ACTIVITY').value) === '5' && api('settings', { t: E }).list.find((s) => s.key === 'PHOTOS_PER_ACTIVITY').value === '5', 'saved as 5 in the bot\'s Settings tab');
delete env.cache.settings;            // the bot re-reads Settings every 5 minutes
ok(W.botExec(() => W.bot.photosPerActivity_(W.bot.settings_())) === 5, 'the bot\'s PDF engine now uses 5 photos per activity');
const m2 = api('meta', { t: T2 });
ok(m2.pdfPhotos === 5 && m2.maxPhotos === 20, 'app told: PDF shows 5, an activity may hold up to 20 (bot limit)');
const many = Array.from({ length: 7 }, () => api('upload', { t: T2, cid: cid(), date: '10/10/2026', mime: 'image/jpeg', b64: JPG }).id);
sv = api('save', { t: T2, cid: cid(), date: '10/10/2026', area: 'U1', cat: 'U1_GEN', status: 'IP', shift: 'D', text: 'Stator inspection with 7 photos.', photos: many });
ok(sv.ok && api('day', { t: T2, date: '10/10/2026' }).entries.find((e) => e.id === sv.id).photos.length === 7, 'an activity keeps all 7 photos (no app-side cap below the bot\'s 20)');

section('w1.2 · photos on existing activities (everyone)');
{
  const T3 = api('login', { id: '222', pin: '1234' }).token;
  const engE = api('day', { t: T3, date: '10/10/2026' }).entries.find((e) => e.uid === '111' && e.src !== 'web');
  const n0 = engE.photos.length;
  const up = [1, 2].map(() => api('upload', { t: T3, cid: cid(), date: '10/10/2026', mime: 'image/jpeg', b64: JPG }).id);
  let pr = api('photoAdd', { t: T3, id: engE.id, photos: up.concat([up[0]]) });
  let erow = rows('Entries').find((e) => e.entry_id === engE.id);
  ok(pr.ok && pr.photos.length === n0 + 2 && erow.photo_ids.split(',').length === n0 + 2 && erow.photo_links.split('\n').filter(Boolean).length === n0 + 2, 'technician adds 2 photos to the engineer\'s activity (ids + links stay in step, no double)');
  ok(!api('photoAdd', { t: T3, id: engE.id, photos: [env.props.REPORT_FOLDER_ID] }).ok, 'a file outside Photos cannot be added');
  const big = Array.from({ length: 19 }, () => api('upload', { t: T3, cid: cid(), date: '10/10/2026', mime: 'image/jpeg', b64: JPG }).id);
  ok(!api('photoAdd', { t: T3, id: engE.id, photos: big }).ok, 'no more than 20 photos per activity');
  pr = api('photoDel', { t: T3, id: engE.id, photo: up[0] });
  erow = rows('Entries').find((e) => e.entry_id === engE.id);
  ok(pr.ok && pr.trashed && env.files[up[0]]._trashed && erow.photo_ids.split(',').indexOf(up[0]) < 0 && erow.photo_links.split('\n').filter(Boolean).length === erow.photo_ids.split(',').filter(Boolean).length, 'photo deleted: gone from the row, file in Drive trash');
  ok(!api('photoDel', { t: T3, id: engE.id, photo: up[0] }).ok, 'deleting it again → "sudah tiada"');
  // a photo shared with another activity stays in Drive
  const other = api('save', { t: E, cid: cid(), date: '10/10/2026', area: 'U1', cat: 'U1_GEN', status: 'IP', shift: 'D', text: 'Shared photo check.', photos: [up[1]] });
  pr = api('photoDel', { t: T3, id: engE.id, photo: up[1] });
  ok(pr.ok && !pr.trashed && !env.files[up[1]]._trashed, 'photo also used by another activity → removed here, file kept');
  W.say('111', '/semak 10/10/2026');
  ok(/Shared photo check/.test(strip(W.last('111').text)), 'bot /semak still reads the rows after photo edits');
  api('remove', { t: E, id: other.id });
}

section('w1.2 · Bahan tiba: everyone adds and edits, engineer deletes');
{
  const T3 = api('login', { id: '222', pin: '1234' }).token;
  r = api('material', { t: T3, area: 'U1', cat: 'U1_EPS', item: 'Cable ladder 300mm', date: '10/10/2026' });
  ok(r.ok && rows('Materials').some((m) => m.item === 'Cable ladder 300mm' && m.added_by === 'Ali Firdaus'), 'technician adds a material arrival');
  const mat = api('day', { t: T3, date: '10/10/2026' }).materials.find((m) => m.item === 'Cable ladder 300mm');
  r = api('materialEdit', { t: T3, row: mat.row, oldItem: mat.item, area: 'U1', cat: 'U1_GEN', item: 'Cable ladder 300 mm (galvanised)', date: '09/10/2026' });
  const mrow = rows('Materials').find((m) => m.item === 'Cable ladder 300 mm (galvanised)');
  ok(r.ok && mrow && mrow.category_key === 'U1_GEN' && mrow.arrived_date === '2026-10-09', 'technician edits it: system, name, date');
  ok(!api('materialEdit', { t: T3, row: mat.row, oldItem: 'Cable ladder 300mm', area: 'U1', cat: 'U1_GEN', item: 'x', date: '09/10/2026' }).ok, 'edit with an old name (changed by someone else) refused');
  ok(!api('materialEdit', { t: T3, row: mat.row, oldItem: mrow.item, area: 'U1', cat: 'U1_FIRE', item: 'x', date: '09/10/2026' }).ok, 'only systems with a material list');
  ok(api('materialDel', { t: T3, row: mat.row, item: mrow.item }).code === 'eng', 'technician cannot delete a material');
  W.say('111', '/today 10/10/2026');
  W.tap('111', 'go:2026-10-10');
  ok(W.msgsTo('111').filter((m) => /^<pre>/.test(m.text)).slice(-2).some((m) => /Cable ladder 300 mm \(galvanised\) ✅ (- )?9\/10\/26/.test(strip(m.text))), 'bot WhatsApp text shows the edited material');
}

section('w1.3 · contractor PDF → AI (electrical only) → tick list → report');
{
  const T3 = api('login', { id: '222', pin: '1234' }).token;
  const E3 = api('login', { id: '111', pin: '4321' }).token;
  const ITEMS = [
    { category: 'U1_EPS', area: 'U1', status: 'IP', shift: 'D', kind: 'today', line: 'Installation of battery racks in the battery room is ongoing (2 of 4 racks).', source: 'Batt rack installation 2/4 nos', page: 2 },
    { category: '', area: 'U1', status: 'IP', shift: 'D', kind: 'today', line: 'Installation of lighting fixtures at the intake area is ongoing.', source: 'Lighting fixture install at intake', page: 2 },
    { category: 'U4_MS_GEN', area: 'U4', status: 'CP', shift: 'N', kind: 'today', line: 'Removed the top half bearing (DE).', source: 'Night: remove top half brg DE - done', page: 3 },
    { category: 'U1_FIRE', area: 'U1', status: 'NS', shift: 'D', kind: 'tomorrow', line: 'Function test of the fire pump control panel.', source: 'Tomorrow: FT fire pump CP', page: 4 },
    { category: 'U1_PHCRANE', area: 'U1', status: 'CP', shift: 'D', kind: 'today', line: 'Load test of the powerhouse crane completed.', source: 'PH crane load test OK', page: 5 }
  ];
  let mode = 'normal';
  const base = env.gemini.responder;
  env.gemini.responder = (body) => {
    const parts = body.contents[0].parts;
    const txt = parts.filter((p) => p.text).map((p) => p.text).join('\n');
    if (parts.some((p) => p.inlineData && p.inlineData.mimeType === 'application/pdf')) {
      if (!/ELECTRICAL scope/.test(txt)) throw new Error('not the bot PDF prompt');
      if (mode === 'empty') return JSON.stringify({ report_date: '2026-10-07', contractor: 'Civil Co', items: [], skipped_non_electrical: 12 });
      if (mode === 'nodate') return JSON.stringify({ report_date: '', contractor: 'KEM LETRIK', items: ITEMS.slice(4), skipped_non_electrical: 0 });
      if (mode === 'junk') return 'Sorry, I cannot read this.';
      return JSON.stringify({ report_date: '2026-10-07', contractor: 'SCI Sdn Bhd', items: ITEMS, skipped_non_electrical: 9 });
    }
    if (/EXISTING lines/.test(txt)) {
      const ex = txt.split('NEW lines')[0].split('\n').filter((l) => / \| U1_EPS \| /.test(l));
      return JSON.stringify({ merges: ex.length ? [{ new: 1, existing: ex[0].split(' | ')[0].trim(), merged: 'Installation of battery racks inside the battery room is ongoing (2 of 4 racks installed).' }] : [] });
    }
    return base(body);
  };
  const pdfB64 = (tag) => Buffer.from('%PDF-1.4\n' + tag + '\n%%EOF').toString('base64');
  // a technician line for the same day: the contractor's battery-rack item merges with it
  const tech = api('save', { t: T3, cid: cid(), date: '07/10/2026', area: 'U1', cat: 'U1_EPS', status: 'IP', shift: 'D', text: 'Installed battery racks inside the battery room.' });
  ok(tech.ok, 'technician line saved for 07/10');

  ok(api('meta', { t: T3 }).pdfImport === true, 'meta: PDF import on (AI key present)');
  r = api('pdfUpload', { t: T3, name: 'notes.pdf', b64: Buffer.from('hello, not a pdf').toString('base64') });
  ok(!r.ok && /bukan fail PDF/.test(r.err), 'a file that is not a PDF is refused');
  r = api('pdfUpload', { t: T3, name: 'huge.pdf', b64: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(21 * 1024 * 1024)]).toString('base64') });
  ok(!r.ok && /lebih 20 MB/.test(r.err), 'over 20 MB refused, as in Telegram');

  r = api('pdfUpload', { t: T3, name: 'SCI DPR 07-10-2026.pdf', b64: pdfB64('SCI daily') });
  ok(r.ok && /^R\d{12}[A-Z0-9]{4}$/.test(r.id), 'PDF uploaded → import id like the bot\'s');
  const id = r.id;
  let pf = rows('PdfFiles').find((x) => x.import_id === id);
  const file = Object.values(env.files).find((f) => f._name === 'SCI DPR 07-10-2026.pdf');
  ok(pf && pf.state === 'queued' && pf.by === 'Ali Firdaus' && pf.by_id === '222' && pf.file_link === file.getUrl() && /^[a-f0-9]{32}$/.test(pf.file_hash), 'PdfFiles row: queued, who, link, file hash');
  ok(env.folders[file._parent]._name === '2026-10' && env.folders[env.folders[file._parent]._parent]._name === 'Contractor Reports' && env.folders[env.folders[file._parent]._parent]._id === env.props.CONTRACTOR_FOLDER_ID,
    'PDF kept in the bot\'s own Contractor Reports/2026-10 folder');
  ok(api('pdfState', { t: T3, id }).state === 'reading' && api('imports', { t: E3 }).reading.some((x) => x.id === id), 'shown as "being read" (to everyone)');
  r = api('pdfUpload', { t: E3, name: 'copy.pdf', b64: pdfB64('SCI daily') });
  ok(r.ok && r.seen && r.seen.st === 'reading' && r.seen.by === 'Ali Firdaus', 'same file again while it is read → "sudah dihantar, sedang dibaca"');

  r = api('pdfRead', { t: T3, id });
  ok(r.ok && r.state === 'review' && r.n === 5 && r.skipped === 9, 'read: 5 electrical items, 9 non-electrical skipped');
  ok(env.gemini.calls.some((c) => c.model === 'gemini-flash-latest' && c.body.contents[0].parts.some((p) => p.inlineData && p.inlineData.mimeType === 'application/pdf')), 'read with the bot\'s PDF model and prompt');
  ok(W.sep.props.JOBS === '[]' && !Object.keys(W.sep.props).some((k) => /^wr_/.test(k)), '"reading" mark cleared');
  ok(api('pdfRead', { t: T3, id }).state === 'review' && rows('Imports').filter((x) => x.import_id === id).length === 5, 'reading again does not double the list');
  pf = rows('PdfFiles').find((x) => x.import_id === id);
  ok(pf.state === 'read' && pf.contractor === 'SCI Sdn Bhd' && pf.report_date === '2026-10-07', 'PdfFiles: read, contractor, report date');
  const hit = W.botExec(() => W.bot.pdfSeen_(pf.file_hash, ''));
  ok(hit && hit.st === 'review', 'the bot sees this PDF as already sent (its own duplicate check)');
  r = api('pdfUpload', { t: E3, name: 'again.pdf', b64: pdfB64('SCI daily') });
  ok(r.seen && r.seen.st === 'review' && r.seen.id === id, 'same file in the web-app → points to the open list');

  let L = api('import', { t: T3, id });
  ok(L.ok && !L.done && L.head.contractor === 'SCI Sdn Bhd' && L.head.date === '2026-10-07' && L.items.length === 5 && L.canDrop, 'tick list: header and 5 items');
  ok(L.items.filter((i) => i.picked).length === 4 && !L.items[1].picked && L.items[1].cat === '', 'items with a system are ticked; the one without is not');
  ok(L.items[0].merged && /2 of 4 racks installed/.test(L.items[0].line) && /Installed battery racks/.test(L.items[0].mergeWith), 'item 1 merged with the technician line of that day');
  ok(L.items[3].kind === 'plan' && L.items[2].shift === 'N' && L.items[2].source === 'Night: remove top half brg DE - done' && Number(L.items[2].page) === 3, 'plan item, night shift, contractor words and page');
  r = api('importSet', { t: T3, id, n: 2, patch: { picked: true } });
  ok(!r.ok && r.code === 'nocat', 'ticking an item with no system → choose a system first');
  L = api('importSet', { t: T3, id, n: 2, patch: { cat: 'U1_EPS', status: 'CP' } });
  ok(L.items[1].picked && L.items[1].cat === 'U1_EPS' && L.items[1].area === 'U1' && L.items[1].status === 'CP', 'system chosen → ticked; status changed');
  L = api('importSet', { t: T3, id, n: 1, patch: { line: 'Installation of battery racks inside the battery room is ongoing (2 of 4 racks installed, anchoring done).' } });
  ok(rows('Imports').find((x) => x.import_id === id && Number(x.item_no) === 1).merged_text.indexOf('anchoring done') > 0 && L.items[0].merged, 'editing a merged item edits the merged line');
  L = api('importSet', { t: T3, id, n: 3, patch: { picked: false } });
  ok(!L.items[2].picked, 'item 3 unticked');
  L = api('importSet', { t: T3, id, patch: { all: false } });
  ok(L.items.every((i) => !i.picked), '"Tiada" unticks all');
  L = api('importSet', { t: T3, id, patch: { all: true } });
  ok(L.items.every((i) => i.picked), '"Semua" ticks all (every item now has a system)');
  L = api('importSet', { t: T3, id, n: 3, patch: { picked: false } });

  r = api('importSave', { t: T3, id });
  ok(r.ok && r.nE === 2 && r.nM === 1 && r.nP === 1 && r.nD === 1 && r.date === '2026-10-07', 'saved: 2 new, 1 merged, 1 plan, 1 not ticked');
  const ents = rows('Entries');
  const contr = ents.filter((e) => e.source === 'contractor' && e.work_date === '2026-10-07');
  ok(contr.length === 2 && contr.every((e) => e.reporter === 'Ali Firdaus' && e.user_id === '222' && e.backdated === 'Y' && /^SCI Sdn Bhd · SCI DPR 07-10-2026\.pdf p\d · R/.test(e.source_ref)), 'contractor lines: reporter, backdated, source_ref (bot format)');
  ok(ents.find((e) => e.entry_id === tech.id).deleted === 'M' && ents.some((e) => e.source === 'merged' && /anchoring done/.test(e.activity_text)), 'technician line hidden as merged; merged line added');
  ok(rows('Plans').some((p) => p.plan_date === '2026-10-08' && /fire pump/.test(p.text) && /SCI Sdn Bhd report/.test(p.added_by)), 'plan saved for 08/10');
  ok(api('import', { t: T3, id }).done && api('import', { t: T3, id }).canUndo, 'list now "selesai", with undo');
  let IM = api('imports', { t: E3 });
  const dn = IM.done.find((x) => x.id === id);
  ok(dn && dn.savedBy === 'Ali Firdaus' && !dn.savedByEng && dn.n === 4 && !IM.pending.some((x) => x.id === id), 'engineer\'s Hari ini: "Ali saved SCI" notice');
  const d7 = api('day', { t: E3, date: '07/10/2026' });
  ok(d7.entries.some((e) => e.src === 'contractor' && /powerhouse crane/.test(e.text)) && d7.imports && Array.isArray(d7.imports.done), 'day view lists the contractor lines (and the import card data)');
  W.say('111', '/today 07/10/2026');
  ok(W.msgsTo('111').filter((m) => /^<pre>/.test(m.text)).slice(-2).some((m) => /Load test of the powerhouse crane completed\./.test(strip(m.text))), 'bot WhatsApp text has the contractor line');

  r = api('importUndo', { t: E3, id });
  const ents2 = rows('Entries');
  ok(r.ok && r.n === 4 && ents2.find((e) => e.entry_id === tech.id).deleted === '' && ents2.filter((e) => e.source_ref.indexOf(id) >= 0 && e.deleted !== 'Y').length === 0, 'engineer undoes the import: lines out, technician line back');
  ok(!api('importUndo', { t: E3, id }).ok, 'nothing left to undo');

  // no date in the report → asked for it
  mode = 'nodate';
  const id2 = api('pdfUpload', { t: E3, name: 'KEM LETRIK daily.pdf', b64: pdfB64('KEM') }).id;
  r = api('pdfRead', { t: E3, id: id2 });
  ok(r.state === 'review' && api('import', { t: E3, id: id2 }).head.date === '', 'report without a date → list without a date');
  r = api('importSave', { t: E3, id: id2 });
  ok(!r.ok && r.code === 'nodate', 'save asks for the report date');
  ok(!api('importDate', { t: E3, id: id2, date: '11/10/2026' }).ok, 'future report date refused');
  L = api('importDate', { t: E3, id: id2, date: '06/10/2026' });
  ok(L.head.date === '2026-10-06', 'date set');
  r = api('importSave', { t: E3, id: id2 });
  ok(r.ok && r.nE === 1 && rows('Entries').some((e) => e.work_date === '2026-10-06' && /powerhouse crane/.test(e.activity_text) && e.source === 'contractor'), 'saved on 06/10');

  // no electrical items; unreadable; retry; throw away
  mode = 'empty';
  const id3 = api('pdfUpload', { t: T3, name: 'civil only.pdf', b64: pdfB64('civil') }).id;
  r = api('pdfRead', { t: T3, id: id3 });
  ok(r.state === 'none' && rows('PdfFiles').find((x) => x.import_id === id3).state === 'none', 'civil-only report → "tiada item elektrik"');
  mode = 'junk';
  const id4 = api('pdfUpload', { t: T3, name: 'scan.pdf', b64: pdfB64('scan') }).id;
  r = api('pdfRead', { t: T3, id: id4 });
  ok(r.state === 'failed' && api('imports', { t: T3 }).failed.some((x) => x.id === id4) && !api('imports', { t: E3 }).failed.some((x) => x.id === id4), 'unreadable → "gagal" card for the sender only');
  ok(!W.botExec(() => W.bot.pdfSeen_(rows('PdfFiles').find((x) => x.import_id === id4).file_hash, '')), 'a failed read does not block sending it again (bot rule)');
  mode = 'normal';
  r = api('pdfRead', { t: T3, id: id4 });
  ok(r.state === 'review', '"Cuba lagi" reads it again');
  ok(api('importDrop', { t: T3, id: id4 }).ok && rows('Imports').filter((x) => x.import_id === id4).every((x) => x.state === 'dropped') && api('pdfState', { t: T3, id: id4 }).state === 'gone', '"Buang senarai" → nothing saved');
  mode = 'junk';
  const id5 = api('pdfUpload', { t: T3, name: 'scan2.pdf', b64: pdfB64('scan2') }).id;
  api('pdfRead', { t: T3, id: id5 });
  ok(api('pdfDrop', { t: E3, id: id5 }).ok && rows('PdfFiles').find((x) => x.import_id === id5).state === 'dropped' && !api('imports', { t: T3 }).failed.some((x) => x.id === id5), 'a failed PDF can be hidden');
  mode = 'normal';

  // a list started in Telegram is finished in the web-app
  W.botPost({ message: { message_id: 991, from: { id: 222, first_name: 'Ali', last_name: 'Firdaus', username: 'alifirdaus' }, chat: { id: 222, type: 'private' }, date: Math.floor(env.clock.get() / 1000),
    document: { file_id: 'PDFTG1', file_unique_id: 'UNIQTG1', file_name: 'SCI telegram.pdf', mime_type: 'application/pdf', file_size: 300000 } } });
  W.botExec(() => W.bot.runJobs());
  const tg = rows('PdfFiles').find((x) => x.file_name === 'SCI telegram.pdf');
  IM = api('imports', { t: E3 });
  ok(tg && IM.pending.some((x) => x.id === tg.import_id && x.by === 'Ali Firdaus' && x.n >= 4), 'a Telegram tick list shows in the web-app');
  ok(!api('import', { t: E3, id: tg.import_id }).same, 'no same-report warning: the earlier SCI list was undone');
  r = api('importSave', { t: E3, id: tg.import_id });
  ok(r.ok && r.nE + r.nM >= 3, 'finished and saved from the web-app');
  W.tap('222', 'is:' + tg.import_id);
  ok(/sudah selesai/.test(strip(W.last('222').text)), 'the Telegram list then says "sudah selesai"');
  const id6 = api('pdfUpload', { t: T3, name: 'SCI DPR rev1.pdf', b64: pdfB64('SCI rev1') }).id;
  api('pdfRead', { t: T3, id: id6 });
  const sm = api('import', { t: T3, id: id6 }).same;
  ok(sm && sm.id === tg.import_id && sm.st === 'saved', 'another SCI file for the same date → "sudah dihantar" warning on the list');
  api('importDrop', { t: T3, id: id6 });
  ok(!api('importUndo', { t: T3, id: tg.import_id }).ok && rows('Imports').filter((x) => x.import_id === tg.import_id && x.state === 'saved').length > 0, 'a technician cannot undo an import someone else saved');
  ok(api('importUndo', { t: E3, id: tg.import_id }).ok, 'the engineer who saved it can');
}

section('Clean run');
ok(!rows('Log').some((l) => l.level === 'ERROR'), 'no ERROR rows in the Log tab');
ok(env.warnings.length === 0, 'no unprotected values written to Sheets' + (env.warnings.length ? ': ' + env.warnings.slice(0, 3).join(' | ') : ''));
ok(W.failures.length === 0, 'locks released, JSON replies' + (W.failures.length ? ': ' + W.failures.join(' | ') : ''));

console.log('\n' + (fails ? '❌ ' + fails + ' failed, ' + passes + ' passed' : '✅ All ' + passes + ' web checks passed'));
process.exit(fails ? 1 : 0);
