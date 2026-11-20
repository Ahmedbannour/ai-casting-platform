// Sprint 4 · T-163 : la réalisatrice écrit la V2 (scènes, fiches de rôle à partir des personnages) et la publie ; le casting s'ouvre.
// Comptes recette.*@exemple.tn et organisations « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const choisir = require('./choisir');
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
    const email = `recette.t163.${k}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
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
  const id = (await j('/demandes', { method: 'POST', body: JSON.stringify({ title: 'Recette Parfum Jasmin V2 ' + st }) }, M)).b.id;
  await j(`/demandes/${id}/v0`, { method: 'PUT', body: JSON.stringify({ body: 'Une femme marche dans la médina au petit matin.' }) }, M);
  await j(`/demandes/${id}/envoyer`, { method: 'POST', body: JSON.stringify({ agencyId: acc.a.o }) }, M);
  await j(`/demandes/${id}/accepter`, { method: 'POST' }, A);
  await j(`/demandes/${id}/v1`, { method: 'PUT', body: JSON.stringify({ body: 'Concept : la médina s’éveille, le parfum suit Leila.' }) }, A);
  await j(`/demandes/${id}/v1/livrer`, { method: 'POST' }, A);
  await j(`/demandes/${id}/v1/valider`, { method: 'POST' }, M);
  const pr = await j(`/demandes/${id}/production`, { method: 'POST', body: JSON.stringify({ productionId: acc.p.o }) }, A);
  if (pr.s !== 200) throw new Error('production ' + pr.s);
  const P = acc.p.tk;
  await j(`/demandes/${id}/personnages`, { method: 'POST', body: JSON.stringify({ name: 'Leila', story: 'Elle traverse la médina', brandWish: 'Femme de 30 à 40 ans, élégante', agencyWish: 'Regard franc' }) }, P);
  const users = (await j('/admin/users', {}, adm)).b; const ul = Array.isArray(users) ? users : users.content;
  const uid = e => ul.find(u => u.email === e).id;
  const tr = await j(`/demandes/${id}/transmettre`, { method: 'POST', body: JSON.stringify({ directorId: uid(acc.r.email), firstAdId: uid(acc.ad.email) }) }, P);
  if (tr.s !== 200) throw new Error('transmission ' + tr.s);
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  const r = await login(b, acc.r);
  await r.goto(BASE + '/demandes/' + id); await r.waitForTimeout(1500);
  res.publierBloque = await r.getByRole('button', { name: 'Publier la V2 et lancer le casting' }).isDisabled();
  await r.fill('textarea[name=v2]', 'V2 : la médina au petit matin, trois plans, 30 secondes, lumière douce.');
  await r.getByRole('button', { name: 'Ajouter une scène' }).click();
  await r.fill('input[name=stitle]', 'Scène 1 · La médina s’éveille');
  await r.fill('textarea[name=sdesc]', 'Leila passe devant les échoppes encore fermées.');
  await r.getByRole('button', { name: 'Ajouter la scène' }).click(); await r.waitForTimeout(1200);
  await r.getByRole('button', { name: 'Ajouter une fiche de rôle' }).click();
  await choisir(r, 'rchar', 'Leila'); await r.waitForTimeout(300);
  const nomPrerempli = await r.inputValue('input[name=rname]');
  await r.fill('textarea[name=rintent]', 'Une femme libre et sereine, qui s’arrête pour respirer le jasmin : un instant pour elle.');
  await choisir(r, 'rimp', 'Principal');
  await r.click('.char-form button.next');   // étape 2 : le profil
  res.prerempli = { nom: nomPrerempli, apparence: await r.inputValue('textarea[name=rapp]') };
  await choisir(r, 'rgender', 'Femme');
  await r.fill('input[name=rmin]', '30'); await r.fill('input[name=rmax]', '40');
  await r.getByRole('button', { name: 'Ajouter la fiche' }).click(); await r.waitForTimeout(1200);
  await r.getByRole('button', { name: 'Ajouter une fiche de rôle' }).click();
  await r.fill('input[name=rname]', 'Passants de la médina');
  await choisir(r, 'rimp', 'Figuration');
  await r.click('.char-form button.next');
  await r.getByRole('button', { name: 'Ajouter la fiche' }).click(); await r.waitForTimeout(1200);
  res.bloqueSansIntention = await r.getByRole('button', { name: 'Publier la V2 et lancer le casting' }).isDisabled();
  await r.locator('.chars li', { hasText: 'Passants de la médina' }).getByRole('button', { name: 'Modifier' }).click();
  await r.fill('textarea[name=rintent]', 'Une vie ordinaire et paisible autour de Leila.');
  await r.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await r.waitForTimeout(1200);
  await r.screenshot({ path: path.join(OUT, 'v2-editeur-v2.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  await r.getByRole('button', { name: 'Publier la V2 et lancer le casting' }).click(); await r.waitForTimeout(2000);
  res.publication = await r.locator('.ok').innerText().catch(() => '');
  res.etape = await r.locator('.steps .now').innerText();
  await r.getByRole('link', { name: 'Ouvrir le casting' }).click(); await r.waitForURL(/\/projects\//, { timeout: 10000 }); await r.waitForTimeout(2000);
  const txt = await r.locator('body').innerText();
  res.projetUrl = r.url().replace(BASE, '');
  res.projetMontreRoles = ['Leila', 'Passants de la médina'].map(n => n + ' : ' + txt.includes(n));
  await r.screenshot({ path: path.join(OUT, 'v2-casting-ouvert.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  const m = await login(b, acc.m);
  await m.goto(BASE + '/demandes/' + id); await m.waitForTimeout(1500);
  res.marqueVoitRoles = await m.locator('.chars .char-head b').allInnerTexts();
  res.marqueLienCasting = await m.getByRole('link', { name: 'Ouvrir le casting' }).count();
  res.erreurs = [...r.errs, ...m.errs];
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
