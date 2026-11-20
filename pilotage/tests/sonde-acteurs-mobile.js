// Sonde : page Acteurs sur téléphone, éléments sous la barre d'onglets après défilement complet.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await (await b.newContext({ viewport: { width: 412, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6, colorScheme: 'dark' })).newPage();
  await p.goto(BASE + '/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
  await p.goto(BASE + '/dashboard'); await p.waitForTimeout(2500);
  const r = await p.evaluate(() => {
    const c = document.querySelector('.content'); c.scrollTop = c.scrollHeight;
    const bar = document.querySelector('.tabbar').getBoundingClientRect().top;
    return { scroll: [c.scrollTop, c.scrollHeight, c.clientHeight], dessous: [...c.querySelectorAll('*')].filter(e => e.offsetParent && e.children.length === 0 && e.getBoundingClientRect().bottom > bar && e.getBoundingClientRect().top < innerHeight)
      .slice(0, 8).map(e => e.tagName + '.' + e.className + ' «' + (e.innerText || '').trim().slice(0, 20) + '» ' + Math.round(e.getBoundingClientRect().top) + '-' + Math.round(e.getBoundingClientRect().bottom)) };
  });
  await p.screenshot({ path: path.join(OUT, 'bas-de-page-acteurs.jpg'), type: 'jpeg', quality: 70 });
  await b.close(); console.log(JSON.stringify(r, null, 1));
})();
