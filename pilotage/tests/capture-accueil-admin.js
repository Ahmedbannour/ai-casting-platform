// T-144 · Accueil de l'administrateur (compte de recette) : captures ordinateur et mobile + contrôles.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const OUT = 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage\\nav';
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }); const res = {};
  for (const [dev, opt] of [['bureau', { viewport: { width: 1366, height: 900 } }], ['mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const ctx = await b.newContext({ ...opt, colorScheme: 'dark' }); const p = await ctx.newPage(); const errs = [], bad = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('response', r => { if (r.status() >= 400 && /\/api\//.test(r.url())) bad.push(r.status() + ' ' + r.url().split('/api')[1]); });
    await p.goto('http://localhost:4200/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 20000 }).catch(() => {});
    res['arrivee_' + dev] = new URL(p.url()).pathname;
    await p.waitForSelector('app-admin-home .pulse .tile', { timeout: 15000 }).catch(() => {});
    await p.addStyleTag({ content: 'app-email-banner{display:none!important}' }).catch(() => {});
    await p.waitForTimeout(800);
    await p.screenshot({ path: path.join(OUT, `t144-admin-${dev}.jpg`), type: 'jpeg', quality: 78, fullPage: true });
    res['tuiles_' + dev] = await p.locator('app-admin-home .pulse .tile').allInnerTexts().then(t => t.map(x => x.replace(/\s+/g, ' ')));
    res['aTraiter_' + dev] = await p.locator('app-admin-home .todos li').allInnerTexts().then(t => t.map(x => x.replace(/\s+/g, ' ')));
    
    res['erreurs_' + dev] = errs; res['http_' + dev] = bad;
    await ctx.close();
  }
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
