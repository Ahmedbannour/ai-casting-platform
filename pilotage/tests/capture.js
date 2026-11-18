// Salle de pilotage · panneau Navigateur : capture le site (ordinateur + mobile) après un changement.
// node capture.js <id> "<titre>" <chemin> [tache] [@actions.json]   (actions : [{"fill":"sel","v":"x"},{"click":"sel"},{"wait":800}])
// Écrit pilotage/nav/<id>-bureau.jpg, <id>-mobile.jpg et met à jour pilotage/nav/index.json (12 dernières captures).
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const ROOT = 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage';
const QA = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', '.recette-admin.json'), 'utf8'));
const BASE = 'http://localhost:4200';
const [id, titre, chemin = '/', tache = '', actions = '[]'] = process.argv.slice(2);
const SITE = (() => { try { return fs.readFileSync(path.join(process.env.TEMP, 'tunnel-url.txt'), 'utf8').trim(); } catch { return BASE; } })();
(async () => {
  const dir = path.join(ROOT, 'nav'); fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const out = {};
  for (const [dev, opt] of [['bureau', { viewport: { width: 1366, height: 820 } }], ['mobile', { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const ctx = await browser.newContext(opt); const page = await ctx.newPage();
    if (chemin !== '/' && !chemin.startsWith('/legal')) {
      await page.goto(BASE + '/auth/login'); await page.waitForTimeout(1200);
      await page.fill('#email', QA.email); await page.fill('#password', QA.password);
      await page.click('button.submit-btn'); await page.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
    }
    await page.goto(BASE + chemin); await page.waitForTimeout(2200);
    const steps = JSON.parse(actions.startsWith('@') ? fs.readFileSync(actions.slice(1), 'utf8') : actions);
    for (const a of steps) {
      try {
        if (a.fill) await page.fill(a.fill, a.v); if (a.click) await page.click(a.click); if (a.press) await page.keyboard.press(a.press);
        await page.waitForTimeout(a.wait || 900);
      } catch (e) { if (!a.optional) console.error('action', JSON.stringify(a), e.message.split('\n')[0]); }
    }
    const f = `${id}-${dev}.jpg`;
    await page.screenshot({ path: path.join(dir, f), type: 'jpeg', quality: 72 });
    out[dev] = 'nav/' + f; await ctx.close();
  }
  await browser.close();
  const ip = path.join(dir, 'index.json');
  let idx = { shots: [] }; try { idx = JSON.parse(fs.readFileSync(ip, 'utf8')); } catch {}
  idx.site = SITE;
  idx.shots = [{ id, titre, tache, url: SITE + chemin, t: new Date().toISOString(), ...out }, ...idx.shots.filter(s => s.id !== id)].slice(0, 12);
  fs.writeFileSync(ip, JSON.stringify(idx));
  console.log(JSON.stringify({ ok: true, ...out }));
})().catch(e => { console.error(e); process.exit(1); });
