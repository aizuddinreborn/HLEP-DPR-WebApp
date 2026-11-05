// w1.4 check: date changes with a slow backend (start the preview with DELAY=3000).
// Measures how long until the day's list is on screen, and counts the requests the app makes.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const reqs = [];
  p.on('request', (r) => { if (r.url().endsWith('/api')) { try { reqs.push(JSON.parse(r.postData()).a); } catch (e) { /* */ } } });
  const out = [];
  const shown = async () => !!(await p.$('.act, .empty h3'));
  const timeIt = async (label, fn) => {
    const t0 = Date.now(); const n0 = reqs.length;
    await fn();
    await p.waitForFunction(() => !!document.querySelector('#shell .act, #shell .empty h3'), null, { timeout: 30000 });
    const ms = Date.now() - t0;
    out.push(label + ': list on screen after ' + (ms / 1000).toFixed(1) + ' s');
    return n0;
  };
  await p.goto('http://localhost:8080'); await p.waitForSelector('.person');
  await p.click('.person:has-text("Aizuddin")'); for (const k of '1234') await p.click('.pad button[data-k="' + k + '"]');
  await p.waitForSelector('#shell .act', { timeout: 30000 });
  await p.waitForTimeout(4500);                                  // the pre-load of yesterday finishes
  await timeIt('‹ to yesterday (pre-loaded)', () => p.click('[data-dprev]'));
  out.push('  date pill: ' + (await p.$eval('.datepill .w', (x) => x.textContent)));
  await p.waitForTimeout(4500);
  await timeIt('‹ again (2 days ago, pre-loaded while viewing yesterday)', () => p.click('[data-dprev]'));
  await timeIt('› back to yesterday (in memory)', () => p.click('[data-dnext]'));
  await p.waitForTimeout(500);
  // reopen the app: today comes from the saved copy at once
  await timeIt('reopen the app (saved copy)', () => p.reload());
  out.push('  date pill while refreshing: ' + (await p.$eval('.datepill .w', (x) => x.textContent)));
  await p.waitForFunction(() => !/Mengemas kini|Memuatkan/.test(document.querySelector('.datepill .w').textContent), null, { timeout: 20000 });
  out.push('  date pill after refresh: ' + (await p.$eval('.datepill .w', (x) => x.textContent)));
  // Laporan tab: one report-list request per date change
  await p.click('.tab[data-tab="report"]'); await p.waitForTimeout(4000);
  const n0 = reqs.length;
  await p.click('[data-dprev]'); await p.waitForTimeout(7000);
  const after = reqs.slice(n0);
  out.push('Laporan date change requests: ' + JSON.stringify(after.reduce((o, a) => { o[a] = (o[a] || 0) + 1; return o; }, {})));
  out.push('report list shown: ' + (await p.$eval('#replist', (x) => x.innerText.replace(/\s+/g, ' ').slice(0, 60))));
  console.log(out.join('\n') + '\n' + (errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors'));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
