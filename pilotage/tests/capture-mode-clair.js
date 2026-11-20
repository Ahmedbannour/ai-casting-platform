// Captures du mode clair sur téléphone (connexion, accueil, acteurs, projets, menu, demandes) pour la revue UI.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, colorScheme: 'light' });
  await ctx.addInitScript(() => localStorage.setItem('casting_theme', 'light'));
  const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/auth/login'); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(OUT, 'clair-connexion.jpg'), type: 'jpeg', quality: 70 });
  await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
  for (const [n, u] of [['accueil', '/accueil'], ['acteurs', '/dashboard'], ['projets', '/projects'], ['publicites', '/mes-demandes'], ['propositions', '/chat']]) {
    await p.goto(BASE + u); await p.waitForTimeout(1800);
    await p.screenshot({ path: path.join(OUT, `clair-${n}.jpg`), type: 'jpeg', quality: 70 });
  }
  await p.locator('.tabbar').getByText('Menu').click(); await p.waitForTimeout(600);
  await p.screenshot({ path: path.join(OUT, 'clair-menu.jpg'), type: 'jpeg', quality: 70 });
  console.log(JSON.stringify({ theme: await p.evaluate(() => document.documentElement.className), errs }));
  await b.close();
})().catch(e => { console.error(e.stack); process.exit(1); });
