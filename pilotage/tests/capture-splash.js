// Captures du splash « Cercle » à plusieurs instants, téléphone et ordinateur, puis planche.
const { chromium } = require('playwright-core');
const path = require('path'), OUT = path.join(__dirname, '..', 'nav');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const errs = [];
  for (const [nom, vp, mob] of [['tel', { width: 412, height: 860 }, true], ['pc', { width: 1280, height: 760 }, false]]) {
    const ctx = await b.newContext({ viewport: vp, isMobile: mob, hasTouch: mob, deviceScaleFactor: mob ? 2 : 1 });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:4200/', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.splash');
    const t0 = Date.now();
    for (const t of [350, 900, 1350, 1900, 2600, 3150]) {
      await p.waitForTimeout(Math.max(0, t - (Date.now() - t0)));
      await p.screenshot({ path: path.join(OUT, `splash-${nom}-${t}.png`) });
    }
    await ctx.close();
  }
  await b.close();
  console.log('erreurs', JSON.stringify(errs));
})().catch(e => { console.error(e.stack); process.exit(1); });
