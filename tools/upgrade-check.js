// Checks the move from the 1.4 app to 2.0 on a phone, against whatever backend the preview server runs:
//  · an activity waiting in the 1.4 outbox (IndexedDB "hlep-dpr" version 1) survives and is sent;
//  · daily work (Aktiviti, Data, add an activity) works;
//  · with an OLD backend (w1.4.x) the new screens explain themselves instead of failing.
//   MODE=live WEB_CODE=<old dist> node tools/beta-server.js 8090 &   then   OLD=1 node tools/upgrade-check.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL0 = process.env.URL || 'http://localhost:8090/';
const OLD = process.env.OLD === '1';
const OUT = process.argv[2] || path.join(__dirname, '.cache', 'upgrade-shots');
fs.mkdirSync(OUT, { recursive: true });
const problems = [];
let checks = 0;
const ok = (c, m) => { checks++; if (!c) { problems.push(m); console.log('  ❌ ' + m); } else console.log('  ✅ ' + m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Asia/Kuala_Lumpur' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  const shot = (n) => page.screenshot({ path: path.join(OUT, (OLD ? 'old-' : 'new-') + n + '.png') });
  console.log('\n== upgrade check (' + (OLD ? 'OLD backend' : 'new backend') + ') ==');

  // 1) a phone as the 1.4 app left it: one activity waiting in the version-1 database
  await page.goto(URL0 + 'manifest.webmanifest');
  await page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('hlep-dpr', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('outbox', { keyPath: 'cid' }); r.result.createObjectStore('thumbs'); };
    r.onsuccess = () => {
      const now = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10).split('-').reverse().join('/');
      const t = r.result.transaction('outbox', 'readwrite');
      t.objectStore('outbox').put({ cid: 'upgradecheck0001', created: Date.now(), photos: [],
        payload: { date: now, area: 'U1', cat: 'U1_EPS', status: 'IP', shift: 'D', raw: '', text: 'Waiting since the 1.4 app: earthing cable laying is ongoing.' } });
      t.oncomplete = () => { r.result.close(); res(); };
      t.onerror = () => rej(t.error);
    };
    r.onerror = () => rej(r.error);
  }));

  // 2) open the 2.0 app and sign in (the 1.4 login keys are the same, hlep.*)
  await page.goto(URL0);
  await page.waitForSelector('.person');
  await page.click('.person:has-text("Aizuddin")');
  for (const k of '1234') await page.click('.pad button[data-k="' + k + '"]');
  await page.waitForSelector('#shell');
  await page.waitForFunction(() => [...document.querySelectorAll('.act .txt')].some((x) => /Waiting since the 1.4 app/.test(x.textContent)) && !document.querySelector('.act.pending'), null, { timeout: 30000 }).catch(() => {});
  const sent = await page.evaluate(() => [...document.querySelectorAll('.act[data-entry] .txt')].some((x) => /Waiting since the 1.4 app/.test(x.textContent)));
  ok(sent, 'the activity waiting in the 1.4 outbox was kept and sent');
  const ver = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open('hlep-dpr'); r.onsuccess = () => { const v = r.result.version; const s = [...r.result.objectStoreNames]; r.result.close(); res(v + ':' + s.join(',')); }; }));
  ok(/^2:.*inbox/.test(ver) && /outbox/.test(ver), 'phone database upgraded in place (' + ver + ')');
  if (!OLD) { await page.waitForSelector('.tour', { timeout: 8000 }).catch(() => {}); if (await page.locator('[data-skip]').count()) await page.click('[data-skip]'); }
  await page.waitForTimeout(600);
  await shot('01-home');

  // 3) daily work
  await page.click('.segb[data-seg="data"]'); await page.waitForSelector('.pct-row');
  ok(true, 'Data opens');
  await page.click('.segb[data-seg="acts"]');
  await page.click('#fab'); await page.waitForSelector('#addb');
  await page.click('[data-area="U1"]'); await page.click('.chip[data-cat="U1_EPS"]'); await page.click('[data-st="CP"]');
  await page.fill('#raw', 'tarik kabel pembumian siap');
  await page.click('#addgo'); await page.waitForSelector('#pv', { timeout: 15000 });
  await page.click('#addgo');
  await page.waitForFunction(() => [...document.querySelectorAll('.act[data-entry] .txt')].some((x) => /pembumian/i.test(x.textContent)), null, { timeout: 30000 }).catch(() => {});
  ok(await page.evaluate(() => [...document.querySelectorAll('.act[data-entry] .txt')].some((x) => /pembumian/i.test(x.textContent))), 'a new activity is saved and sent');

  // 4) the new screens
  await page.click('.tab[data-tab="board"]'); await page.waitForTimeout(900); await shot('02-papan');
  if (OLD) ok(await page.locator('.chat-off:has-text("belum tersedia")').count() === 1, 'Papan says the backend needs upgrading (no errors)');
  else ok(await page.locator('.kpis').count() === 1, 'Papan works');
  await page.click('.tab[data-tab="chat"]'); await page.waitForTimeout(500); await shot('03-tanya');
  if (OLD) ok(await page.locator('.chat-off:has-text("belum tersedia")').count() === 1, 'Tanya DPR says the backend needs upgrading');
  else ok(await page.locator('.sugg-b').count() > 0, 'Tanya DPR works');
  await page.click('.tab[data-tab="home"]'); await page.waitForTimeout(400);
  await page.click('[data-search]'); await page.waitForTimeout(500);
  if (OLD) ok(await page.locator('#sq').count() === 0 && await page.locator('.toast:has-text("w2.0")').count() === 1, 'search explains instead of failing');
  else { ok(await page.locator('#sq').count() === 1, 'search opens'); await page.click('.sheet-h [data-close]'); await page.waitForTimeout(400); }
  await page.click('[data-dpick]'); await page.waitForTimeout(500);
  ok(await page.locator(OLD ? '#dp' : '.calgrid').count() === 1, OLD ? 'date picker falls back to the plain one' : 'calendar opens');
  await shot('04-date');
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.locator('.act[data-entry] .txt').first().click(); await page.waitForSelector('.d-text'); await page.waitForTimeout(600);
  ok(await page.locator('#dth').count() === (OLD ? 0 : 1), OLD ? 'activity detail opens (history hidden on the old backend)' : 'activity detail with history');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.click('.tab[data-tab="me"]'); await page.waitForTimeout(400); await shot('05-saya');
  ok(await page.locator('.hint:has-text("2.0.0")').count() === 1, 'Saya shows web-app 2.0.0');

  await browser.close();
  console.log('\n' + checks + ' checks, ' + problems.length + ' problems');
  problems.forEach((p) => console.log('  • ' + p));
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
