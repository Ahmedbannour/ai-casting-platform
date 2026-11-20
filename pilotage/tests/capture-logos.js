// Le nom « Cercle » a la même police partout : mesure et captures (connexion, vitrine, menu ordinateur, en-tête téléphone).
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), OUT = path.join(__dirname, '..', 'nav');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const style = p => p.$$eval('.wordmark', els => els.filter(e => e.offsetParent).map(e => { const c = getComputedStyle(e); return `${c.fontFamily.split(',')[0]} ${c.fontWeight} ${c.fontStretch}`; }));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const res = {};
  const pc = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await pc.goto('http://localhost:4200/auth/login'); await pc.waitForTimeout(1500);
  res.connexion = await style(pc); await pc.screenshot({ path: path.join(OUT, 'logo-connexion.png'), clip: { x: 0, y: 0, width: 640, height: 120 } });
  await pc.fill('#email', QA.email); await pc.fill('#password', QA.password); await pc.click('button.submit-btn');
  await pc.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }); await pc.waitForTimeout(1200);
  res.menu = await style(pc); await pc.screenshot({ path: path.join(OUT, 'logo-menu.png'), clip: { x: 0, y: 0, width: 300, height: 90 } });
  const tel = await (await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
  await tel.goto('http://localhost:4200/auth/login'); await tel.fill('#email', QA.email); await tel.fill('#password', QA.password); await tel.click('button.submit-btn');
  await tel.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }); await tel.waitForTimeout(1200);
  res.entete = await style(tel); await tel.screenshot({ path: path.join(OUT, 'logo-entete.png'), clip: { x: 0, y: 0, width: 412, height: 60 } });
  const v = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await v.goto('http://localhost:4200/'); await v.waitForTimeout(1600);
  res.splash = await style(v); await v.waitForTimeout(2200); res.vitrine = await style(v);
  await v.screenshot({ path: path.join(OUT, 'logo-vitrine.png'), clip: { x: 0, y: 0, width: 640, height: 90 } });
  await b.close();
  console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
