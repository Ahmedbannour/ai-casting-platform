// Mesure de la fluidité du défilement au doigt sur téléphone simulé, processeur ralenti ×4 (téléphone moyen).
// Compte démo (ROLE, agence par défaut) : liste des demandes puis première demande. Affiche la durée des images.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const BASE = 'http://localhost:4200';
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const mails = [...txt.matchAll(/e-mail\s*:\s*(\S+)/g)].map(m => m[1]), pws = [...txt.matchAll(/mot de passe\s*:\s*(\S+)/g)].map(m => m[1]);
const k = mails.findIndex(m => m.includes(process.env.ROLE || 'demo.agence'));
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 });
  await ctx.addInitScript(t => localStorage.setItem('casting_theme', t), process.env.THEME || 'light');
  const p = await ctx.newPage();
  await p.goto(BASE + '/auth/login'); await p.fill('#email', mails[k]); await p.fill('#password', pws[k]); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
  const cdp = await ctx.newCDPSession(p);
  const pages = ['/mes-demandes'];
  await p.goto(BASE + '/mes-demandes'); await p.waitForTimeout(1500);
  const first = await p.locator('.list a').first().getAttribute('href').catch(() => null);
  if (first) pages.push(first);
  pages.push('/dashboard');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  for (const u of pages) {
    await p.goto(BASE + u); await p.waitForTimeout(2500);
    await p.evaluate(() => { window.__f = []; let l = performance.now(); const go = t => { window.__f.push(t - l); l = t; if (window.__f.length < 400) requestAnimationFrame(go); }; requestAnimationFrame(go); });
    for (let n = 0; n < 4; n++) {
      const y0 = 650, dir = -1;   // le doigt monte : la page descend
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: y0 }] });
      for (let i = 1; i <= 15; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: y0 + dir * i * 25 }] }), await p.waitForTimeout(16);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(300);
    }
    const f = (await p.evaluate(() => window.__f.slice(1))).sort((a, b) => a - b);
    const avg = f.reduce((a, b) => a + b, 0) / f.length, p95 = f[Math.floor(f.length * .95)], longs = f.filter(x => x > 50).length;
    const st = await p.evaluate(() => Math.round(document.querySelector('.content').scrollTop)) + ' / ' + await p.evaluate(() => { const c = document.querySelector('.content'); return c.scrollHeight - c.clientHeight; });
    console.log(`${u.padEnd(48)} images ${f.length} · moyenne ${avg.toFixed(0)} ms · 95e centile ${p95.toFixed(0)} ms · images > 50 ms : ${longs} · défilé ${st}px`);
  }
  await b.close();
})().catch(e => { console.error(e.stack); process.exit(1); });
