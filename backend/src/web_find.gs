// ============================== SEARCH · DASHBOARD · CALENDAR · CARRY-OVER (w2.0) ==============================
//
//  All read-only (listed in WEB_READS): each tab is read once per request.

// ---------- shared helpers ----------

/** Every activity that counts (not deleted, not hidden by a merge), any date. */
function webActs_() {
  return rows_('Entries').filter(function (e) { return e.activity_text && e.deleted !== 'Y' && e.deleted !== 'M'; });
}

function webCatLabel_(key, fallback) {
  const c = cat_(key);
  return c ? shortCat_(c) : String(fallback || key || '');
}

function webDayDiff_(a, b) {
  return Math.round((ymdParts_(b).getTime() - ymdParts_(a).getTime()) / 86400000);
}

/** A date typed as dd/mm/yyyy or yyyy-mm-dd, or '' when empty; future dates are allowed (plans). */
function webYmd_(s) {
  if (s === undefined || s === null || String(s).trim() === '') return '';
  const ymd = parseDateArg_(String(s));
  if (!ymd) throw webErr_('Tarikh tidak sah. Guna dd/mm/yyyy.');
  return ymd;
}

function webSrcKind_(e) {
  return e.source === 'web' ? 'web' : e.source === 'contractor' ? 'contractor' : e.source === 'merged' ? 'merged' : 'telegram';
}

// ---------- words: site Malay → the English used in report lines ----------

// The team types notes in Malay or English; report lines are English. A search word also matches these stems.
const WEB_GLOSSARY = {
  kabel: ['cable'], bateri: ['batter'], pasang: ['install'], pemasangan: ['install'], tarik: ['pull'], tarikan: ['pull'],
  uji: ['test'], ujian: ['test'], siap: ['complet'], selesai: ['complet'], lampu: ['light', 'lamp'], pencahayaan: ['lighting'],
  pam: ['pump'], bilik: ['room'], suis: ['switch'], pengubah: ['transformer'], alatubah: ['transformer'], penjana: ['generator'],
  janakuasa: ['generator'], kren: ['crane'], bumi: ['earth'], pembumian: ['earthing'], rak: ['rack'], buka: ['dismantl', 'remov', 'open'],
  tanggal: ['remov', 'dismantl'], cabut: ['remov', 'dismantl'], cuci: ['clean'], periksa: ['inspect'], pemeriksaan: ['inspect'],
  sambung: ['terminat', 'connect'], sambungan: ['terminat', 'connect'], penamatan: ['terminat'], bahan: ['material'],
  tiba: ['arriv', 'deliver'], sampai: ['arriv', 'deliver'], hantar: ['deliver'], api: ['fire'], kebakaran: ['fire'],
  penyaman: ['air-condition', 'air condition', 'aircond'], udara: ['air'], minyak: ['oil'], galas: ['bearing'], dulang: ['tray'],
  tangga: ['ladder'], paip: ['pipe', 'conduit'], wayar: ['wir', 'cable'], pendawaian: ['wiring'], angkat: ['lift', 'hoist'],
  potong: ['cut'], kimpal: ['weld'], cat: ['paint'], ukur: ['measur'], tukar: ['replac', 'chang'], ganti: ['replac'],
  baiki: ['repair', 'rectif'], rosak: ['damag', 'fault', 'defect'], bocor: ['leak'], tangki: ['tank'], injap: ['valve'],
  kawalan: ['control'], papan: ['board', 'panel'], pengecas: ['charger'], pentauliahan: ['commission'], penebat: ['insulat'],
  penebatan: ['insulation'], voltan: ['voltage'], arus: ['current'], geganti: ['relay'], pemutus: ['breaker'], litar: ['circuit'],
  bumbung: ['roof'], lantai: ['floor'], dinding: ['wall'], pintu: ['door'], kontraktor: ['contractor'], malam: ['night'],
  pembersihan: ['clean', 'housekeep'], penggantian: ['replac'], pembaikan: ['repair', 'rectif'], tandaan: ['label', 'tag'],
  label: ['label', 'tag'], gegelung: ['coil', 'winding'], belitan: ['winding'], pemegun: ['stator'], pemutar: ['rotor']
};
const WEB_STOP = { yang: 1, dan: 1, di: 1, ke: 1, dari: 1, untuk: 1, pada: 1, the: 1, of: 1, a: 1, an: 1, for: 1, at: 1, in: 1, on: 1, to: 1,
  is: 1, was: 1, were: 1, are: 1, and: 1, or: 1, itu: 1, ini: 1, sudah: 1, telah: 1, kerja: 1, work: 1, works: 1 };

/** A query → [[word, alt, alt…], …]: every group must be found; any alternative in a group counts. */
function webTokens_(q) {
  const out = [];
  String(q || '').toLowerCase().replace(/[^a-z0-9&\/\-\.\s]+/g, ' ').split(/\s+/).forEach(function (w) {
    w = w.replace(/^[\-\.\/]+|[\-\.\/]+$/g, '');
    if (!w || (WEB_STOP[w] && w.length < 6)) return;
    if (w.length < 2 && !/\d/.test(w)) return;
    const alts = [w];
    (WEB_GLOSSARY[w] || []).forEach(function (x) { if (alts.indexOf(x) < 0) alts.push(x); });
    if (w.length > 4 && /s$/.test(w)) alts.push(w.slice(0, -1));              // cables → cable
    out.push(alts);
  });
  return out.slice(0, 8);
}

function webHay_(e) {
  return (String(e.activity_text) + ' ' + String(e.raw_text || '') + ' ' + webCatLabel_(e.category_key, e.category) + ' ' +
    String(e.reporter || '') + ' ' + String(e.source_ref || '')).toLowerCase();
}

/** How many word groups a text contains (0…tokens.length). */
function webHits_(hay, tokens) {
  let n = 0;
  tokens.forEach(function (alts) { if (alts.some(function (a) { return hay.indexOf(a) >= 0; })) n++; });
  return n;
}

/**
 * Activities matching words and filters, newest first. f = { q, unit, cat, status, shift, from, to, who, src, photos, order }.
 * All words must be found; when none match and there are several words, the best partial matches come back with loose = true.
 */
function webFind_(f) {
  f = f || {};
  const tokens = webTokens_(f.q);
  const sys = String(f.cat || '').trim();
  const sysLow = sys.toLowerCase();
  const who = String(f.who || '').trim().toLowerCase();
  let list = webActs_().filter(function (e) {
    if (f.unit && e.area !== f.unit) return false;
    if (sys && e.category_key !== sys && webCatLabel_(e.category_key, e.category).toLowerCase().indexOf(sysLow) < 0) return false;
    if (f.status && e.status !== f.status) return false;
    if (f.shift && (e.shift === 'N' ? 'N' : 'D') !== f.shift) return false;
    if (f.from && e.work_date < f.from) return false;
    if (f.to && e.work_date > f.to) return false;
    if (who && String(e.user_id) !== String(f.who) && String(e.reporter || '').toLowerCase().indexOf(who) < 0) return false;
    if (f.src && webSrcKind_(e) !== f.src) return false;
    if (f.photos && !photoCount_(e)) return false;
    return true;
  });
  let loose = false;
  if (tokens.length) {
    const scored = list.map(function (e) { return { e: e, n: webHits_(webHay_(e), tokens) }; });
    const all = scored.filter(function (x) { return x.n === tokens.length; });
    if (all.length || tokens.length === 1) list = all.map(function (x) { return x.e; });
    else {
      const best = scored.reduce(function (m, x) { return x.n > m ? x.n : m; }, 0);
      list = best ? scored.filter(function (x) { return x.n === best; }).map(function (x) { return x.e; }) : [];
      loose = list.length > 0;
    }
  }
  const dir = f.order === 'oldest' ? 1 : -1;
  list.sort(function (a, b) {
    if (a.work_date !== b.work_date) return a.work_date < b.work_date ? -dir : dir;
    return String(a.received_at) < String(b.received_at) ? -dir : dir;
  });
  return { list: list, loose: loose, tokens: tokens };
}

function webMatOut_(m) {
  return { row: m._row, area: m.area, cat: m.category_key, label: webCatLabel_(m.category_key), item: m.item, date: m.arrived_date, by: m.added_by };
}

/** Material arrivals matching words and filters, newest first. */
function webFindMats_(f) {
  f = f || {};
  const tokens = webTokens_(f.q);
  const sys = String(f.cat || '').trim();
  const sysLow = sys.toLowerCase();
  return rows_('Materials').filter(function (m) {
    if (m.deleted === 'Y' || !m.arrived_date) return false;
    if (f.unit && m.area !== f.unit) return false;
    if (sys && m.category_key !== sys && webCatLabel_(m.category_key).toLowerCase().indexOf(sysLow) < 0) return false;
    if (f.from && m.arrived_date < f.from) return false;
    if (f.to && m.arrived_date > f.to) return false;
    if (!tokens.length) return true;
    const hay = (String(m.item) + ' ' + webCatLabel_(m.category_key)).toLowerCase();
    return webHits_(hay, tokens) === tokens.length;
  }).sort(function (a, b) { return a.arrived_date < b.arrived_date ? 1 : a.arrived_date > b.arrived_date ? -1 : 0; });
}

// ---------- search ----------

function apiSearch_(u, b) {
  const f = {
    q: String(b.q || '').slice(0, 200),
    unit: b.unit === 'U1' || b.unit === 'U4' ? b.unit : '',
    cat: String(b.cat || '').slice(0, 60),
    status: /^(NS|IP|CP)$/.test(String(b.status || '')) ? String(b.status) : '',
    shift: b.shift === 'D' || b.shift === 'N' ? b.shift : '',
    from: webYmd_(b.from), to: webYmd_(b.to),
    who: String(b.who || '').slice(0, 60),
    src: /^(web|telegram|contractor|merged)$/.test(String(b.src || '')) ? String(b.src) : '',
    photos: !!b.photos
  };
  const limit = Math.min(Math.max(Number(b.limit) || 30, 1), 60);
  const offset = Math.max(Number(b.offset) || 0, 0);
  const r = webFind_(f);
  const out = {
    total: r.list.length, offset: offset, loose: r.loose,
    items: r.list.slice(offset, offset + limit).map(function (e) { return webEntryOut_(e, u); }),
    more: r.list.length > offset + limit,
    // every spelling that counted as a match ("kabel" also matched "cable"), for marking the words in the results
    words: r.tokens.reduce(function (all, t) { t.forEach(function (w) { if (all.indexOf(w) < 0) all.push(w); }); return all; }, [])
  };
  if (!offset) {
    const mats = (f.q || f.cat) && !f.status && !f.shift && !f.who && !f.src && !f.photos ? webFindMats_(f) : [];
    out.materials = mats.slice(0, 20).map(webMatOut_);
    out.materialsTotal = mats.length;
  }
  return out;
}

// ---------- calendar dots ----------

function apiCal_(b) {
  const m = String(b.month || '').match(/^(\d{4})-(\d{2})$/);
  const month = m ? m[0] : today_().slice(0, 7);
  const days = {};
  webActs_().forEach(function (e) {
    if (String(e.work_date).slice(0, 7) !== month) return;
    const o = days[e.work_date] || (days[e.work_date] = { n: 0, cp: 0 });
    o.n++;
    if (e.status === 'CP') o.cp++;
  });
  return { month: month, days: days, today: today_() };
}

// ---------- "Sambung": work still in progress on each system's last working day ----------

/** d = loadData_(). At most 12 lines, newest systems first; a line already reported on `date` is left out. */
function webCarry_(d, date) {
  const norm = function (t) { return String(t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  const have = {};
  d.entries.forEach(function (e) { if (e.work_date === date && e.activity_text) have[e.category_key + '|' + norm(e.activity_text)] = 1; });
  const out = [];
  d.cats.forEach(function (c) {
    const prev = lastDateBefore_(d, c.key, date);
    if (!prev || prev < addDays_(date, -7)) return;                      // quiet for over a week: not "still going"
    entriesFor_(d, c.key, prev).filter(function (e) { return e.status === 'IP'; }).slice(0, 4).forEach(function (e) {
      if (!have[c.key + '|' + norm(e.activity_text)]) out.push(e);
    });
  });
  out.sort(function (a, b) { return a.work_date < b.work_date ? 1 : a.work_date > b.work_date ? -1 : 0; });
  return out.slice(0, 12).map(function (e) {
    return { id: e.entry_id, date: e.work_date, area: e.area, cat: e.category_key, catLabel: webCatLabel_(e.category_key, e.category),
      status: e.status, shift: e.shift === 'N' ? 'N' : 'D', text: e.activity_text, raw: e.raw_text || '', who: e.reporter, photos: photoCount_(e) };
  });
}

// ---------- dashboard ----------

/** Progress rows of one system, one point per date (the last one typed that day wins), oldest first. */
function webPctHist_(d, key) {
  const byDate = {};
  d.progress.forEach(function (p) {
    if (p.category_key !== key || !p.date) return;
    const cur = byDate[p.date];
    if (!cur || String(p.updated_at) >= String(cur.at)) byDate[p.date] = { date: p.date, pct: Number(p.percent), by: String(p.updated_by || ''), at: String(p.updated_at || '') };
  });
  return Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
}

/** Total manpower typed for exactly this date (null when nobody updated it that day). */
function webManpowerOn_(d, date) {
  const map = {};
  let any = false;
  d.manpower.forEach(function (r) { if (r.date === date) { map[r.company] = Number(r.count) || 0; any = true; } });
  if (!any) return null;
  return Object.keys(map).reduce(function (n, k) { return n + map[k]; }, 0);
}

function apiInsights_(u, b) {
  const to = webDate_(b.date);
  const days = [7, 14, 30].indexOf(Number(b.days)) >= 0 ? Number(b.days) : 14;
  const from = addDays_(to, -(days - 1));
  const pTo = addDays_(from, -1);
  const pFrom = addDays_(pTo, -(days - 1));
  const d = loadData_();
  const acts = d.entries.filter(function (e) { return e.activity_text; });
  const tally = function (list) {
    const o = { acts: list.length, cp: 0, ip: 0, ns: 0, photos: 0, people: 0, workDays: 0 };
    const ppl = {}, dd = {};
    list.forEach(function (e) {
      if (e.status === 'CP') o.cp++; else if (e.status === 'IP') o.ip++; else o.ns++;
      o.photos += photoCount_(e);
      ppl[String(e.user_id || e.reporter)] = 1;
      dd[e.work_date] = 1;
    });
    o.people = Object.keys(ppl).length;
    o.workDays = Object.keys(dd).length;
    return o;
  };
  const inR = acts.filter(function (e) { return e.work_date >= from && e.work_date <= to; });
  const inP = acts.filter(function (e) { return e.work_date >= pFrom && e.work_date <= pTo; });

  const perDay = [];
  for (let i = 0; i < days; i++) {
    const day = addDays_(from, i);
    const t = tally(inR.filter(function (e) { return e.work_date === day; }));
    perDay.push({ date: day, n: t.acts, cp: t.cp, ip: t.ip, ns: t.ns, photos: t.photos, mp: webManpowerOn_(d, day), weather: weatherFor_(d, day) });
  }

  const systems = d.cats.map(function (c) {
    const hasPct = !!(c.pct_style && c.pct_style !== 'none');
    const hist = hasPct ? webPctHist_(d, c.key).filter(function (h) { return h.date <= to; }) : [];
    const lastH = hist.length ? hist[hist.length - 1] : null;
    let last = '';
    acts.forEach(function (e) { if (e.category_key === c.key && e.work_date <= to && e.work_date > last) last = e.work_date; });
    const lastLines = last ? entriesFor_(d, c.key, last) : [];
    return {
      key: c.key, label: shortCat_(c), area: c.area, hasPct: hasPct,
      pct: hasPct ? pctFor_(d, c.key, to) : null, pctPrev: hasPct ? pctFor_(d, c.key, pTo) : null,
      pctDate: lastH ? lastH.date : '', pctBy: lastH ? lastH.by : '', linked: hasPct && webLinked_(d, c.key),
      hist: hist.slice(-24).map(function (h) { return { date: h.date, pct: h.pct }; }),
      last: last, since: last ? webDayDiff_(last, to) : null,
      n: inR.filter(function (e) { return e.category_key === c.key; }).length,
      ip: lastLines.filter(function (e) { return e.status === 'IP'; }).length,
      cp: lastLines.filter(function (e) { return e.status === 'CP'; }).length
    };
  });

  const team = webUsers_().filter(function (x) { return x.active; }).map(function (x) {
    const mine = acts.filter(function (e) { return String(e.user_id) === String(x.user_id); });
    let last = '';
    mine.forEach(function (e) { if (String(e.received_at) > last) last = String(e.received_at); });
    return { id: x.user_id, name: x.name, role: x.role,
      today: mine.filter(function (e) { return e.work_date === to; }).length,
      range: mine.filter(function (e) { return e.work_date >= from && e.work_date <= to; }).length, last: last };
  }).sort(function (a, c) { return c.today - a.today || c.range - a.range || (a.name < c.name ? -1 : 1); });

  // what needs a look, most useful first; the app decides what to show when
  const attention = [];
  let pend = 0;
  try { pend = webImportsList_(u).pending.length; } catch (err) { pend = 0; }
  if (pend) attention.push({ kind: 'imports', n: pend });
  systems.forEach(function (s) {
    if (s.since !== null && s.since >= 3 && s.ip > 0) attention.push({ kind: 'quiet', key: s.key, label: s.label, area: s.area, days: s.since, date: s.last, n: s.ip });
  });
  systems.forEach(function (s) {
    if (!s.hasPct || s.linked) return;
    if (s.pct === null) { if (s.n) attention.push({ kind: 'nopct', key: s.key, label: s.label, area: s.area }); return; }
    const age = s.pctDate ? webDayDiff_(s.pctDate, to) : 0;
    if (age >= 7 && s.n) attention.push({ kind: 'pct', key: s.key, label: s.label, area: s.area, days: age, date: s.pctDate, pct: s.pct });
  });
  if (!weatherFor_(d, to)) attention.push({ kind: 'weather', date: to });
  const mp = manpowerFor_(d, to);
  if (mp.date !== to) attention.push({ kind: 'manpower', date: to, last: mp.date });
  const tomorrow = addDays_(to, 1);
  if (!d.plans.some(function (p) { return p.plan_date === tomorrow; })) attention.push({ kind: 'plan', date: tomorrow });

  const mats = d.materials.filter(function (m) { return m.arrived_date; });
  let first = '';
  acts.forEach(function (e) { if (!first || e.work_date < first) first = e.work_date; });
  return {
    range: { from: from, to: to, days: days }, today: today_(), first: first,
    kpi: tally(inR), prev: tally(inP), total: acts.length,
    perDay: perDay, systems: systems, team: team, attention: attention,
    materials: mats.filter(function (m) { return m.arrived_date >= from && m.arrived_date <= to; })
      .sort(function (a, c) { return a.arrived_date < c.arrived_date ? 1 : -1; }).slice(0, 12).map(webMatOut_),
    materialsTotal: mats.length,
    manpower: { date: mp.date, list: mp.list, total: mp.list.reduce(function (n, x) { return n + (Number(x.count) || 0); }, 0) }
  };
}
