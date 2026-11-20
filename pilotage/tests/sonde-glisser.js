// Sonde : glissement du doigt (geste tactile réel via CDP) sur « Mes demandes » en compte production.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:4200';
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const mails = [...txt.matchAll(/e-mail\s*:\s*(\S+)/g)].map(m => m[1]), pws = [...txt.matchAll(/mot de passe\s*:\s*(\S+)/g)].map(m => m[1]);
const k = mails.findIndex(m => m.includes(process.env.ROLE || 'demo.production'));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(BASE + '/auth/login'); await p.fill('#email', mails[k]); await p.fill('#password', pws[k]); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
  await p.goto(BASE + (process.env.URL || '/mes-demandes')); await p.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(p);
  const st = () => p.evaluate(() => ({ content: Math.round(document.querySelector('.content').scrollTop), max: document.querySelector('.content').scrollHeight - document.querySelector('.content').clientHeight, win: Math.round(scrollY), body: document.documentElement.scrollHeight - innerHeight }));
  console.log('départ', JSON.stringify(await st()));
  for (const [x, y] of [[200, 600], [200, 300], [60, 700]]) {
    // Doigt posé, glissé vers le haut en 12 étapes, puis levé.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 30 }] }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(500);
    const el = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? e.tagName.toLowerCase() + '.' + [...e.classList].join('.') : ''; }, [x, y]);
    console.log(`glisser depuis (${x},${y}) sur ${el}`, JSON.stringify(await st()));
  }
  await p.screenshot({ path: path.join(__dirname, '..', 'nav', 'sonde-glisser.png') });
  await b.close();
})().catch(e => { console.error(e.stack); process.exit(1); });
