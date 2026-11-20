// Capture « Mes demandes » en compte production sur téléphone, mode clair et sombre.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:4200';
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const mails = [...txt.matchAll(/e-mail\s*:\s*(\S+)/g)].map(m => m[1]), pws = [...txt.matchAll(/mot de passe\s*:\s*(\S+)/g)].map(m => m[1]);
const k = mails.findIndex(m => m.includes('demo.production'));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  for (const T of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(t => localStorage.setItem('casting_theme', t), T);
    const p = await ctx.newPage();
    await p.goto(BASE + '/auth/login'); await p.fill('#email', mails[k]); await p.fill('#password', pws[k]); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
    await p.goto(BASE + '/mes-demandes'); await p.waitForTimeout(1800);
    await p.screenshot({ path: path.join(__dirname, '..', 'nav', `mes-demandes-prod-${T}.png`) });
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e.stack); process.exit(1); });
