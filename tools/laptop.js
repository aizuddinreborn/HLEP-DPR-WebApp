const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1366, height: 860 } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8080'); await p.waitForSelector('.person');
  await p.screenshot({ path: 'tools/.cache/lap-1.png' });
  await p.click('.person:has-text("Aizuddin")'); for (const k of '1234') await p.click('.pad button[data-k="' + k + '"]');
  await p.waitForSelector('.act'); await p.waitForTimeout(900);
  await p.screenshot({ path: 'tools/.cache/lap-2.png' });
  await p.click('#fab'); await p.click('.sheet [data-area="U4"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: 'tools/.cache/lap-3.png' });
  await p.keyboard.press('Escape'); await p.click('.tab[data-tab="data"]'); await p.waitForTimeout(600);
  await p.screenshot({ path: 'tools/.cache/lap-4.png' });
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await m.goto('http://localhost:8080'); await m.waitForSelector('.person'); await m.click('.person:has-text("Nisa")'); await m.waitForTimeout(400);
  await m.screenshot({ path: 'tools/.cache/m-pin.png' });
  console.log(errs.join('\n') || 'ok'); await b.close();
})();
