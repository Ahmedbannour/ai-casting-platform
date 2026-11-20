// Sonde : temps de chargement de la page de connexion et requêtes lentes.
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  for (let k = 0; k < 3; k++) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
    const slow = []; const t = {};
    p.on('request', r => t[r.url()] = Date.now());
    p.on('requestfinished', r => { const d = Date.now() - t[r.url()]; if (d > 800) slow.push(Math.round(d) + 'ms ' + r.url().slice(0, 90)); });
    p.on('requestfailed', r => slow.push('ÉCHEC ' + r.url().slice(0, 90) + ' ' + r.failure()?.errorText));
    const t0 = Date.now();
    await p.goto('http://localhost:4200/auth/login', { waitUntil: 'load', timeout: 40000 }).catch(e => slow.push('goto ' + e.message.split('\n')[0]));
    console.log(`essai ${k + 1} : ${Date.now() - t0} ms`, JSON.stringify(slow));
    await ctx.close();
  }
  await b.close();
})();
