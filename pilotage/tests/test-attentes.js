// Sprint 3 · T-162 : la production saisit les attentes par personnage et les transmet au réalisateur et au 1er AD.
// Comptes recette.*@exemple.tn et organisations « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
async function login(b, a) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }); const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  p.errs = []; p.on('pageerror', x => p.errs.push(x.message));
  await p.goto(BASE + '/auth/login'); await p.fill('#email', a.email); await p.fill('#password', a.pw); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
  if (p.url().includes('/consentement')) {
    await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check();
    await p.getByRole('button', { name: /^Continuer/ }).click();
    await p.waitForURL(u => !u.pathname.startsWith('/consentement'), { timeout: 10000 }).catch(() => {});
  }
  return p;
}
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const today = new Date().toISOString().slice(0, 10), st = Date.now(), res = {}, acc = {};
  const mk = async (k, role, orgKind, nom, first, last) => {
    let o = null;
    if (orgKind) o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${nom} ${st}`, contractStart: today, kind: orgKind }) }, adm)).b.id;
    const email = `recette.t162.${k}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: first, lastName: last, role, agencyId: o, password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + c.s + ' ' + JSON.stringify(c.b));
    acc[k] = { email, pw, o, nom: `Recette ${nom} ${st}`, full: `${first} ${last}`, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  };
  await mk('m', 'MARQUE', 'MARQUE', 'Marque Jasmin', 'Test', 'Marque');
  await mk('a', 'AGENCE_MARKETING', 'AGENCE_MARKETING', 'Agence Zeta', 'Test', 'Agence');
  await mk('p', 'BOITE_PROD', 'BOITE_PROD', 'Prod Eta', 'Test', 'Prod');
  await mk('r', 'REALISATEUR', null, '', 'Recette' + st, 'Réalisatrice');
  await mk('ad', 'REALISATEUR', null, '', 'Recette' + st, 'Assistant');
  const M = acc.m.tk, A = acc.a.tk;
  const id = (await j('/demandes', { method: 'POST', body: JSON.stringify({ title: 'Recette Parfum Jasmin ' + st }) }, M)).b.id;
  await j(`/demandes/${id}/v0`, { method: 'PUT', body: JSON.stringify({ body: 'Une femme marche dans la médina au petit matin.' }) }, M);
  await j(`/demandes/${id}/envoyer`, { method: 'POST', body: JSON.stringify({ agencyId: acc.a.o }) }, M);
  await j(`/demandes/${id}/accepter`, { method: 'POST' }, A);
  await j(`/demandes/${id}/v1`, { method: 'PUT', body: JSON.stringify({ body: 'Concept : la médina s’éveille, le parfum suit Leila.' }) }, A);
  await j(`/demandes/${id}/v1/livrer`, { method: 'POST' }, A);
  await j(`/demandes/${id}/v1/valider`, { method: 'POST' }, M);
  const pr = await j(`/demandes/${id}/production`, { method: 'POST', body: JSON.stringify({ productionId: acc.p.o }) }, A);
  if (pr.s !== 200) throw new Error('production ' + pr.s);
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  // Production : deux personnages, une modification, transmission
  const p = await login(b, acc.p);
  await p.goto(BASE + '/demandes/' + id); await p.waitForTimeout(1500);
  res.transmettreBloqueSansPersonnage = await p.getByRole('button', { name: 'Transmettre les attentes' }).isDisabled();
  await p.getByRole('button', { name: 'Ajouter un personnage' }).click();
  await p.fill('input[name=cname]', 'Leila');
  await p.fill('textarea[name=cstory]', 'Elle traverse la médina et s’arrête devant un jasmin.');
  await p.fill('textarea[name=cbrand]', 'Femme de 30 à 40 ans, élégante, naturelle');
  await p.fill('textarea[name=cagency]', 'Regard franc, pas un visage de mannequin');
  await p.getByRole('button', { name: 'Ajouter le personnage' }).click(); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Ajouter un personnage' }).click();
  await p.fill('input[name=cname]', 'Le marchand');
  await p.fill('textarea[name=cbrand]', 'Homme âgé, sourire');
  await p.getByRole('button', { name: 'Ajouter le personnage' }).click(); await p.waitForTimeout(1200);
  await p.locator('.chars li', { hasText: 'Le marchand' }).getByRole('button', { name: 'Modifier' }).click();
  await p.fill('textarea[name=cnotes]', 'Figurant spécial, tournage le samedi');
  await p.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await p.waitForTimeout(1200);
  res.personnages = await p.locator('.chars .char-head b').allInnerTexts();
  await p.selectOption('select[name=director]', { label: acc.r.full });
  await p.selectOption('select[name=firstAd]', { label: acc.ad.full });
  await p.screenshot({ path: path.join(OUT, 'v2-attentes-production.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  await p.getByRole('button', { name: 'Transmettre les attentes' }).click(); await p.waitForTimeout(1500);
  res.transmission = await p.locator('.ok').innerText().catch(() => '');
  res.ligneTransmise = await p.locator('.card .src').first().innerText().catch(() => '');
  // Réalisatrice : voit la publicité, les attentes, sans pouvoir les modifier
  const r = await login(b, acc.r);
  res.menuReal = (await r.locator('nav a').allInnerTexts().catch(() => [])).map(x => x.split('\n')[0]).filter(Boolean);
  await r.goto(BASE + '/mes-demandes'); await r.waitForTimeout(1500);
  res.listeReal = await r.locator('.list li').count();
  await r.locator('.list a').first().click(); await r.waitForURL(/\/demandes\//); await r.waitForTimeout(1500);
  res.realVoit = await r.locator('.chars dd').allInnerTexts();
  res.realPeutModifier = await r.getByRole('button', { name: 'Modifier' }).count();
  await r.screenshot({ path: path.join(OUT, 'v2-attentes-realisateur.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  // Marque : voit aussi les attentes
  const m = await login(b, acc.m);
  await m.goto(BASE + '/demandes/' + id); await m.waitForTimeout(1500);
  res.marqueVoitPersonnages = await m.locator('.chars .char-head b').allInnerTexts();
  const n = (await j('/me/notifications', {}, acc.ad.tk)).b.items || [];
  res.notifAssistant = n.map(x => x.title);
  res.erreurs = [...p.errs, ...r.errs, ...m.errs];
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
