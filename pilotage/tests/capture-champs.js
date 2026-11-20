// Captures des champs au design de l'application sur téléphone (calendrier, liste déroulante, cases), dans les deux modes.
// Comptes recette.*@exemple.tn effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const today = new Date().toISOString().slice(0, 10), stamp = Date.now(), acc = {};
  for (const kind of ['MARQUE', 'AGENCE_MARKETING']) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${kind === 'MARQUE' ? 'Marque' : 'Agence'} ${stamp}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.champs.${kind.toLowerCase()}.${stamp}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: 'Champs', role: kind, agencyId: o, password: pw }) }, adm);
    acc[kind] = { email, pw };
  }
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const out = {};
  for (const T of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(t => localStorage.setItem('casting_theme', t), T);
    const p = await ctx.newPage(); p.setDefaultTimeout(10000); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/auth/login'); await p.fill('#email', acc.MARQUE.email); await p.fill('#password', acc.MARQUE.pw); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
    if (p.url().includes('/consentement')) { await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check(); await p.getByRole('button', { name: /^Continuer/ }).click(); await p.waitForTimeout(1200); }
    await p.goto(BASE + '/demandes/nouvelle'); await p.waitForTimeout(1200);
    await p.fill('input[name=title]', 'Lancement printemps 2027');
    const df = p.locator('app-date-field[name=airDate]');
    await df.scrollIntoViewIfNeeded(); await df.locator('.cal-btn').click(); await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, `champs-${T}-calendrier.png`) });
    await p.locator('.df-cal .day:not(.off):not(.out)').nth(10).click(); await p.waitForTimeout(300);
    out[T + '-date'] = await df.locator('input').inputValue();
    await p.click('button.next'); await p.click('button[type=submit]'); await p.waitForURL(u => /\/demandes\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 10000 });
    await p.waitForTimeout(800);
    const sel = p.locator('app-select[name=agency]'); await sel.scrollIntoViewIfNeeded();
    await sel.locator('button.sf').click(); await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, `champs-${T}-liste.png`) });
    await p.locator('.sf-menu [role=option]').filter({ hasText: `Recette Agence ${stamp}` }).click(); await p.waitForTimeout(300);
    out[T + '-agence'] = await sel.locator('.val').innerText();
    out[T + '-envoyerActif'] = await p.getByRole('button', { name: "Envoyer à l'agence" }).isEnabled();
    out[T + '-natifs'] = await p.evaluate(() => document.querySelectorAll('select, input[type=date], input[type=time]').length);
    out[T + '-erreurs'] = errs;
    await ctx.close();
  }
  await b.close();
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
