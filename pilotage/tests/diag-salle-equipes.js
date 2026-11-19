// Salle ahmedRoom : chaque projet affiche sa propre équipe d'ingénieurs, les fonctions support sont communes.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const DIR = 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage';
const OUT = path.join(DIR, 'nav');
const srv = http.createServer((q, r) => { const f = path.join(DIR, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(b); }); }).listen(8767);
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }); const res = {};
  const p = await b.newPage({ viewport: { width: 1366, height: 900 } }); const errors = []; p.on('pageerror', e => errors.push(e.message));
  const org = async () => p.$$eval('#org .dcard', xs => xs.map(x => x.querySelector('h3').textContent + ' — ' + x.querySelector('.cnt').textContent));
  await p.goto('http://127.0.0.1:8767/tableau-de-bord.html#org'); await p.waitForTimeout(900);
  res.aiCasting = await org(); await p.screenshot({ path: path.join(OUT, 'salle-equipe-aicasting.png'), fullPage: false });
  await p.click('#h-proj button:nth-child(2)'); await p.waitForTimeout(1200);
  await p.goto('http://127.0.0.1:8767/tableau-de-bord.html#org'); await p.waitForTimeout(900);
  res.safiJacob = await org(); await p.screenshot({ path: path.join(OUT, 'salle-equipe-safijacob.png'), fullPage: false });
  await p.evaluate(() => localStorage.removeItem('ahmedroom.projet'));
  res.erreurs = errors;
  await b.close(); srv.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
