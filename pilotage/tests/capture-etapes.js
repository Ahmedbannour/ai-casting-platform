// Captures téléphone : fiche acteur en étapes (compte démo acteur) et inscription pro en étapes.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), OUT = path.join(__dirname, '..', 'nav');
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const mails = [...txt.matchAll(/e-mail\s*:\s*(\S+)/g)].map(m => m[1]), pws = [...txt.matchAll(/mot de passe\s*:\s*(\S+)/g)].map(m => m[1]);
const k = mails.findIndex(m => m.includes('demo.acteur'));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => localStorage.setItem('casting_theme', 'light'));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4200/auth/inscription-pro'); await p.waitForTimeout(1200);
  await p.screenshot({ path: path.join(OUT, 'etapes-pro-1.png') });
  await p.locator('.role', { hasText: 'Agence marketing' }).click(); await p.click('button[type=submit]'); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(OUT, 'etapes-pro-2.png') });
  await p.goto('http://localhost:4200/auth/login'); await p.fill('#email', mails[k]); await p.fill('#password', pws[k]); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
  await p.goto('http://localhost:4200/mon-profil'); await p.waitForTimeout(1800);
  await p.locator('.layout').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, 'etapes-acteur-1.png') });
  const visibles = async () => p.$$eval('.sections > section.card', s => s.filter(x => getComputedStyle(x).display !== 'none').map(x => x.id));
  const out = { etape1: await visibles() };
  await p.locator('.bar button.step-next').click(); await p.waitForTimeout(700);
  out.etape2 = await visibles();
  await p.screenshot({ path: path.join(OUT, 'etapes-acteur-2.png') });
  console.log(JSON.stringify({ ...out, errs }));
  await b.close();
})().catch(e => { console.error(e.stack); process.exit(1); });
