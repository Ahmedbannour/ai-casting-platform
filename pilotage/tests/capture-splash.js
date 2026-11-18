// Enregistre l'écran d'accueil image par image (ordinateur et mobile) : pilotage/nav/splash-<appareil>/NNN.png
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const OUT = path.join('C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage', 'nav');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const res = {};
  for (const [dev, opt] of [['bureau', { viewport: { width: 1280, height: 720 } }], ['mobile', { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const dir = path.join(OUT, 'splash-' + dev); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const ctx = await b.newContext(opt); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:4200/', { waitUntil: 'commit' });
    await p.waitForSelector('app-splash .splash', { timeout: 15000 });
    const t0 = Date.now(); let n = 0;
    while (Date.now() - t0 < 4200) { await p.screenshot({ path: path.join(dir, String(n++).padStart(3, '0') + '.png'), type: 'png' }); }
    const gone = await p.evaluate(() => !document.querySelector('app-splash'));
    const vitrine = await p.locator('.hero h1').isVisible().catch(() => false);
    // 2e visite : l'écran d'accueil rejoue (demande du client)
    await p.goto('http://localhost:4200/'); await p.waitForTimeout(800);
    const again = await p.locator('app-splash').count();
    res[dev] = { images: n, splashRetire: gone, vitrineVisible: vitrine, secondeVisite: again === 1 ? 'splash rejoué' : 'pas de splash', erreurs: errs };
    await ctx.close();
  }
  // Passer d'un clic
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const p = await ctx.newPage();
  await p.goto('http://localhost:4200/'); await p.waitForSelector('app-splash .skip'); await p.waitForTimeout(400);
  const t = Date.now(); await p.click('app-splash .skip'); await p.waitForSelector('app-splash', { state: 'detached', timeout: 5000 });
  res.passer_ms = Date.now() - t;
  const rctx = await b.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' }); const rp = await rctx.newPage();
  await rp.goto('http://localhost:4200/'); await rp.waitForTimeout(600); res.mouvementReduit = (await rp.locator('app-splash').count()) === 0 ? 'pas de splash' : 'splash affiché';
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
