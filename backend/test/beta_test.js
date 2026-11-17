'use strict';
// w2.0 checks: search, dashboard, calendar, carry-over, Tanya DPR chat (Gemini and Claude), voice, photo guess,
// preferences, and the BETA sandbox (a second web project on a private copy of the data).
//   node backend/build.js && node backend/test/beta_test.js
const vm = require('vm');
const { makeWorld } = require('./world');

let fails = 0;
let passes = 0;
function ok(c, m) { if (c) { passes++; console.log('  ✅ ' + m); } else { fails++; console.log('  ❌ FAIL: ' + m); } }
function section(t) { console.log('\n=== ' + t + ' ==='); }
const JPG = Buffer.from('\xFF\xD8\xFFFAKEJPEG-site-photo', 'binary').toString('base64');
let cidN = 1;
const cid = () => 'c' + Date.now().toString(36) + (cidN++) + 'abcdef';
const DAY = 86400000;

// ---------------------------------------------------------------- a week of site records (05/10 → 10/10/2026)
const W = makeWorld({ now: Date.UTC(2026, 9, 5, 1, 30, 0) });      // Monday 05/10/2026 09:30 in Malaysia
const { env, api, rows } = W;
W.webExec(() => W.web.setup());
W.setCellByKey('WebUsers', 'user_id', '111', 'new_pin', '4321');
W.setCellByKey('WebUsers', 'user_id', '222', 'new_pin', '1234');
env.clock.add(61000);
api('boot');
const T = api('login', { id: '222', pin: '1234' }).token;          // Ali Firdaus, technician
const E = api('login', { id: '111', pin: '4321' }).token;          // Aizuddin, engineer
const save = (t, date, area, cat, status, shift, text, raw, photos) => {
  const r = api('save', { t, cid: cid(), date, area, cat, status, shift, text, raw: raw || '', photos: photos || [] });
  if (!r.ok) throw new Error('seed save failed: ' + r.err);
  return r.id;
};
// Mon 05/10
save(T, '05/10/2026', 'U1', 'U1_EPS', 'IP', 'D', 'Cable pulling of 3C power cable from SST to LV panel is ongoing (40 m completed).', 'tarik kabel 3C dari SST ke panel LV, 40m');
api('weather', { t: E, date: '05/10/2026', w: 'Sunny' });
api('plan', { t: E, area: 'U1', cat: 'U1_EPS', text: 'Continue cable pulling to the LV panel.', date: '06/10/2026' });
env.clock.add(DAY);                                                 // Tue 06/10
save(T, '06/10/2026', 'U1', 'U1_EPS', 'IP', 'D', 'Installation of battery racks inside the battery room is ongoing.', 'pasang rak bateri dalam bilik bateri');
save(E, '06/10/2026', 'U4', 'U4_MS_GEN', 'IP', 'D', 'Cleaning and inspection of the stator is ongoing.', 'cuci dan periksa stator');
api('manpower', { t: E, list: [{ company: 'KEM LETRIK', count: 10 }, { company: 'SCI', count: 9 }] });
env.clock.add(DAY);                                                 // Wed 07/10
const idRackDone = save(T, '07/10/2026', 'U1', 'U1_EPS', 'CP', 'D', 'Installed battery racks inside the battery room.');
save(T, '07/10/2026', 'U1', 'U1_EPS', 'CP', 'D', 'IR test for LV & MV cables completed.', 'uji IR kabel LV dan MV');
api('material', { t: T, area: 'U1', cat: 'U1_EPS', item: 'Battery rack 110VDC', date: '07/10/2026' });
api('progress', { t: E, key: 'U1_EPS', pct: 52 });
env.clock.add(DAY);                                                 // Thu 08/10
save(T, '08/10/2026', 'U1', 'U1_PHCRANE', 'IP', 'N', 'Punchlist closing for the PH crane limit switch is ongoing.');
env.clock.add(DAY);                                                 // Fri 09/10
save(T, '09/10/2026', 'U1', 'U1_EPS', 'IP', 'D', 'Cable pulling of 3C power cable from SST to LV panel is ongoing (60 m completed).', 'tarik kabel 3C dari SST ke panel LV, 60m siap');
const gtxPhoto = api('upload', { t: E, cid: cid(), date: '09/10/2026', mime: 'image/jpeg', b64: JPG }).id;
const idGtx = save(E, '09/10/2026', 'U4', 'U4_RC_GTX', 'CP', 'D', 'GTx oil sampling completed.', '', [gtxPhoto]);
api('progress', { t: E, key: 'U1_EPS', pct: 55 });
api('plan', { t: E, area: 'U1', cat: 'U1_EPS', text: 'Continue cable termination at the LV panel.', date: '10/10/2026' });
env.clock.add(DAY);                                                 // Sat 10/10 = today
const idToday = save(T, '10/10/2026', 'U1', 'U1_EPS', 'IP', 'D', 'Cable termination at the LV panel is ongoing.');

section('Meta tells the app what this backend offers');
{
  const m = api('meta', { t: T });
  ok(m.ok && m.v === 'w2.0' && m.env && m.env.sandbox === false, 'version w2.0, live data (not a sandbox)');
  ok(m.chat && m.chat.on === true && m.chat.provider === 'gemini' && m.voice === true && m.guess === true, 'chat on with Gemini; voice and photo guess on');
  ok(Array.isArray(m.feat) && ['search', 'insights', 'cal', 'carry'].every((f) => m.feat.indexOf(f) >= 0), 'feature list for the app');
}

section('Search: words, Malay words, filters, paging');
{
  let r = api('search', { t: T, q: 'battery rack' });
  ok(r.ok && r.total === 2 && r.items[0].date === '2026-10-07' && r.items[1].date === '2026-10-06' && !r.loose, 'two activities, newest first');
  ok(r.materials.length === 1 && r.materials[0].item === 'Battery rack 110VDC' && r.materials[0].date === '2026-10-07', 'the matching material arrival comes with it');
  r = api('search', { t: T, q: 'rak bateri' });
  ok(r.total === 2, 'Malay words find the English lines ("rak bateri" → battery rack)');
  r = api('search', { t: T, q: 'kabel' });
  ok(r.total === 4 && r.items.every((x) => /cable/i.test(x.text)), '"kabel" finds every cable line (4)');
  r = api('search', { t: T, q: 'cable', status: 'CP' });
  ok(r.total === 1 && /IR test/.test(r.items[0].text), 'status filter');
  r = api('search', { t: T, unit: 'U4' });
  ok(r.total === 2 && r.items.every((x) => x.area === 'U4') && r.materials.length === 0, 'unit filter, no words');
  r = api('search', { t: T, from: '06/10/2026', to: '07/10/2026' });
  ok(r.total === 4, 'date range (dd/mm/yyyy)');
  r = api('search', { t: T, from: '2026-10-09' });
  ok(r.total === 3, 'date as yyyy-mm-dd also accepted');
  r = api('search', { t: T, who: 'aizuddin' });
  ok(r.total === 2 && r.items.every((x) => x.who === 'Aizuddin'), 'person filter');
  r = api('search', { t: T, photos: true });
  ok(r.total === 1 && r.items[0].id === idGtx, 'only activities with photos');
  r = api('search', { t: T, shift: 'N' });
  ok(r.total === 1 && /PH crane/.test(r.items[0].text), 'night shift filter');
  r = api('search', { t: T, cat: 'U1_PHCRANE' });
  ok(r.total === 1, 'system filter by key');
  r = api('search', { t: T, q: 'battery crane' });
  ok(r.loose === true && r.total === 3, 'no line has both words → best partial matches, marked loose');
  r = api('search', { t: T, q: 'zzzz' });
  ok(r.ok && r.total === 0 && r.items.length === 0, 'nothing found is not an error');
  r = api('search', { t: T, limit: 3 });
  const r2 = api('search', { t: T, limit: 3, offset: 3 });
  ok(r.items.length === 3 && r.more === true && r2.items.length === 3 && r2.items[0].id !== r.items[0].id && r2.materials === undefined, 'paging: 3 + 3, materials only on the first page');
  ok(!api('search', { t: T, from: '99/99/2026' }).ok, 'unreadable date refused');
  ok(api('search', { q: 'cable' }).code === 'auth', 'search needs a login');
  ok(r.items[0].edit === true && typeof r.items[0].del === 'boolean' && Array.isArray(r.items[0].photos), 'results are full activity cards (same shape as the day list)');
}

section('Calendar dots');
{
  const c = api('cal', { t: T, month: '2026-10' });
  ok(c.ok && c.month === '2026-10' && c.days['2026-10-07'].n === 2 && c.days['2026-10-07'].cp === 2 && c.days['2026-10-09'].n === 2 && !c.days['2026-10-04'], 'counts per day for the month');
  ok(api('cal', { t: T }).month === '2026-10' && Object.keys(api('cal', { t: T, month: '2026-09' }).days).length === 0, 'default = this month; an empty month is fine');
}

section('"Sambung": work still in progress from the last working day');
{
  let d = api('day', { t: T, date: '10/10/2026' });
  const texts = d.carry.map((x) => x.text);
  ok(d.carry.length === 3 && texts.some((x) => /60 m completed/.test(x)) && texts.some((x) => /stator/.test(x)) && texts.some((x) => /PH crane/.test(x)),
    'three ongoing lines: EPS (09/10), PH crane (08/10), stator (06/10)');
  ok(!texts.some((x) => /GTx|battery|IR test/.test(x)), 'completed lines and older days of the same system are not offered');
  ok(d.carry[0].date === '2026-10-09' && d.carry[0].cat === 'U1_EPS' && d.carry[0].raw === 'tarik kabel 3C dari SST ke panel LV, 60m siap' && d.carry.find((x) => /PH crane/.test(x.text)).shift === 'N', 'newest first, with the original note and shift');
  save(T, '10/10/2026', 'U1', 'U1_PHCRANE', 'IP', 'N', 'Punchlist closing for the PH crane limit switch is ongoing.');
  d = api('day', { t: T, date: '10/10/2026' });
  ok(d.carry.length === 2 && !d.carry.some((x) => /PH crane/.test(x.text)), 'once continued today, it is no longer offered');
  ok(api('day', { t: T, date: '05/10/2026' }).carry.length === 0, 'nothing before the first day');
}

section('Dashboard (insights)');
{
  const i = api('insights', { t: E, date: '10/10/2026', days: 7 });
  ok(i.ok && i.range.from === '2026-10-04' && i.range.to === '2026-10-10' && i.perDay.length === 7, '7-day range ending today');
  ok(i.kpi.acts === 10 && i.kpi.cp === 3 && i.kpi.ip === 7 && i.kpi.photos === 1 && i.kpi.people === 2 && i.kpi.workDays === 6, 'KPIs: 10 activities, 3 completed, 7 in progress, 1 photo, 2 people, 6 working days');
  ok(i.prev.acts === 0 && i.total === 10 && i.first === '2026-10-05', 'previous period and totals');
  const d7 = i.perDay.find((x) => x.date === '2026-10-07');
  ok(d7.n === 2 && d7.cp === 2 && i.perDay.find((x) => x.date === '2026-10-04').n === 0 && i.perDay.find((x) => x.date === '2026-10-06').mp === 19 && i.perDay.find((x) => x.date === '2026-10-05').weather === 'Sunny', 'per day: counts, manpower typed that day, weather');
  const eps = i.systems.find((s) => s.key === 'U1_EPS');
  ok(eps.pct === 55 && eps.pctPrev === 48 && eps.pctDate === '2026-10-09' && eps.pctBy === 'Aizuddin' && eps.hist.length === 3 && eps.hist[0].pct === 48 && eps.hist[2].pct === 55, 'EPS: 55% now (48% before the range), history 48 → 52 → 55');
  ok(eps.n === 6 && eps.last === '2026-10-10' && eps.since === 0 && eps.ip === 1, 'EPS: 6 activities in range, updated today');
  const st = i.systems.find((s) => s.key === 'U4_MS_GEN');
  ok(st.since === 4 && st.ip === 1 && st.hasPct === false && st.pct === null, 'stator: quiet for 4 days with work in progress');
  const ali = i.team.find((p) => p.name === 'Ali Firdaus');
  const aiz = i.team.find((p) => p.name === 'Aizuddin');
  ok(ali.today === 2 && ali.range === 8 && aiz.today === 0 && aiz.range === 2 && /^2026-10-/.test(ali.last) && i.team[0].name === 'Ali Firdaus', 'team: who reported today, counts in range, most active first');
  const kinds = i.attention.map((a) => a.kind);
  ok(kinds.indexOf('quiet') >= 0 && i.attention.find((a) => a.kind === 'quiet').key === 'U4_MS_GEN' && i.attention.find((a) => a.kind === 'quiet').days === 4, 'attention: stator quiet for 4 days');
  ok(kinds.indexOf('weather') >= 0 && kinds.indexOf('manpower') >= 0 && i.attention.find((a) => a.kind === 'manpower').last === '2026-10-06' && kinds.indexOf('plan') >= 0, 'attention: weather, manpower and tomorrow\'s plan not filled for today');
  ok(!i.attention.some((a) => a.kind === 'pct' && a.key === 'U1_EPS'), 'EPS % was updated yesterday: not flagged');
  ok(i.materials.length === 1 && i.materials[0].item === 'Battery rack 110VDC' && i.materialsTotal === 10 && i.manpower.total === 19 && i.manpower.date === '2026-10-06', 'material arrivals in range, latest manpower');
  const i14 = api('insights', { t: T, days: 99 });
  ok(i14.ok && i14.range.days === 14 && i14.perDay.length === 14, 'an odd range falls back to 14 days; technicians can see the dashboard');
  env.clock.add(8 * DAY);
  const late = api('insights', { t: E, days: 7 });
  ok(late.attention.some((a) => a.kind === 'pct' && a.key === 'U1_EPS' && a.days === 9) === false, 'a system with no activity in the range is not nagged about its %');
  env.clock.add(-8 * DAY);
}

// ---------------------------------------------------------------- chat
const sysOf = (body) => body.systemInstruction.parts[0].text;
const lastTurn = (body) => body.contents[body.contents.length - 1];
const refIn = (text, re) => { const line = text.split('\n').find((l) => re.test(l)) || ''; return (line.match(/\[([AMP]\d+)\]/) || [])[1]; };
const ask = (t, q, hist) => api('chat', { t, messages: (hist || []).concat([{ role: 'user', text: q }]) });

section('Tanya DPR: an answer straight from the context pack');
{
  W.chat.calls.length = 0;
  W.chatModel = (body) => {
    const ref = refIn(sysOf(body), /Cable termination at the LV panel is ongoing/);
    return { parts: [{ text: 'thinking', thought: true }, { text: 'Hari ini: **Cable termination at the LV panel is ongoing** [' + ref + '].' }] };
  };
  const r = ask(T, 'Apa kerja hari ini?');
  ok(r.ok && /Cable termination/.test(r.reply) && r.refs.length === 1 && r.refs[0].kind === 'entry' && r.refs[0].entry.id === idToday && r.steps.length === 0 && r.provider === 'gemini', 'answer with one source card, no lookups');
  ok(W.chat.calls.length === 1, 'one model call');
  const b = W.chat.calls[0].body;
  const sys = sysOf(b);
  ok(W.chat.calls[0].model === 'gemini-flash-latest' && b.tools[0].functionDeclarations.length === 8 && b.toolConfig.functionCallingConfig.mode === 'AUTO' && b.generationConfig.thinkingConfig.thinkingLevel === 'low' && b.generationConfig.temperature === undefined,
    'request: flash model, 8 tools, AUTO, low thinking, no temperature');
  const decl = b.tools[0].functionDeclarations.find((f) => f.name === 'cari_aktiviti');
  ok(decl.parameters.type === 'OBJECT' && decl.parameters.properties.status.type === 'STRING' && decl.parameters.properties.status.enum.join() === 'NS,IP,CP' && decl.parameters.properties.limit.type === 'INTEGER' && decl.parameters.properties.has_photos.type === 'BOOLEAN',
    'tool schema in Gemini\'s form (upper-case types, enums)');
  ok(/TODAY: 2026-10-10 \(Saturday \/ Sabtu\)/.test(sys) && /Asked by: Ali Firdaus \(technician\)/.test(sys) && /U1_EPS \| U1 \| EPS \| 55%/.test(sys), 'pack: today, who asks, systems with %');
  ok(/2026-10-10 \(Saturday, today\) – 2 activities/.test(sys) && /2026-10-09 \(Friday, yesterday\) – 2 activities/.test(sys) && /2026-10-08 \(Thursday\) – 1 activities/.test(sys) && !/2026-10-07 \(Wednesday\)/.test(sys), 'pack: the last three days with records, in report order');
  ok(/\[A\d+\] U4 · REMACO · RC Malim Nawar \(GTx\) · CP · Aizuddin: GTx oil sampling completed\. \(1 photo\)/.test(sys), 'pack line: ref, unit, system, status, who, text, photos');
  ok(/LAST UPDATE OF THE OTHER SYSTEMS: .*GENERATOR \(U4\) 2026-10-06/.test(sys) && /\[P\d+\] 2026-10-10 \(today\) · U1 · EPS: Continue cable termination/.test(sys), 'pack: other systems\' last dates; plans');
  ok(/\[M\d+\] 2026-10-07 · U1 · EPS: Battery rack 110VDC/.test(sys) && /MANPOWER \(as of 2026-10-06\): KEM LETRIK 10, SCI 9 · total 19/.test(sys) && /WEATHER: today not set/.test(sys) && /PTW OPENED U1: /.test(sys) && /RECORDS: 10 activities since 2026-10-05/.test(sys), 'pack: arrivals, manpower, weather, PTW, totals');
  ok(lastTurn(b).role === 'user' && lastTurn(b).parts[0].text === 'Apa kerja hari ini?', 'the question is the last turn');
}

section('Tanya DPR: looks things up with tools, cites the records');
{
  W.chat.calls.length = 0;
  W.chatModel = (body) => {
    const lt = lastTurn(body);
    const fr = lt.parts.find((p) => p.functionResponse);
    if (!fr) return { parts: [{ functionCall: { name: 'cari_aktiviti', args: { q: 'battery rack', status: 'CP', order: 'oldest' } }, thoughtSignature: 'SIG-1' }] };
    const it = fr.functionResponse.response.result.items[0];
    return { parts: [{ text: 'Rak bateri siap dipasang pada ' + it.date + ' oleh ' + it.by + ' [' + it.ref + '].' }] };
  };
  const r = ask(E, 'Bila rak bateri siap dipasang?');
  ok(r.ok && /siap dipasang pada 07\/10\/2026 oleh Ali Firdaus/.test(r.reply) && r.refs.length === 1 && r.refs[0].entry.id === idRackDone, 'answer gives the date as dd/mm/yyyy and cites the right activity');
  ok(r.steps.length === 1 && r.steps[0].t === 'Cari aktiviti: “battery rack” · CP → 1', 'the lookup is shown as a step');
  ok(W.chat.calls.length === 2, 'two model calls');
  const c2 = W.chat.calls[1].body.contents;
  ok(c2[c2.length - 2].role === 'model' && c2[c2.length - 2].parts[0].thoughtSignature === 'SIG-1' && c2[c2.length - 2].parts[0].functionCall.name === 'cari_aktiviti', 'the model\'s turn goes back unchanged (thought signature kept)');
  const res = c2[c2.length - 1].parts[0].functionResponse;
  ok(c2[c2.length - 1].role === 'user' && res.name === 'cari_aktiviti' && res.response.result.total === 1 && res.response.result.by_status.CP === 1 && res.response.result.earliest === '2026-10-07' && res.response.result.items[0].system === 'EPS',
    'tool result: total, counts by status, earliest date, items');

  // materials, several refs in one bracket, an invented ref
  W.chatModel = (body) => {
    const fr = lastTurn(body).parts.find((p) => p.functionResponse);
    if (!fr) return { parts: [{ functionCall: { name: 'bahan_tiba', args: { q: 'SST' }, id: 'call-7' } }] };
    const it = fr.functionResponse.response.result.items[0];
    const a = refIn(sysOf(body), /GTx oil sampling/);
    return { parts: [{ text: '**' + it.item + '** tiba pada ' + it.arrived + ' [' + it.ref + ', ' + a + '] [A999] [Z1].' }] };
  };
  const m = ask(E, 'Bila SST sampai?');
  ok(m.ok && /500kVA SST 1 & 2\*\* tiba pada 10\/08\/2026/.test(m.reply) && m.refs.length === 2 && m.refs[0].kind === 'material' && m.refs[0].item === '500kVA SST 1 & 2' && m.refs[0].date === '2026-08-10' && m.refs[1].kind === 'entry',
    'material arrival cited; "[M1, A2]" becomes two source cards');
  ok(!/A999/.test(m.reply) && /\[Z1\]/.test(m.reply) && /\[M\d+\]\[A\d+\]/.test(m.reply), 'an invented reference is removed; other brackets are left alone');
  ok(W.chat.calls[W.chat.calls.length - 1].body.contents.slice(-1)[0].parts[0].functionResponse.id === 'call-7' && m.steps[0].t === 'Bahan tiba: “SST” → 1', 'a function call id is echoed in the result');

  // a failing lookup goes back to the model as an error, and it can still answer
  W.chatModel = (body) => {
    const fr = lastTurn(body).parts.find((p) => p.functionResponse);
    if (!fr) return { parts: [{ functionCall: { name: 'ringkasan_hari', args: { date: 'esok lusa' } } }, { functionCall: { name: 'tak_wujud', args: {} } }] };
    return { parts: [{ text: (fr.functionResponse.response.result.error ? 'Maaf, tarikh itu tidak jelas.' : 'salah') }] };
  };
  const e = ask(E, 'Rekod esok lusa?');
  ok(e.ok && e.reply === 'Maaf, tarikh itu tidak jelas.' && e.steps.length === 2 && e.refs.length === 0, 'unreadable date and unknown tool → error results, the chat carries on');
  const er = W.chat.calls[W.chat.calls.length - 1].body.contents.slice(-1)[0].parts;
  ok(/Unreadable date/.test(er[0].functionResponse.response.result.error) && /Unknown tool/.test(er[1].functionResponse.response.result.error), 'each call gets its own result, in order');
}

section('Tanya DPR: every tool returns what its description promises');
{
  const run = (name, args) => W.webExec(() => { W.web.WEB_SNAP_TEST = 1; return JSON.parse(JSON.stringify(W.web.chatTool_(name, args, W.web.chatRefs_(), W.web.loadData_()))); });
  let o = run('cari_aktiviti', { q: 'cable', limit: 2 });
  ok(o.total === 4 && o.shown === 2 && o.items.length === 2 && o.by_status.IP === 3 && o.by_status.CP === 1 && o.earliest === '2026-10-05' && o.latest === '2026-10-10' && o.items[0].date === '2026-10-10', 'cari_aktiviti: totals over all matches, limit respected');
  ok(run('cari_aktiviti', { q: 'kabel 40m' }).items[0].original_note === 'tarik kabel 3C dari SST ke panel LV, 40m', 'cari_aktiviti: the technician\'s original note comes with the line');
  ok(/Nothing matches/.test(run('cari_aktiviti', { q: 'xyzzy' }).note) && /some of them/.test(run('cari_aktiviti', { q: 'battery crane' }).note), 'cari_aktiviti: notes for nothing found and partial matches');
  ok(run('cari_aktiviti', { reporter: 'Aizuddin', has_photos: 'true', source: 'web', status: 'cp', shift: 'd', unit: 'u4' }).total === 1, 'cari_aktiviti: forgiving about letter case and "true" as text');
  o = run('status_semasa', {});
  const eps = o.systems.find((s) => s.key === 'U1_EPS');
  ok(o.as_of === '2026-10-10' && o.systems.length === 12 && eps.last_update === '2026-10-10' && eps.days_since === 0 && eps.percent === 55 && eps.lines.length === 1 && /^A\d+$/.test(eps.lines[0].ref), 'status_semasa: all 12 systems, last day\'s lines, %');
  ok(o.systems.find((s) => s.key === 'U4_MS_GEN').days_since === 4 && o.systems.find((s) => s.key === 'U1_FIRE').last_update === null, 'status_semasa: days since the last update; never-updated systems');
  ok(run('status_semasa', { system: 'crane' }).systems.length === 2 && run('status_semasa', { system: 'U1_PHCRANE' }).systems.length === 1 && run('status_semasa', { unit: 'U4' }).systems.every((s) => s.unit === 'U4'), 'status_semasa: by name fragment (both cranes), by key, by unit');
  o = run('ringkasan_hari', { date: '2026-10-07' });
  ok(o.weekday === 'Wednesday' && o.activities_total === 2 && o.materials_arrived.length === 1 && o.manpower.as_of === '2026-10-06' && o.manpower.total === 19 && o.manpower.by_company.SCI === 9 && o.weather === null, 'ringkasan_hari: activities, arrivals, manpower as of that day');
  o = run('ringkasan_hari', { date: '09/10/2026' });
  ok(o.plan_for_next_day.length === 1 && /cable termination/.test(o.plan_for_next_day[0].text) && o.planned_for_this_day.length === 0 && Array.isArray(o.pdf_reports), 'ringkasan_hari: plan for the next day; dd/mm/yyyy accepted');
  o = run('bahan_tiba', { from: '2026-08-01', to: '2026-08-31' });
  ok(o.total === 6 && o.items[0].arrived >= o.items[5].arrived && /No arrival record/.test(run('bahan_tiba', { q: 'turbine' }).note), 'bahan_tiba: by month, newest first; a note when nothing is recorded');
  o = run('kemajuan', { system: 'EPS' });
  const k = o.systems.find((s) => s.key === 'U1_EPS');
  ok(k.percent === 55 && k.last_changed === '2026-10-09' && k.changed_by === 'Aizuddin' && k.history.map((h) => h.percent).join() === '48,52,55' && k.follows_dashboard === false, 'kemajuan: now, who changed it, history');
  ok(run('kemajuan', { system: 'U1_EPS', to: '2026-10-08' }).systems[0].percent === 52 && run('kemajuan', {}).systems.length === 5, 'kemajuan: as of an earlier date; all systems with a %');
  o = run('rancangan', {});
  ok(o.from === '2026-10-10' && o.total === 1 && run('rancangan', { from: '2026-10-01', to: '2026-10-31' }).total === 2, 'rancangan: from today by default, or a range');
  o = run('tenaga_kerja', {});
  ok(o.current.total === 19 && o.days.length === 1 && o.days[0].date === '2026-10-06' && o.days[0].by_company['KEM LETRIK'] === 10 && run('tenaga_kerja', { from: '2026-08-01' }).days.length === 2, 'tenaga_kerja: current and the days it was updated');
  o = run('statistik', { from: '2026-10-05', to: '2026-10-10', group_by: 'system' });
  ok(o.all.total === 10 && o.all.CP === 3 && o.groups['EPS (U1)'].total === 6 && o.groups['PH CRANE (U1)'].total === 2 && o.groups['REMACO · RC Malim Nawar (GTx) (U4)'].photos === 1, 'statistik by system');
  ok(run('statistik', { from: '2026-10-05', group_by: 'reporter' }).groups['Ali Firdaus'].total === 8 && run('statistik', { from: '2026-10-05', group_by: 'week' }).groups['week of 2026-10-05'].total === 10 &&
    run('statistik', { from: '2026-10-05', group_by: 'month' }).groups['2026-10'].total === 10 && run('statistik', { from: '2026-10-05', group_by: 'shift' }).groups.night.total === 2 &&
    run('statistik', { from: '2026-10-05', group_by: 'status' }).groups.IP.total === 7 && run('statistik', { from: '2026-10-05', group_by: 'unit' }).groups.U4.total === 2 &&
    run('statistik', { from: '2026-10-05', group_by: 'day' }).groups['2026-10-07'].CP === 2, 'statistik by reporter, week, month, shift, status, unit, day');
}

section('Tanya DPR: conversation, limits of the loop, failures');
{
  // history: earlier references are stripped, same-role runs merged, a leading assistant message dropped
  W.chat.calls.length = 0;
  W.chatModel = () => ({ parts: [{ text: 'Baik.' }] });
  let r = api('chat', { t: T, messages: [{ role: 'assistant', text: 'Hai' }, { role: 'user', text: 'Kemajuan EPS?' }, { role: 'assistant', text: 'EPS **55%** [A3] sejak 09/10/2026 [P1].' },
    { role: 'user', text: 'Dan' }, { role: 'user', text: 'PH crane?' }] });
  const cs = W.chat.calls[0].body.contents;
  ok(r.ok && cs.length === 3 && cs[0].role === 'user' && cs[1].role === 'model' && cs[1].parts[0].text === 'EPS **55%** sejak 09/10/2026.' && cs[2].parts[0].text === 'Dan\nPH crane?', 'history cleaned before it goes to the model');
  ok(!api('chat', { t: T, messages: [] }).ok && !api('chat', { t: T, messages: [{ role: 'assistant', text: 'x' }] }).ok && !api('chat', { t: T, messages: [{ role: 'user', text: '   ' }] }).ok, 'an empty question is refused');

  // a model that keeps calling tools is made to answer on the 5th call
  W.chat.calls.length = 0;
  W.chatModel = (body) => (body.toolConfig.functionCallingConfig.mode === 'NONE' ? { parts: [{ text: 'Jawapan akhir.' }] } : { parts: [{ functionCall: { name: 'status_semasa', args: { system: 'EPS' } } }] });
  r = ask(T, 'Pusing-pusing');
  ok(r.ok && r.reply === 'Jawapan akhir.' && W.chat.calls.length === 5 && r.steps.length === 4, 'at most 5 model calls: the last one is told to answer without tools');
  // an empty turn → one nudge, then the answer
  W.chat.calls.length = 0;
  let n = 0;
  W.chatModel = (body) => (++n === 1 ? { parts: [], finish: 'MALFORMED_FUNCTION_CALL' } : { parts: [{ text: 'Maaf, cuba lagi: ' + lastTurn(body).parts[0].text.slice(0, 6) }] });
  r = ask(T, 'Soalan pelik');
  ok(r.ok && /Maaf, cuba lagi: Answer/.test(r.reply) && W.chat.calls.length === 2 && W.chat.calls[1].body.toolConfig.functionCallingConfig.mode === 'NONE', 'a malformed turn → asked once more, without tools');
  W.chatModel = () => ({ parts: [] });
  r = ask(T, 'Senyap');
  ok(!r.ok && r.code === 'ai' && /tidak memberi jawapan/.test(r.err), 'no answer at all → a clear message');

  // provider failures
  W.chat.calls.length = 0;
  W.chatModel = (body, model) => (model === 'gemini-flash-latest' ? { status: 429, msg: 'Resource exhausted' } : { parts: [{ text: 'Dari model kedua.' }] });
  r = ask(T, 'Had?');
  ok(r.ok && r.reply === 'Dari model kedua.' && W.chat.calls.map((c) => c.model).join() === 'gemini-flash-latest,gemini-3.5-flash-lite', '429 on the first model → the second model answers');
  W.chatModel = () => ({ status: 429, msg: 'Resource exhausted' });
  r = ask(T, 'Had?');
  ok(!r.ok && r.code === 'ai' && /Had AI dicapai/.test(r.err), 'both models limited → "cuba lagi sebentar"');
  W.chat.calls.length = 0;
  W.chatModel = () => ({ status: 403, msg: 'API key not valid' });
  r = ask(T, 'Kunci?');
  ok(!r.ok && /Kunci AI ditolak/.test(r.err) && W.chat.calls.length === 1, 'a refused key stops at once (no second model)');
  W.chat.calls.length = 0;
  W.chatModel = (body) => (body.generationConfig.thinkingConfig ? { status: 400, msg: 'Thinking level is not supported for this model.' } : { parts: [{ text: 'Tanpa thinking.' }] });
  r = ask(T, 'Thinking?');
  ok(r.ok && r.reply === 'Tanpa thinking.' && W.chat.calls.length === 2 && W.chat.calls[1].model === 'gemini-flash-latest', 'a model without the thinking setting → same model again without it');
  W.chatModel = () => ({ raw: { promptFeedback: { blockReason: 'SAFETY' } } });
  r = ask(T, 'Disekat?');
  ok(!r.ok && r.code === 'ai' && /tidak dapat menjawab soalan ini/.test(r.err), 'a blocked prompt → a clear message');
  ok(!rows('Log').some((l) => l.level === 'ERROR'), 'none of these wrote an ERROR to the Log tab');
}

section('Tanya DPR: who may use it, and how much');
{
  W.chatModel = () => ({ parts: [{ text: 'ok' }] });
  ok(api('prefs', { t: T }).code === 'eng' && api('prefSet', { t: T, key: 'CHAT_ACCESS', value: 'eng' }).code === 'eng', 'only engineers see and change the preference');
  let p = api('prefs', { t: E });
  ok(p.ok && p.list.length === 1 && p.list[0].key === 'CHAT_ACCESS' && p.list[0].value === 'all' && p.list[0].options.length === 3, 'default: everyone');
  ok(api('prefSet', { t: E, key: 'CHAT_ACCESS', value: 'eng' }).ok && api('meta', { t: T }).chat.on === false && api('meta', { t: T }).chat.why === 'eng' && api('meta', { t: E }).chat.on === true, 'engineers only → the technician\'s app hides the chat');
  let r = ask(T, 'Boleh?');
  ok(!r.ok && r.code === 'chat_eng' && ask(E, 'Boleh?').ok, 'the backend refuses the technician too');
  api('prefSet', { t: E, key: 'CHAT_ACCESS', value: 'off' });
  ok(ask(E, 'Boleh?').code === 'chat_off' && api('meta', { t: E }).chat.why === 'off', 'switched off for everyone');
  ok(!api('prefSet', { t: E, key: 'CHAT_ACCESS', value: 'semua' }).ok && !api('prefSet', { t: E, key: 'LAIN', value: 'x' }).ok, 'unknown values and keys refused');
  api('prefSet', { t: E, key: 'CHAT_ACCESS', value: 'all' });
  ok(!Object.keys(env.props).some((k) => /wpref_/.test(k)) && W.sep.props.wpref_CHAT_ACCESS === 'all' && !rows('Settings').some((s) => /CHAT/.test(s.key)), 'kept in the web project\'s Script properties, not in the Sheet or the bot');
  // hourly limit: fresh hour, 30 questions pass, the 31st does not
  env.clock.add(3600000);
  let okN = 0;
  for (let i = 0; i < 30; i++) if (ask(T, 'q' + i).ok) okN++;
  r = ask(T, 'q31');
  ok(okN === 30 && !r.ok && r.code === 'limit' && ask(E, 'saya lain').ok, '30 questions an hour per person; another person is not affected');
  env.clock.add(3600000);
  ok(ask(T, 'jam baru').ok, 'a new hour, a new allowance');
  W.sep.props.CHAT_LIMIT_DAY = '32';
  r = ask(T, 'had harian');
  ok(!r.ok && r.code === 'limit' && /sehari/.test(r.err), 'the daily limit (CHAT_LIMIT_DAY) applies');
  delete W.sep.props.CHAT_LIMIT_DAY;
  delete W.sep.props.GEMINI_API_KEY;
  ok(api('meta', { t: T }).chat.why === 'noai' && ask(T, 'tiada kunci').code === 'chat_noai', 'no AI key → the chat is off, with the reason');
  W.sep.props.GEMINI_API_KEY = 'AIzaFAKEKEY';
}

section('Tanya DPR with Claude (when ANTHROPIC_API_KEY is added)');
{
  W.sep.props.ANTHROPIC_API_KEY = 'sk-ant-test';
  ok(api('meta', { t: E }).chat.provider === 'claude', 'the app is told Claude answers');
  W.claude.calls.length = 0;
  W.claude.responder = (body) => {
    const lastMsg = body.messages[body.messages.length - 1];
    const tr = Array.isArray(lastMsg.content) ? lastMsg.content.find((x) => x.type === 'tool_result') : null;
    if (!tr) {
      return { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: 'sig-abc' }, { type: 'text', text: 'Saya semak dahulu.' },
        { type: 'tool_use', id: 'toolu_1', name: 'cari_aktiviti', input: { q: 'IR test' } }] };
    }
    const it = JSON.parse(tr.content).items[0];
    return { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '', signature: 'sig-def' }, { type: 'text', text: 'IR test siap pada ' + it.date + ' [' + it.ref + '].' }] };
  };
  let r = ask(E, 'Bila IR test siap?');
  ok(r.ok && r.provider === 'claude' && /IR test siap pada 07\/10\/2026/.test(r.reply) && r.refs.length === 1 && /IR test/.test(r.refs[0].entry.text) && r.steps[0].t === 'Cari aktiviti: “IR test” → 1', 'Claude: tool call, answer, source card');
  const c1 = W.claude.calls[0];
  ok(c1.headers['x-api-key'] === 'sk-ant-test' && c1.headers['anthropic-version'] === '2026-10-21' && c1.headers['anthropic-beta'] === 'server-side-fallback-2026-07-01', 'headers: key, API version, fallback beta');
  ok(c1.body.model === 'claude-opus-5-5' && c1.body.fallbacks === 'default' && c1.body.output_config.effort === 'low' && c1.body.cache_control.type === 'ephemeral' && c1.body.max_tokens === 8000 &&
    c1.body.thinking === undefined && c1.body.temperature === undefined && c1.body.tool_choice === undefined, 'body: default model, fallbacks "default", effort, caching; no thinking, temperature or forced tool');
  ok(c1.body.tools.length === 8 && c1.body.tools[0].input_schema.type === 'object' && c1.body.tools[0].input_schema.properties.status.type === 'string' && typeof c1.body.system === 'string' && /=== CONTEXT ===/.test(c1.body.system), 'tools as input_schema; system prompt with the context pack');
  const m2 = W.claude.calls[1].body.messages;
  ok(m2.length === 3 && m2[1].role === 'assistant' && m2[1].content.length === 3 && m2[1].content[0].type === 'thinking' && m2[1].content[0].signature === 'sig-abc' && m2[1].content[2].id === 'toolu_1', 'the assistant turn goes back unchanged, thinking block included');
  ok(m2[2].role === 'user' && m2[2].content.length === 1 && m2[2].content[0].type === 'tool_result' && m2[2].content[0].tool_use_id === 'toolu_1' && typeof m2[2].content[0].content === 'string' && m2[2].content[0].is_error === undefined, 'one user message with the tool_result');

  // two tool calls in one turn → both results in a single user message; a failing one is marked is_error
  W.claude.calls.length = 0;
  W.claude.responder = (body) => {
    const lastMsg = body.messages[body.messages.length - 1];
    if (!Array.isArray(lastMsg.content)) {
      return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'toolu_a', name: 'kemajuan', input: { system: 'EPS' } }, { type: 'tool_use', id: 'toolu_b', name: 'ringkasan_hari', input: { date: 'entah' } }] };
    }
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'EPS 55%.' }] };
  };
  r = ask(E, 'EPS dan entah?');
  const tr = W.claude.calls[1].body.messages.slice(-1)[0].content;
  ok(r.ok && tr.length === 2 && tr[0].tool_use_id === 'toolu_a' && tr[0].is_error === undefined && tr[1].tool_use_id === 'toolu_b' && tr[1].is_error === true, 'parallel tool calls → all results in one message, the failed one flagged');

  // after a server-side fallback: thinking and tool_use before the fallback block are not echoed; the block stays
  W.claude.calls.length = 0;
  W.claude.responder = (body) => {
    const lastMsg = body.messages[body.messages.length - 1];
    if (!Array.isArray(lastMsg.content)) {
      return { stop_reason: 'tool_use', model: 'claude-opus-4-8', content: [{ type: 'thinking', thinking: '', signature: 'old' }, { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-4-8' } },
        { type: 'thinking', thinking: '', signature: 'new' }, { type: 'tool_use', id: 'toolu_f', name: 'status_semasa', input: { system: 'EPS' } }] };
    }
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Selesai.' }] };
  };
  r = ask(E, 'Fallback?');
  const echoed = W.claude.calls[1].body.messages[1].content;
  ok(r.ok && echoed.length === 3 && echoed[0].type === 'fallback' && echoed[1].signature === 'new' && echoed[2].id === 'toolu_f', 'fallback turn echoed correctly');

  // refusal, a cut-off tool call, the forced last turn, errors, other models
  W.claude.responder = () => ({ stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'cyber' }, content: [] });
  r = ask(E, 'Ditolak?');
  ok(!r.ok && r.code === 'ai' && /tidak dapat menjawab soalan ini/.test(r.err), 'a refusal → a clear message (content is not read)');
  W.claude.calls.length = 0;
  let k = 0;
  W.claude.responder = (body) => (++k === 1 ? { stop_reason: 'max_tokens', content: [{ type: 'tool_use', id: 'toolu_x', name: 'cari_aktiviti', input: { q: 'ca' } }] }
    : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Dari apa yang ada.' }] });
  r = ask(E, 'Terpotong?');
  ok(r.ok && r.reply === 'Dari apa yang ada.' && r.steps.length === 0 && W.claude.calls[1].body.tool_choice.type === 'none', 'a cut-off tool call is never run; the next call must answer (tool_choice none)');
  W.claude.calls.length = 0;
  W.claude.responder = () => ({ status: 529, type: 'overloaded_error', msg: 'Overloaded' });
  r = ask(E, 'Sibuk?');
  ok(!r.ok && r.code === 'ai' && W.claude.calls.length === 2, 'an overloaded API is tried twice, then a clear message');
  W.claude.calls.length = 0;
  W.claude.responder = () => ({ status: 401, type: 'authentication_error', msg: 'invalid x-api-key' });
  r = ask(E, 'Kunci?');
  ok(!r.ok && /Kunci AI ditolak/.test(r.err) && W.claude.calls.length === 1, 'a refused key is not retried');
  W.claude.responder = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
  W.sep.props.CLAUDE_CHAT_MODEL = 'claude-haiku-5-5';
  W.sep.props.CLAUDE_CHAT_EFFORT = 'medium';
  W.claude.calls.length = 0;
  ask(E, 'Haiku?');
  ok(W.claude.calls[0].body.model === 'claude-haiku-5-5' && W.claude.calls[0].body.fallbacks === undefined && W.claude.calls[0].headers['anthropic-beta'] === undefined && W.claude.calls[0].body.output_config.effort === 'medium',
    'CLAUDE_CHAT_MODEL and CLAUDE_CHAT_EFFORT are respected; no fallbacks parameter on Haiku');
  delete W.sep.props.CLAUDE_CHAT_MODEL;
  delete W.sep.props.CLAUDE_CHAT_EFFORT;
  W.sep.props.CHAT_PROVIDER = 'gemini';
  W.chatModel = () => ({ parts: [{ text: 'Gemini.' }] });
  ok(ask(E, 'Siapa?').provider === 'gemini', 'CHAT_PROVIDER = gemini keeps Gemini even with a Claude key');
  delete W.sep.props.CHAT_PROVIDER;
  delete W.sep.props.ANTHROPIC_API_KEY;
  ok(/Tanya DPR \(chat\): on – Gemini \(gemini-flash-latest, then gemini-3\.5-flash-lite\) · for: all/.test(W.webExec(() => W.web.setup())), 'setup log says which AI answers the chat');
}

section('Voice note → report line; photo → suggested system');
{
  const base = env.gemini.responder;
  env.gemini.responder = (body) => {
    const parts = body.contents[0].parts;
    const audio = parts.find((p) => p.inlineData && /^audio\//.test(p.inlineData.mimeType));
    const img = parts.find((p) => p.inlineData && /^image\//.test(p.inlineData.mimeType));
    if (audio) return audio.inlineData.mimeType === 'audio/wav' && /voice note is from a site technician/.test(parts[0].text) && /System: EBOP \/ EPS/.test(parts[0].text)
      ? JSON.stringify({ transcript: 'tarik kabel 3C lagi 20 meter, belum siap', line: 'Cable pulling of 3C power cable is ongoing (20 m more completed)' }) : 'not json';
    if (img) return /Pick the single most likely system/.test(parts[0].text) ? JSON.stringify({ category: 'U1_EPS', line: 'Cable drum beside the LV panel' }) : 'not json';
    return base(body);
  };
  const wav = Buffer.concat([Buffer.from('RIFF....WAVEfmt '), Buffer.alloc(6000, 1)]).toString('base64');
  let r = api('voice', { t: T, b64: wav, mime: 'audio/wav', area: 'U1', cat: 'U1_EPS', status: 'IP', shift: 'D' });
  ok(r.ok && r.transcript === 'tarik kabel 3C lagi 20 meter, belum siap' && r.line === 'Cable pulling of 3C power cable is ongoing (20 m more completed)', 'voice note → what was said + the English report line (the bot\'s own prompt)');
  ok(!api('voice', { t: T, b64: wav, mime: 'video/mp4' }).ok && !api('voice', { t: T, b64: Buffer.alloc(100).toString('base64'), mime: 'audio/wav' }).ok, 'wrong type or a too-short recording refused');
  ok(api('voice', { t: T, b64: wav, mime: 'audio/mp4' }).code === 'ai', 'when the AI cannot hear it → "cuba lagi, atau taip"');
  const pc = cid();
  const up = api('upload', { t: T, cid: pc, date: '10/10/2026', mime: 'image/jpeg', b64: JPG });
  r = api('guess', { t: T, cid: pc, area: 'U1' });
  ok(up.ok && r.ok && r.cat === 'U1_EPS' && r.area === 'U1' && r.label === 'EPS' && r.line === 'Cable drum beside the LV panel.', 'photo → suggested system and a draft line');
  ok(!api('guess', { t: T, cid: 'never-uploaded-1' }).ok, 'a photo that was not uploaded cannot be guessed');
  env.gemini.responder = base;
}

// ---------------------------------------------------------------- the BETA sandbox
section('Beta sandbox: a second project on a private copy of the data');
const snap = () => JSON.stringify(env.sheets.map((s) => [s.name, s.data]));
const realFiles = () => Object.values(env.files).filter((f) => !f._trashed).length;
const B = W.newWeb({ SHEET_URL: 'https://docs.google.com/spreadsheets/d/SHEET123/edit#gid=0', GEMINI_API_KEY: 'AIzaFAKEKEY' });
{
  ok(B.api('boot').code === 'setup', 'before setupBeta the beta backend answers "not set up"');
  const before = snap();
  const log = B.webExec(() => B.web.setupBeta());
  ok(/Web-app backend ready/.test(log) && /Mode: BETA sandbox – a private copy of the data/.test(log) && /Jana PDF via bot: off in the beta sandbox/.test(log) && /beta PINs are separate/.test(log), 'setupBeta log: ready, sandbox mode, PDF off, PIN note');
  ok(snap() === before, 'the real Sheet is byte-for-byte unchanged by setupBeta');
  const P = B.sep.props;
  const copy = W.books[P.SHEET_ID];
  ok(P.SANDBOX === 'Y' && P.SOURCE_SHEET_ID === 'SHEET123' && P.SHEET_ID !== 'SHEET123' && !!copy && /^HLEP DPR – BETA data \(salinan \d\d-\d\d-\d{4} \d\d\.\d\d\)$/.test(copy.getName()), 'sandbox properties set; SHEET_ID is the new copy');
  const folder = Object.values(env.folders).find((f) => f._name === 'HLEP DPR Beta (sandbox)');
  const sub = (n) => Object.values(env.folders).find((f) => f._parent === folder._id && f._name === n);
  ok(folder && folder._parent === 'ROOT' && sub('Photos') && sub('Reports') && sub('Contractor Reports') && copy._st.parent === folder._id, 'own Drive folder with Photos, Reports, Contractor Reports; the copy sits inside it');
  ok(P.PHOTO_FOLDER_ID === sub('Photos')._id && P.PHOTO_READ_FOLDER_ID === env.props.PHOTO_FOLDER_ID && P.ROOT_FOLDER_ID === folder._id && P.PHOTO_FOLDER_ID !== env.props.PHOTO_FOLDER_ID, 'uploads go to the beta Photos folder; the real Photos folder is read-only');
  const names = copy.getSheets().map((s) => s.getName());
  ok(names.join() === env.sheets.map((s) => s.name).join() && names.indexOf('Sheet1') < 0 && !names.some((n) => /^Copy of|^_blank_/.test(n)), 'every tab copied under its own name, in the same order; no leftover blank tab');
  const cRows = (n) => W.rowsOf(copy._sheets, n);
  ok(cRows('Entries').length === rows('Entries').length && cRows('Materials').length === rows('Materials').length && JSON.stringify(cRows('Categories')) === JSON.stringify(rows('Categories')) && cRows('Log').length === 0 && copy.getSheetByName('Log').data[0].join() === 'time,level,message',
    'same rows in the copy; the Log tab starts empty');
  ok(cRows('WebUsers').length === 2 && cRows('WebUsers').every((u) => u.pin_set === '' && u.last_login === '') && rows('WebUsers').every((u) => /^Y /.test(u.pin_set)), 'people copied without their PIN marks (the live marks are untouched)');
  ok(copy.getSpreadsheetTimeZone() === env.spreadsheet.getSpreadsheetTimeZone(), 'same time zone as the real Sheet');
  ok(!Object.keys(env.props).some((k) => /SANDBOX|PHOTO_READ/.test(k)) && W.sep.props.SANDBOX === undefined, 'nothing written into the bot\'s or the live web-app\'s properties');

  // beta logins are separate
  ok(B.api('login', { id: '222', pin: '1234' }).code === 'nopin', 'a live PIN does not work in beta');
  W.setCellIn(copy._sheets, 'WebUsers', 'user_id', '111', 'new_pin', '7777');
  W.setCellIn(copy._sheets, 'WebUsers', 'user_id', '222', 'new_pin', '8888');
  env.clock.add(61000);
  B.api('boot');
  const BE = B.api('login', { id: '111', pin: '7777' }).token;
  const BT = B.api('login', { id: '222', pin: '8888' }).token;
  ok(!!BE && !!BT && api('login', { id: '111', pin: '7777' }).code === 'pin' && api('day', { t: BE }).code === 'auth', 'beta PINs work only in beta; a beta session means nothing to the live backend');
  const m = B.api('meta', { t: BE });
  ok(m.env.sandbox === true && /^2026-10-10 /.test(m.env.at) && m.pdf === false && m.chat.on === true, 'meta: sandbox with its copy time; PDF off; chat on');

  // reading: copied data, real photos shown
  let d = B.api('day', { t: BT, date: '09/10/2026' });
  ok(d.ok && d.entries.length === 2 && d.entries.find((e) => e.id === idGtx).photos[0] === gtxPhoto, 'the beta shows the copied day');
  ok(/^data:image\/png;base64,/.test(B.api('thumbs', { t: BT, ids: [gtxPhoto] }).thumbs[gtxPhoto]) && B.api('photo', { t: BT, id: gtxPhoto }).ok, 'real photos can be viewed in beta');

  // writing: only the copy and the beta folder change
  const real0 = snap();
  const files0 = realFiles();
  const up = B.api('upload', { t: BT, cid: cid(), date: '10/10/2026', mime: 'image/jpeg', b64: JPG });
  const bid = B.api('save', { t: BT, cid: cid(), date: '10/10/2026', area: 'U1', cat: 'U1_GEN', status: 'IP', shift: 'D', text: 'Beta-only test activity.', photos: [up.id] }).id;
  const chain = (id) => { const out = []; let p = env.files[id]._parent; while (p && env.folders[p]) { out.push(env.folders[p]._name); p = env.folders[p]._parent; } return out.join(' < '); };
  ok(up.ok && chain(up.id) === '2026-10-10 < 2026-10 < Photos < HLEP DPR Beta (sandbox)', 'a beta upload lands in the beta Photos folder');
  ok(cRows('Entries').some((e) => e.entry_id === bid) && !rows('Entries').some((e) => e.entry_id === bid) && snap() === real0, 'a beta activity is saved in the copy only; the real Sheet is unchanged');
  B.api('weather', { t: BE, date: '10/10/2026', w: 'Rainy' });
  B.api('progress', { t: BE, key: 'U1_EPS', pct: 60 });
  B.api('material', { t: BT, area: 'U1', cat: 'U1_EPS', item: 'Beta cable gland', date: '10/10/2026' });
  ok(snap() === real0 && cRows('Days').some((x) => x.weather === 'Rainy') && cRows('Progress').some((x) => Number(x.percent) === 60) && cRows('Materials').some((x) => x.item === 'Beta cable gland'), 'weather, %, materials: copy only');

  // the dangerous part: deleting in beta must never trash a real photo
  let pr = B.api('photoDel', { t: BE, id: idGtx, photo: gtxPhoto });
  ok(pr.ok && pr.trashed === false && env.files[gtxPhoto]._trashed === false && cRows('Entries').find((e) => e.entry_id === idGtx).photo_ids === '' && rows('Entries').find((e) => e.entry_id === idGtx).photo_ids === gtxPhoto,
    'removing a REAL photo from a copied activity: gone from the copy\'s row, the file is NOT trashed, the real row keeps it');
  const livePhoto = api('upload', { t: T, cid: cid(), date: '10/10/2026', mime: 'image/jpeg', b64: JPG }).id;
  api('photoAdd', { t: T, id: idToday, photos: [livePhoto] });
  B.webExec(() => B.web.refreshBetaData());                                    // a fresh copy that knows this photo
  const copy2 = W.books[B.sep.props.SHEET_ID];
  const c2Rows = (n) => W.rowsOf(copy2._sheets, n);
  let rm = B.api('remove', { t: BT, id: idToday });
  ok(rm.ok && rm.photos === 0 && env.files[livePhoto]._trashed === false && c2Rows('Entries').find((e) => e.entry_id === idToday).deleted === 'Y' && rows('Entries').find((e) => e.entry_id === idToday).deleted === '',
    'deleting a copied activity in beta: marked deleted in the copy, its REAL photo is NOT trashed, the real activity stays');
  const up2 = B.api('upload', { t: BT, cid: cid(), date: '10/10/2026', mime: 'image/jpeg', b64: JPG });
  const bid2 = B.api('save', { t: BT, cid: cid(), date: '10/10/2026', area: 'U1', cat: 'U1_GEN', status: 'IP', shift: 'D', text: 'Second beta-only activity.', photos: [up2.id] }).id;
  rm = B.api('remove', { t: BT, id: bid2 });
  ok(rm.ok && rm.photos === 1 && env.files[up2.id]._trashed === true, 'deleting a beta-made activity trashes its own beta photo, as usual');
  ok(realFiles() === files0 + 2 && env.files[gtxPhoto]._trashed === false && env.files[livePhoto]._trashed === false, 'file count adds up (2 beta uploads kept + 1 live upload − 1 beta photo trashed): nothing real was trashed');

  // refresh keeps the people and their PINs, drops what was added in beta
  ok(B.sep.props.SHEET_ID !== copy.getId() && / \(lama\)$/.test(copy.getName()) && !/lama/.test(copy2.getName()) && copy2._st.parent === folder._id, 'refreshBetaData: a new copy; the old one is renamed "(lama)", nothing deleted');
  ok(B.api('day', { t: BT, date: '10/10/2026' }).ok && !c2Rows('Entries').some((e) => e.entry_id === bid) && c2Rows('WebUsers').every((u) => /^Y /.test(u.pin_set)), 'sessions and PINs survive the refresh; beta-only activities are gone from the new copy');
  ok(B.api('betaRefresh', { t: BT }).code === 'eng', 'only an engineer can refresh from the app');
  env.clock.add(120000);
  const rf = B.api('betaRefresh', { t: BE });
  ok(rf.ok && /^2026-10-10 /.test(rf.at) && B.api('meta', { t: BE }).env.at === rf.at && B.sep.props.SHEET_ID !== copy2.getId() && B.api('day', { t: BE, date: '10/10/2026' }).entries.length === 2, 'betaRefresh action: new copy, new copy time, data as the real Sheet has it now');
  ok(api('betaRefresh', { t: E }).ok === false && /beta/.test(api('betaRefresh', { t: E }).err), 'the live backend has no refresh');

  // PDF through the bot is refused; the bot is never called
  const calls0 = W.botCalls.length;
  B.sep.props.BOT_WEBAPP_URL = W.BOT_URL;
  B.sep.props.BOT_WEBHOOK_SECRET = env.props.WEBHOOK_SECRET;
  const rp = B.api('report', { t: BE, date: '10/10/2026', days: 1 });
  ok(!rp.ok && rp.code === 'sandbox' && W.botCalls.length === calls0 && B.api('meta', { t: BE }).pdf === false, '"Jana PDF" is refused in beta even if the bot\'s address is added; the bot is not called');

  // contractor PDFs stay in the beta folder
  const pu = B.api('pdfUpload', { t: BT, name: 'beta contractor.pdf', b64: Buffer.from('%PDF-1.4\nbeta\n%%EOF').toString('base64') });
  const pf = Object.values(env.files).find((f) => f._name === 'beta contractor.pdf');
  ok(pu.ok && pf && chain(pf._id) === '2026-10 < Contractor Reports < HLEP DPR Beta (sandbox)', 'a contractor PDF uploaded in beta is kept in the beta folder');

  // chat works on the copy
  W.chatModel = (body) => ({ parts: [{ text: /RECORDS: \d+ activities/.test(sysOf(body)) ? 'Beta menjawab.' : 'tiada pack' }] });
  ok(B.api('chat', { t: BT, messages: [{ role: 'user', text: 'Ujian' }] }).reply === 'Beta menjawab.', 'Tanya DPR answers from the copy');

  // guards
  const id3 = B.sep.props.SHEET_ID;
  const again = B.webExec(() => B.web.setupBeta());
  ok(/already exists, so nothing was copied/.test(again) && B.sep.props.SHEET_ID === id3, 'setupBeta run again does not make another copy');
  ok(/Mode: BETA sandbox/.test(B.webExec(() => B.web.setup())) && B.sep.props.SHEET_ID === id3, 'setup() in the beta project stays on the copy (SHEET_URL is ignored)');
  let threw = '';
  try { W.webExec(() => W.web.setupBeta()); } catch (e) { threw = String(e.message); }
  ok(/^STOP – this Apps Script project is already set up/.test(threw) && W.sep.props.SHEET_ID === 'SHEET123' && W.sep.props.SANDBOX === undefined, 'setupBeta in the LIVE project stops and changes nothing');
  threw = '';
  try { W.webExec(() => W.web.refreshBetaData()); } catch (e) { threw = String(e.message); }
  ok(/only works in the beta/.test(threw), 'refreshBetaData refuses to run in the live project');
  B.sep.props.SHEET_ID = 'SHEET123';
  ok(B.api('day', { t: BE }).code === 'setup' && /Sheet sebenar/.test(B.api('boot').err), 'a sandbox that somehow points at the real Sheet refuses every request');
  threw = '';
  try { B.webExec(() => B.web.setup()); } catch (e) { threw = String(e.message); }
  ok(/points at the real Sheet/.test(threw), 'and setup() says so');
  B.sep.props.SHEET_ID = id3;
  const N = W.newWeb({ GEMINI_API_KEY: 'x' });
  threw = '';
  try { N.webExec(() => N.web.setupBeta()); } catch (e) { threw = String(e.message); }
  ok(/Add the Script property SHEET_URL/.test(threw), 'setupBeta without SHEET_URL explains what to add');
  ok(api('meta', { t: T }).env.sandbox === false && api('day', { t: T, date: '10/10/2026' }).entries.some((e) => e.id === idToday), 'the live backend is still on the real Sheet, with the activity the beta "deleted"');
}

section('Clean run');
ok(!rows('Log').some((l) => l.level === 'ERROR'), 'no ERROR rows in the real Log tab');
ok(env.warnings.length === 0, 'no unprotected values written to Sheets' + (env.warnings.length ? ': ' + env.warnings.slice(0, 3).join(' | ') : ''));
ok(W.failures.length === 0, 'locks released, JSON replies' + (W.failures.length ? ': ' + W.failures.join(' | ') : ''));

console.log('\n' + (fails ? '❌ ' + fails + ' failed, ' + passes + ' passed' : '✅ All ' + passes + ' beta checks passed'));
process.exit(fails ? 1 : 0);
