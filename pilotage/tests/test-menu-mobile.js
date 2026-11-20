// Téléphone : à l'ouverture du menu, « Mode sombre » (bascule mode clair) et « Déconnexion » sont visibles sans défiler.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  const res = {};
  for (const [nom, vp] of [['petit', { width: 360, height: 640 }], ['moyen', { width: 412, height: 780 }]]) {
    const p = await (await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6, colorScheme: 'dark' })).newPage(); p.setDefaultTimeout(10000);
    await p.goto(BASE + '/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
    await p.goto(BASE + '/dashboard'); await p.waitForTimeout(1500);
    await p.locator('.tabbar').getByText('Menu').click(); await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, `menu-mobile-${nom}.jpg`), type: 'jpeg', quality: 70 });
    const r = await p.evaluate(() => {
      const s = document.querySelector('.sidebar');
      const lo = document.querySelector('.sidebar .logout').getBoundingClientRect();
      const th = document.querySelector('.sidebar .theme-switch').getBoundingClientRect();
      return { hauteurMenu: Math.round(s.getBoundingClientRect().height), ecran: innerHeight, basDeconnexion: Math.round(lo.bottom), basModeClair: Math.round(th.bottom), largeur: Math.round(s.getBoundingClientRect().width) };
    });
    r.deconnexionVisibleSansDefiler = r.basDeconnexion <= r.ecran;
    r.modeClairVisibleSansDefiler = r.basModeClair <= r.ecran;
    res[nom] = r;
    await p.screenshot({ path: path.join(OUT, `menu-mobile-${nom}-bas.jpg`), type: 'jpeg', quality: 70 });
  }
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
