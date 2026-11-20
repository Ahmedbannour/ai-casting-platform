// Sonde : compte production sur téléphone, menu > Projets (et Publicités). Que voit-on ?
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:4200';
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const mails = [...txt.matchAll(/e-mail\s*:\s*(\S+)/g)].map(m => m[1]), pws = [...txt.matchAll(/mot de passe\s*:\s*(\S+)/g)].map(m => m[1]);
const k = mails.findIndex(m => m.includes(process.env.ROLE || 'demo.production'));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => localStorage.setItem('casting_theme', 'light'));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE + '/auth/login'); await p.fill('#email', mails[k]); await p.fill('#password', pws[k]); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
  await p.goto(BASE + '/chat'); await p.waitForTimeout(1200);
  for (const name of ['Projets', 'Publicités']) {
    await p.locator('.tabbar .tab.menu').click(); await p.waitForTimeout(600);
    await p.locator('app-sidebar').getByRole('link', { name: new RegExp('^' + name) }).first().tap(); await p.waitForTimeout(1800);
    const info = await p.evaluate(() => ({ url: location.pathname, drawerOpen: !!document.querySelector('app-sidebar .open, app-sidebar .sidebar.open, .drawer-open'),
      h1: document.querySelector('.content h1')?.textContent?.trim(), texte: document.querySelector('.content router-outlet + *')?.innerText?.slice(0, 300) }));
    console.log(name, JSON.stringify(info));
    await p.screenshot({ path: path.join(__dirname, '..', 'nav', `sonde-menu-${name === 'Projets' ? 'projets' : 'pubs'}.png`) });
  }
  console.log('erreurs', JSON.stringify(errs));
  await b.close();
})().catch(e => { console.error(e.stack); process.exit(1); });
