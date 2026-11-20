// Barre d'onglets mobile : la pastille suit l'onglet actif, la barre se range en descendant et revient en remontant.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const ok = (c, m) => { if (!c) throw new Error('ÉCHEC : ' + m); console.log('OK  ' + m); };
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 250 : 0 });
  for (const T of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(t => localStorage.setItem('casting_theme', t), T);
    const p = await ctx.newPage(); p.setDefaultTimeout(10000);
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/auth/login');
    await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
    await p.goto(BASE + '/accueil'); await p.waitForTimeout(1200);
    const bar = p.locator('.tabbar');
    const idx = () => bar.evaluate(e => e.style.getPropertyValue('--i'));
    ok(await idx() === '0', `${T} · pastille sous « Accueil »`);
    const clip = async n => { const bb = await bar.boundingBox(); await p.screenshot({ path: path.join(OUT, `onglets-${T}-${n}.png`), clip: { x: 0, y: bb.y - 14, width: 412, height: bb.height + 28 } }); };
    await clip('accueil');
    await bar.getByText('Projets').click(); await p.waitForTimeout(160); await clip('glisse');
    await p.waitForTimeout(600);
    ok(await idx() === '2', `${T} · pastille glisse sous « Projets »`); await clip('projets');
    await bar.getByText('Acteurs').click(); await p.waitForTimeout(800);
    ok(await idx() === '3', `${T} · pastille sous « Acteurs »`);
    await p.locator('.content').evaluate(e => e.scrollBy(0, 600)); await p.waitForTimeout(500);
    ok(await bar.evaluate(e => e.classList.contains('hidden')), `${T} · barre rangée en descendant`);
    await p.locator('.content').evaluate(e => e.scrollBy(0, -200)); await p.waitForTimeout(500);
    ok(!(await bar.evaluate(e => e.classList.contains('hidden'))), `${T} · barre revenue en remontant`);
    ok(errs.length === 0, `${T} · aucune erreur JS ${errs.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
