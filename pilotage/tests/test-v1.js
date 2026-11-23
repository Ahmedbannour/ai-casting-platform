// Sprint 3 · T-161 : l'agence livre sa V1, la marque demande une révision, V1.1 livrée puis validée, l'agence confie la production.
// Comptes recette.*@exemple.tn et organisations « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const projet = require('./projet');
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
  for (const [k, kind, nom] of [['M', 'MARQUE', 'Marque Datte'], ['A', 'AGENCE_MARKETING', 'Agence Gamma'], ['P', 'BOITE_PROD', 'Prod Delta']]) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${nom} ${st}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.t161.${k.toLowerCase()}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: nom, role: kind, agencyId: o, password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + c.s);
    acc[k] = { email, pw, o, nom: `Recette ${nom} ${st}`, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  // Mise en place par l'API : demande envoyée et acceptée
  const id = await projet(j, { prodTk: acc.P.tk, title: 'Recette Dattes de Tozeur ' + st, brand: acc.M.email, agency: acc.A.email });
  await j(`/demandes/${id}/v0`, { method: 'PUT', body: JSON.stringify({ body: 'Une caravane au coucher du soleil, des dattes partagées.' }) }, acc.M.tk);
  await j(`/demandes/${id}/envoyer`, { method: 'POST', body: '{}' }, acc.M.tk);
  await j(`/demandes/${id}/accepter`, { method: 'POST' }, acc.A.tk);
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  // Agence : écrit et livre la V1
  const a = await login(b, acc.A);
  await a.goto(BASE + '/demandes/' + id + '/historique'); await a.waitForTimeout(1500);
  res.titreEditeur = await a.locator('.answer h2').first().innerText();
  await a.fill('textarea[name=v1]', 'Concept : le désert raconte la datte. 30 secondes, voix off, lumière dorée.');
  await a.getByRole('button', { name: /^Livrer la V1/ }).click(); await a.waitForTimeout(1500);
  res.livraison = await a.locator('.ok').innerText().catch(() => '');
  // Marque : demande une révision
  const m = await login(b, acc.M);
  await m.goto(BASE + '/demandes/' + id + '/historique'); await m.waitForTimeout(1500);
  res.marqueVoitV1 = (await m.locator('.card .body').first().innerText()).slice(0, 40);
  await m.getByRole('button', { name: 'Demander une révision…' }).click();
  res.revisionVideBloquee = !(await m.getByRole('button', { name: 'Envoyer la demande de révision' }).isEnabled());
  await m.fill('textarea[name=comment]', 'Montrez la famille, pas seulement le désert');
  await m.getByRole('button', { name: 'Envoyer la demande de révision' }).click(); await m.waitForTimeout(1500);
  res.revision = await m.locator('.ok').innerText().catch(() => '');
  // Agence : V1.1 avec le commentaire affiché, texte repris
  await a.goto(BASE + '/demandes/' + id + '/historique'); await a.waitForTimeout(1500);
  res.titreV11 = await a.locator('.answer h2').first().innerText();
  res.commentaireVu = await a.locator('.answer .warn').innerText().catch(() => '');
  res.texteRepris = (await a.inputValue('textarea[name=v1]')).slice(0, 30);
  await a.fill('textarea[name=v1]', 'Concept : une famille partage les dattes au coucher du soleil, dans le désert.');
  await a.screenshot({ path: path.join(OUT, 'v2-v1-revision.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  await a.getByRole('button', { name: /^Livrer la V1\.1/ }).click(); await a.waitForTimeout(1500);
  // Marque : valide
  await m.goto(BASE + '/demandes/' + id + '/historique'); await m.waitForTimeout(1500);
  await m.getByRole('button', { name: 'Valider la V1.1' }).click(); await m.waitForTimeout(1500);
  res.validation = await m.locator('.ok').innerText().catch(() => '');
  // La production du projet (le producer qui l'a créé) prend la main dès la V1 validée : l'agence n'a plus rien à choisir
  await a.goto(BASE + '/demandes/' + id + '/historique'); await a.waitForTimeout(1500);
  res.agenceChoixProduction = await a.locator('app-select[name=prod]').count();
  if (res.agenceChoixProduction) throw new Error('ÉCHEC : l’agence choisit encore la production');
  res.etape = await a.locator('.steps .now').innerText();
  res.maintenant = await a.locator('.now-card p').innerText();
  // Production : voit la publicité dans « Publicités »
  const p = await login(b, acc.P);
  res.menuProd = await p.locator('nav a, .nav-item').allInnerTexts().catch(() => []);
  await p.goto(BASE + '/mes-demandes'); await p.waitForTimeout(1500);
  res.listeProd = await p.locator('.list li').count();
  await p.locator('.list a').first().click(); await p.waitForURL(/\/demandes\//); await p.waitForTimeout(1500);
  res.prodVersions = await p.locator('.card h2').allInnerTexts();
  await p.screenshot({ path: path.join(OUT, 'v2-production.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  res.journal = await p.locator('.journal li span').allInnerTexts();
  res.erreurs = [...m.errs, ...a.errs, ...p.errs];
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
