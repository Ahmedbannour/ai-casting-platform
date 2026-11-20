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
    const idx = () => bar.evaluate(e => { const t = [...e.querySelectorAll('.tab')]; return String(t.findIndex(x => x.classList.contains('active'))); });
    // La pastille recouvre exactement l'onglet actif, et seul cet onglet montre son nom.
    const aligned = () => bar.evaluate(e => { const a = e.querySelector('.tab.active'), pill = e.querySelector('.pill');
      const r = a.getBoundingClientRect(), q = pill.getBoundingClientRect(); return Math.abs(r.left - q.left) < 3 && Math.abs(r.width - q.width) < 3; });
    const labels = () => bar.evaluate(e => [...e.querySelectorAll('.tab span')].filter(s => s.getBoundingClientRect().width > 4).map(s => s.textContent.trim()));
    ok(await idx() === '0', `${T} · onglet « Accueil » actif`);
    ok(await aligned(), `${T} · pastille posée sur « Accueil »`);
    ok(JSON.stringify(await labels()) === '["Accueil"]', `${T} · seul « Accueil » montre son nom (${await labels()})`);
    const clip = async n => { const bb = await bar.boundingBox(); await p.screenshot({ path: path.join(OUT, `onglets-${T}-${n}.png`), clip: { x: 0, y: bb.y - 14, width: 412, height: bb.height + 28 } }); };
    await clip('accueil');
    // Aucune « photo » de page pendant le changement d'onglet (c'est elle qui figeait le fond), et pas d'image bloquée.
    await p.evaluate(() => {
      window.__vt = { n: 0, skipped: 0 }; window.__gaps = [];
      const orig = document.startViewTransition?.bind(document);
      if (orig) document.startViewTransition = (...a) => { const t = orig(...a); window.__vt.n++;
        const sk = t.skipTransition.bind(t); t.skipTransition = () => { window.__vt.skipped++; return sk(); }; return t; };
      let last = performance.now(); const end = last + 1500;
      const loop = now => { window.__gaps.push(now - last); last = now; if (now < end) requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    });
    await bar.getByRole('link', { name: 'Projets' }).click(); await p.waitForTimeout(160); await clip('glisse');
    await p.waitForTimeout(600);
    await p.waitForTimeout(900);
    const vt = await p.evaluate(() => ({ ...window.__vt, maxGap: Math.round(Math.max(...window.__gaps)) }));
    ok(vt.n === vt.skipped, `${T} · pas de photo figée pendant le changement (${vt.skipped}/${vt.n} transitions sautées)`);
    console.log(`    image la plus longue pendant le changement : ${vt.maxGap} ms`);
    ok(await idx() === '2' && await aligned(), `${T} · pastille glisse sur « Projets »`);
    ok(JSON.stringify(await labels()) === '["Projets"]', `${T} · seul « Projets » montre son nom`); await clip('projets');
    await bar.getByRole('link', { name: 'Acteurs' }).click(); await p.waitForTimeout(800);
    ok(await idx() === '3' && await aligned(), `${T} · pastille sur « Acteurs »`);
    await bar.getByRole('link', { name: 'Propositions' }).click(); await p.waitForTimeout(800);
    ok(await aligned(), `${T} · « Propositions », le nom le plus long, tient dans la pastille`);
    ok(await bar.evaluate(e => { const s = e.querySelector('.tab.active span'); return s.scrollWidth <= s.clientWidth + 1; }), `${T} · nom « Propositions » non coupé`);
    await clip('propositions');
    await bar.getByRole('link', { name: 'Acteurs' }).click(); await p.waitForTimeout(800);
    await p.locator('.content').evaluate(e => e.scrollBy(0, 600)); await p.waitForTimeout(500);
    ok(await bar.evaluate(e => e.classList.contains('hidden')), `${T} · barre rangée en descendant`);
    await p.locator('.content').evaluate(e => e.scrollBy(0, -200)); await p.waitForTimeout(500);
    ok(!(await bar.evaluate(e => e.classList.contains('hidden'))), `${T} · barre revenue en remontant`);
    ok(errs.length === 0, `${T} · aucune erreur JS ${errs.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
