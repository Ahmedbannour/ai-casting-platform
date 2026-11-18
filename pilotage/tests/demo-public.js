// T-137 · Parcours de démo par l'adresse publique, chronométré (ordinateur puis mobile).
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const BASE = process.argv[2] || fs.readFileSync(path.join(process.env.TEMP, 'tunnel-url.txt'), 'utf8').trim();
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const out = { base: BASE };
  for (const [dev, opt] of [['bureau', { viewport: { width: 1366, height: 820 } }], ['mobile', { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true }]]) {
    const ctx = await b.newContext(opt); const p = await ctx.newPage(); const errs = [], bad = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('response', r => { if (r.status() >= 400 && !/login$|google|facebook|gstatic/.test(r.url())) bad.push(r.status() + ' ' + r.url().replace(BASE, '')); });
    const t = {}; let s = Date.now();
    await p.goto(BASE + '/', { waitUntil: 'load', timeout: 60000 }); t.vitrine = Date.now() - s;
    s = Date.now(); await p.goto(BASE + '/auth/login', { waitUntil: 'load' }); await p.fill('#email', QA.email); await p.fill('#password', QA.password);
    await p.click('button.submit-btn'); await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 30000 }); t.connexion = Date.now() - s;
    s = Date.now(); await p.goto(BASE + '/dashboard', { waitUntil: 'load' }); await p.waitForSelector('.tile img, .grid .tile', { timeout: 30000 }); t.acteurs = Date.now() - s;
    s = Date.now(); await p.goto(BASE + '/agenda', { waitUntil: 'load' }); await p.waitForSelector('h1', { timeout: 30000 }); t.agenda = Date.now() - s;
    s = Date.now(); await p.goto(BASE + '/projects', { waitUntil: 'load' }); await p.waitForTimeout(800); t.projets = Date.now() - s;
    const imgs = await p.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0).length);
    out[dev] = { temps_ms: t, imagesCassees: imgs, erreursJs: errs.slice(0, 3), http4xx5xx: bad.slice(0, 5) };
    await ctx.close();
  }
  await b.close(); console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error('ERREUR', e.message.split('\n')[0]); process.exit(1); });
