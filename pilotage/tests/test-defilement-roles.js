// Téléphone, chaque compte démo : sur chaque onglet de la barre du bas, la page défile jusqu'en bas
// (rien ne déborde hors de la zone de défilement) et le dernier élément passe au-dessus de la barre.
// Les mots de passe sont lus dans .comptes-demo.txt et ne sont jamais affichés.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:4200';
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const mails = [...txt.matchAll(/e-mail\s*:\s*(\S+)/g)].map(m => m[1]), pws = [...txt.matchAll(/mot de passe\s*:\s*(\S+)/g)].map(m => m[1]);
const only = process.env.ROLE;
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  let fails = 0;
  for (let k = 0; k < mails.length; k++) {
    if (only && !mails[k].includes(only)) continue;
    const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage(); p.setDefaultTimeout(10000);
    await p.goto(BASE + '/auth/login'); await p.fill('#email', mails[k]); await p.fill('#password', pws[k]); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
    if (p.url().includes('/consentement')) { console.log(`--  ${mails[k].split('@')[0]} : consentement à donner, ignoré`); await ctx.close(); continue; }
    await p.waitForTimeout(1200);
    const hrefs = [...new Set(await p.$$eval('.tabbar a.tab, app-sidebar a[href^="/"]', as => as.map(a => a.getAttribute('href'))))]
      .filter(h => !/^\/(auth|legal|cgu|confidentialite)/.test(h));
    for (const h of hrefs) {
      await p.goto(BASE + h); await p.waitForTimeout(1500);
      if (!(await p.locator('.content').count())) continue;
      const r = await p.evaluate(() => {
        const c = document.querySelector('.content'); const page = c.querySelector(':scope > router-outlet + *');
        c.scrollTop = c.scrollHeight;
        const deb = page ? page.scrollHeight - page.getBoundingClientRect().height : 0;   // contenu qui dépasse de la page
        const bar = document.querySelector('.tabbar').getBoundingClientRect();
        const all = [...page.querySelectorAll('button, a, p, h2, h3, li, input, textarea')].filter(e => e.offsetParent && e.getBoundingClientRect().height > 0);
        const last = all.reduce((a, e) => (!a || e.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom) ? e : a, null);
        return { deb: Math.round(deb), bas: last ? Math.round(last.getBoundingClientRect().bottom) : 0, barre: Math.round(bar.top) };
      });
      const ok = r.deb <= 1 && r.bas <= r.barre;
      if (!ok) fails++;
      console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${mails[k].split('@')[0].padEnd(18)} ${h.padEnd(18)} débordement ${r.deb}px · bas du dernier élément ${r.bas} / barre ${r.barre}`);
    }
    await ctx.close();
  }
  await b.close();
  if (fails) process.exit(1);
})().catch(e => { console.error(e.message); process.exit(1); });
