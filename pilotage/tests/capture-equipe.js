// Capture d'une publicité vue par l'agence puis par la production sur téléphone : bandeau « Où en est la publicité » et équipe.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:4200';
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const mails = [...txt.matchAll(/e-mail\s*:\s*(\S+)/g)].map(m => m[1]), pws = [...txt.matchAll(/mot de passe\s*:\s*(\S+)/g)].map(m => m[1]);
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const out = {};
  for (const who of ['demo.agence', 'demo.production']) {
    const k = mails.findIndex(m => m.includes(who));
    const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => localStorage.setItem('casting_theme', 'light'));
    const p = await ctx.newPage();
    await p.goto(BASE + '/auth/login'); await p.fill('#email', mails[k]); await p.fill('#password', pws[k]); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
    await p.goto(BASE + '/mes-demandes'); await p.waitForTimeout(1500);
    await p.screenshot({ path: path.join(__dirname, '..', 'nav', `equipe-${who}-liste.png`) });
    out[who + ' liste'] = await p.locator('.list .now').allInnerTexts();
    const a = p.locator('.list a').first();
    if (await a.count()) {
      await a.click(); await p.waitForTimeout(1500);
      const nc = p.locator('.now-card'); await nc.scrollIntoViewIfNeeded();
      await p.locator('.content').evaluate((c, y) => c.scrollBy(0, y), -60);
      await p.screenshot({ path: path.join(__dirname, '..', 'nav', `equipe-${who}-detail.png`) });
      out[who + ' bandeau'] = await nc.innerText();
      out[who + ' equipe'] = await p.locator('.team li').allInnerTexts();
    }
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
