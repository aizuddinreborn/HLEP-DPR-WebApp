// Walks through the beta in a real browser (phone and laptop, light and dark) and fails on any console error.
//   node tools/beta-server.js 8090 &   then   node tools/beta-walk.js [outDir]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL0 = process.env.URL || 'http://localhost:8090/';
const BETA = process.env.BETA !== '0';           // BETA=0: the live app (no copy-of-data banner)
const OUT = process.argv[2] || path.join(__dirname, '.cache', 'beta-shots');
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
let checks = 0;
const ok = (c, m) => { checks++; if (!c) { errors.push('CHECK: ' + m); console.log('  ❌ ' + m); } else console.log('  ✅ ' + m); };

async function login(page, name) {
  await page.goto(URL0);
  await page.waitForSelector('.person');
  await page.click('.person:has-text("' + name + '")');
  for (const k of '1234') await page.click('.pad button[data-k="' + k + '"]');
  await page.waitForSelector('#shell');
}

async function run(label, opts, theme) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({ colorScheme: theme, locale: 'ms-MY', timezoneId: 'Asia/Kuala_Lumpur' }, opts));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(label + ' console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push(label + ' pageerror: ' + e.message));
  const shot = (n) => page.screenshot({ path: path.join(OUT, label + '-' + n + '.png') });
  console.log('\n== ' + label + ' ==');

  await login(page, 'Aizuddin');
  await page.waitForSelector('.tour', { timeout: 5000 });
  await shot('00-tour');
  for (let i = 0; i < 5; i++) await page.click('[data-next]');
  await page.waitForSelector('.act');
  await page.waitForTimeout(600);
  ok(await page.locator('.ribbon').count() === (BETA ? 1 : 0), BETA ? 'beta banner says the data is a copy' : 'no beta banner in the live app');
  ok(await page.locator('.carry-it').count() >= 1, 'carry-over cards on today');
  ok(await page.locator('.segb').count() === 3, 'Aktiviti / Data / Laporan segments');
  ok((await page.evaluate(() => document.documentElement.dataset.theme)) === theme, 'theme follows the device (' + theme + ')');
  await shot('01-home');

  // data + report segments
  await page.click('.segb[data-seg="data"]'); await page.waitForSelector('.pct-row'); await shot('02-data');
  await page.click('.segb[data-seg="report"]'); await page.waitForSelector('[data-pdf]'); await page.waitForTimeout(500); await shot('03-report');
  await page.click('.segb[data-seg="acts"]');

  // calendar
  await page.click('[data-dpick]'); await page.waitForSelector('.cal-d.has'); await page.waitForTimeout(300); await shot('04-calendar');
  ok(await page.locator('.cal-d.has').count() >= 5, 'calendar marks the days that have records');
  const day = page.locator('.cal-d.has:not(.sel)').last();
  await day.click(); await page.waitForTimeout(700);
  ok(await page.locator('.act').count() >= 1, 'picking a marked day shows its activities');
  await page.click('[data-dpick]'); await page.waitForSelector('.cal-d'); await page.click('.chip[data-d]:has-text("Hari ini")'); await page.waitForTimeout(600);

  // detail
  await page.locator('.act[data-entry] .txt').first().click(); await page.waitForSelector('.d-text'); await page.waitForSelector('.tl', { timeout: 8000 }); await page.waitForTimeout(400); await shot('05-detail');
  ok(await page.locator('.acts-row button').count() === 4, 'detail offers Ubah, Sambung, Kongsi, Tanya');
  await page.click('.sheet-h [data-close]'); await page.waitForTimeout(400);

  // search
  await page.click('[data-search]'); await page.waitForSelector('#sq'); await page.fill('#sq', 'kabel'); await page.waitForSelector('[data-res]'); await page.waitForTimeout(500); await shot('06-search');
  ok(await page.locator('[data-res]').count() >= 4 && await page.locator('mark').count() >= 1, 'Malay "kabel" finds the English cable lines, words marked');
  await page.click('[data-f="status"][data-v="CP"]'); await page.waitForTimeout(900);
  ok(await page.locator('[data-res] .pill.IP').count() === 0, 'status filter keeps CP only');
  await page.click('.sheet-h [data-close]'); await page.waitForTimeout(400);

  // board
  await page.click('.tab[data-tab="board"]'); await page.waitForSelector('.kpis'); await page.waitForTimeout(500); await shot('07-board');
  ok(await page.locator('svg.chart').count() >= 2 && await page.locator('.sysrow').count() >= 1, 'dashboard: charts and systems');
  await page.locator('[data-bar]').nth(9).click({ force: true }); await page.waitForTimeout(300);
  ok(await page.locator('.tip [data-open]').count() === 1, 'tapping a bar shows that day');
  await page.locator('.sysrow').first().click(); await page.waitForSelector('#sysb'); await page.waitForTimeout(300); await shot('08-system');
  await page.click('.sheet-h [data-close]'); await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(200); await shot('09-board-bottom');
  await page.evaluate(() => window.scrollTo(0, 0));

  // chat
  await page.click('.tab[data-tab="chat"]'); await page.waitForSelector('.sugg-b'); await shot('10-chat-empty');
  await page.click('.sugg-b:has-text("bahan")'); await page.waitForSelector('.typing'); await shot('11-chat-thinking');
  await page.waitForSelector('.ref-card', { timeout: 20000 }); await page.waitForTimeout(1800); await shot('12-chat-answer');
  ok(await page.locator('.msg.ai .cite').count() >= 1 && await page.locator('.looked').count() === 1, 'answer cites its records and shows what was looked up');
  await page.fill('#cq', 'Kerja apa yang masih belum siap?'); await page.click('[data-send]');
  await page.waitForFunction(() => document.querySelectorAll('.msg.ai [data-bub]').length === 2, null, { timeout: 20000 }); await page.waitForTimeout(1800); await shot('13-chat-second');
  await page.locator('.ref-card').last().click(); await page.waitForSelector('.d-text'); await page.waitForTimeout(300);
  ok(true, 'a source card opens the original activity');
  await page.click('.sheet-h [data-close]'); await page.waitForTimeout(400);

  // add sheet: carry-over prefill
  await page.click('.tab[data-tab="home"]'); await page.waitForSelector('.carry-it');
  await page.locator('[data-carry][data-as="IP"]').first().click(); await page.waitForSelector('#pv'); await page.waitForTimeout(300); await shot('14-add-sambung');
  ok((await page.locator('#pv').innerText()).length > 10 && await page.locator('[data-st="IP"][aria-pressed="true"]').count() === 1, '"Sambung" opens the add sheet filled in');
  await page.click('.sheet-h [data-close]'); await page.waitForTimeout(400);

  // me: theme switch
  await page.click('.tab[data-tab="me"]'); await page.waitForSelector('[data-themeset]');
  const other = theme === 'dark' ? 'light' : 'dark';
  await page.click('[data-themeset="' + other + '"]'); await page.waitForTimeout(300);
  ok((await page.evaluate(() => document.documentElement.dataset.theme)) === other, 'theme switch → ' + other);
  await page.click('[data-themeset="auto"]'); await page.waitForTimeout(200);
  await page.click('[data-prefl]'); await page.waitForSelector('[data-pk]'); await shot('15-me');
  await browser.close();
}

(async () => {
  const only = process.env.ONLY || '';
  const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  if (!only || only === 'phone-light') await run('phone-light', phone, 'light');
  if (!only || only === 'phone-dark') await run('phone-dark', phone, 'dark');
  if (!only || only === 'laptop-light') await run('laptop-light', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, 'light');
  console.log('\n' + checks + ' checks, ' + errors.length + ' problems');
  errors.forEach((e) => console.log('  • ' + e));
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
