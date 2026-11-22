// Menu latéral replié, compte de la boîte de production de démo : 2 hauteurs d'écran ; vérifie que rien ne se chevauche.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const bloc = txt.split('Boîte de production')[1];
const email = bloc.match(/e-mail : (\S+)/)[1], pw = bloc.match(/mot de passe : (\S+)/)[1];
const BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  for (const h of [880, 680]) {
    const p = await (await b.newContext({ viewport: { width: 1440, height: h }, colorScheme: 'dark' })).newPage();
    await p.goto(BASE + '/auth/login'); await p.fill('#email', email); await p.fill('#password', pw); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth')); await p.goto(BASE + '/accueil'); await p.waitForTimeout(1500);
    if (!(await p.locator('aside.sidebar.collapsed').count())) await p.locator('button.collapse').click();
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => {
      const box = s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width, h: r.height }; };
      const ns = box('.new-search'), top = box('.sidebar .top'), bottom = box('.sidebar .bottom'), last = [...document.querySelectorAll('.nav-link')].pop().getBoundingClientRect();
      const counts = [...document.querySelectorAll('.collapsed .count')].map(c => { const a = c.getBoundingClientRect(), i = c.parentElement.querySelector('.ico').getBoundingClientRect();
        return { txt: c.textContent.trim(), recouvre: Math.max(0, Math.min(a.right, i.right) - Math.max(a.left, i.left)) * Math.max(0, Math.min(a.bottom, i.bottom) - Math.max(a.top, i.top)) }; });
      return { plusRond: Math.abs(ns.w - ns.h) < 1, plusSousLeHaut: ns.t >= top.b - 0.5, basVisible: bottom.b <= innerHeight + 0.5, navAuDessusDuBas: last.bottom <= bottom.t + 0.5, counts };
    });
    console.log(h, JSON.stringify(r));
    await p.screenshot({ path: path.join(OUT, `menu-replie-${h}.jpg`), type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 420, height: h } });
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
