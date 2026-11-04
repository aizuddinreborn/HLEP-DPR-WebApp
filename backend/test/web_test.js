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
ok(mine.edit && !engs.edit && mine.photos.length === 2, 'technician may edit only his own line (as /semak)');
ok(api('day', { t: E, date: '10/10/2026' }).entries.every((e) => e.edit), 'engineer may edit all');
r = api('update', { t: T, id: engs.id, text: 'Hacked.' });
ok(!r.ok && /sendiri/.test(r.err), 'technician cannot change the engineer\'s line');
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

section('Clean run');
ok(!rows('Log').some((l) => l.level === 'ERROR'), 'no ERROR rows in the Log tab');
ok(env.warnings.length === 0, 'no unprotected values written to Sheets' + (env.warnings.length ? ': ' + env.warnings.slice(0, 3).join(' | ') : ''));
ok(W.failures.length === 0, 'locks released, JSON replies' + (W.failures.length ? ': ' + W.failures.join(' | ') : ''));

console.log('\n' + (fails ? '❌ ' + fails + ' failed, ' + passes + ' passed' : '✅ All ' + passes + ' web checks passed'));
process.exit(fails ? 1 : 0);
