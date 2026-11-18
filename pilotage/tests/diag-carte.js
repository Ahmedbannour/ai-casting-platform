// Diagnostic de la carte de la section Contact (vitrine)
const { chromium } = require('playwright-core');
(async () => {
  const base = process.argv[2] || 'http://localhost:4200';
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1366, height: 860 } });
  const errs = [], bad = [], reqs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 200)); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message.slice(0, 200)));
  p.on('requestfailed', r => bad.push('ÉCHEC ' + r.url().slice(0, 140) + ' ' + (r.failure()?.errorText || '')));
  p.on('response', r => { const u = r.url(); if (/tile|style|font|glyph|sprite|maplibre|worker|\.pbf|openfreemap|carto|maptiler/i.test(u)) reqs.push(r.status() + ' ' + u.slice(0, 120)); });
  await p.goto(base + '/'); await p.waitForSelector('app-splash .skip', { timeout: 15000 }).catch(() => {}); await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
  await p.click('#menu-mobile a[href="#contact"]').catch(() => {}); await p.waitForTimeout(+(process.argv[3] || 6000));
  const st = await p.evaluate(() => { const w = document.querySelector('.map-wrap'); return { classe: w?.className, texte: w?.innerText?.slice(0, 160), canvas: !!document.querySelector('.map-wrap canvas'), taille: w ? [w.clientWidth, w.clientHeight] : null }; });
  await p.screenshot({ path: 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage\\nav\\diag-carte.jpg', type: 'jpeg', quality: 75 });
  console.log(JSON.stringify({ st, errs: errs.slice(0, 12), bad: bad.slice(0, 10), reqs: reqs.slice(0, 15) }, null, 1));
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
