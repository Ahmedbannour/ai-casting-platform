// Salle ahmedRoom : sélecteur de projet, roadmap par lots (repliée / dépliée), aucune erreur.
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path');
const DIR = 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage';
const OUT = path.join(DIR, 'nav');
const srv = http.createServer((q, r) => { const f = path.join(DIR, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(b); }); }).listen(8766);
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }); const res = {};
  const p = await b.newPage({ viewport: { width: 1366, height: 860 } }); const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://127.0.0.1:8766/tableau-de-bord.html#roadmap'); await p.waitForTimeout(900);
  res.titre = await p.textContent('#h-name');
  res.projets = await p.$$eval('#h-proj button', bs => bs.map(x => x.textContent + (x.getAttribute('aria-pressed') === 'true' ? ' [actif]' : '')));
  res.lotsReplies = await p.$$eval('#rm-grid .rm-lotbar', x => x.length);
  res.tachesVisibles = await p.$$eval('#rm-grid .rm-bar[data-task]', x => x.length);
  await p.screenshot({ path: path.join(OUT, 'salle-roadmap-lots.png') });
  await p.click('#rm-grid .rm-lab.lot >> nth=0'); await p.waitForTimeout(300);
  res.apresDepli = await p.$$eval('#rm-grid .rm-bar[data-task]', x => x.length);
  await p.screenshot({ path: path.join(OUT, 'salle-roadmap-deplie.png') });
  await p.click('#h-proj button:nth-child(2)'); await p.waitForTimeout(1200);
  res.zanqa = { actif: await p.$eval('#h-proj button[aria-pressed=true]', x => x.textContent), sous: await p.textContent('#h-sub'),
    lots: await p.$$eval('#rm-grid .rm-lotbar', x => x.length) };
  await p.screenshot({ path: path.join(OUT, 'salle-zanqa-roadmap.png') });
  await p.goto('http://127.0.0.1:8766/tableau-de-bord.html#plan'); await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(OUT, 'salle-zanqa-plan.png') });
  await p.evaluate(() => localStorage.removeItem('ahmedroom.projet'));
  res.erreurs = errors;
  await b.close(); srv.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
