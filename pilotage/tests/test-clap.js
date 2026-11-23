// Confirmation « clap » : quand le chef de room change un accès, le message apparaît en haut de l'écran (toujours visible),
// avec le clap aux couleurs et au nom de la boîte ; l'ancien message en bas de page n'est plus affiché.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
const ok = (c, m) => { if (!c) throw new Error('ÉCHEC : ' + m); console.log('OK  ' + m); };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const st = Date.now(), today = new Date().toISOString().slice(0, 10), acc = {};
  for (const [k, role, kind, first] of [['p', 'BOITE_PROD', 'BOITE_PROD', 'Hédi'], ['m', 'MARQUE', 'MARQUE', 'Sana']]) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette Clap ${k} ${st}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.clap.${k}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: first, lastName: 'Recette', role, agencyId: o, password: pw }) }, adm);
    acc[k] = { email, pw, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  await j('/production/marque', { method: 'PUT', body: JSON.stringify({ name: 'Lumière Prod', color: '#E4572E' }) }, acc.p.tk);
  const pid = (await j('/projects', { method: 'POST', body: JSON.stringify({ title: 'Recette Clap ' + st, type: 'PUBLICITE' }) }, acc.p.tk)).b.id;
  await j(`/rooms/${pid}/invitations`, { method: 'POST', body: JSON.stringify({ email: acc.m.email }) }, acc.p.tk);
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  for (const [dev, label] of [[{ viewport: { width: 1366, height: 760 } }, 'ordinateur'], [{ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 'téléphone']]) {
    const p = await (await b.newContext({ ...dev, colorScheme: 'dark' })).newPage();
    p.setDefaultTimeout(15000); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/auth/login'); await p.fill('#email', acc.p.email); await p.fill('#password', acc.p.pw); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'));
    if (p.url().includes('/consentement')) { await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check(); await p.getByRole('button', { name: /^Continuer/ }).click(); await p.waitForURL(u => !u.pathname.startsWith('/consentement')); }
    await p.goto(BASE + '/rooms/' + pid); await p.waitForTimeout(1500);
    await p.locator('button', { hasText: 'Équipe' }).first().click(); await p.waitForTimeout(400);
    const sana = p.locator('.mem', { hasText: 'Sana Recette' });
    await sana.locator('button.access').click(); await p.waitForTimeout(200);
    await sana.locator('.pcard', { hasText: label === 'ordinateur' ? 'Spectateur' : 'Collaborateur' }).click();
    const toast = p.locator('app-toast-host .toast').first();
    await toast.waitFor(); await p.waitForTimeout(950);
    const box = await toast.boundingBox(), vh = (dev.viewport.height);
    ok(box && box.y >= 0 && box.y + box.height <= vh, `${label} : la confirmation est à l’écran (en haut, y=${Math.round(box.y)})`);
    ok((await toast.innerText()).includes('C’est dans la boîte') && (await toast.innerText()).includes('Accès de Sana Recette'), `${label} : « C’est dans la boîte ! » et le message`);
    ok((await toast.locator('.prod').innerText()) === 'LUMIÈRE PROD', `${label} : le clap porte le nom de la boîte`);
    const orig = await p.locator('p.ok[role=status]').boundingBox();
    ok(!orig || orig.width <= 1, `${label} : l’ancien message en bas de page n’est plus affiché`);
    await p.screenshot({ path: path.join(OUT, `clap-${label === 'ordinateur' ? 'ordi' : 'tel'}.jpg`), type: 'jpeg', quality: 82 });
    await p.waitForTimeout(5200);
    ok(await p.locator('app-toast-host .toast').count() === 0, `${label} : la confirmation s’en va seule après la lecture`);
    ok(errs.length === 0, `${label} : aucune erreur JavaScript` + (errs.length ? ' : ' + errs.join(' | ') : ''));
  }
  await b.close();
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
