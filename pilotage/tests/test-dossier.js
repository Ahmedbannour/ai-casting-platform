// P-084 · Le dossier unique du film, de bout en bout : brief → recommandation (avec retour) → préparation → room.
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
const BRIEF = `BRIEF CRÉATIF — Huile Zitouna
Produit : Huile d'olive extra vierge Zitouna, bouteille 75 cl
Objectif : faire connaître la nouvelle bouteille et rassurer sur l'origine tunisienne
Cible : Familles tunisiennes, 30 à 50 ans, qui cuisinent tous les jours
Message clé : l'huile de nos grands-mères, dans une bouteille d'aujourd'hui
Ton : chaleureux, familial, lumineux
Durée : 30 secondes, puis une version 15 s
Supports de diffusion : télévision nationale, Instagram, Facebook
Date de diffusion : 15/03/2027
Mentions obligatoires : logo en fin de film, « produit de Tunisie »
Concept : trois générations autour d'un olivier centenaire, la bouteille passe de main en main
Slogan : Zitouna, le goût qui nous relie
Lieux de tournage : oliveraie de Sfax, cuisine traditionnelle à Tunis`;

(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const today = new Date().toISOString().slice(0, 10), st = Date.now(), acc = {}, res = { etapes: [], erreurs: [] };
  const ok = (c, m) => { res.etapes.push((c ? 'OK  ' : 'KO  ') + m); if (!c) res.erreurs.push(m); };
  for (const [k, kind, nom] of [['M', 'MARQUE', 'Marque Zitouna'], ['A', 'AGENCE_MARKETING', 'Agence Nour'], ['P', 'BOITE_PROD', 'Studio Atlas']]) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${nom} ${st}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.dossier.${k.toLowerCase()}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: { M: 'Salma', A: 'Karim', P: 'Yasmine' }[k], lastName: nom.split(' ')[0], role: kind, agencyId: o, password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + c.s);
    acc[k] = { email, pw, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  const id = await projet(j, { prodTk: acc.P.tk, title: 'Huile Zitouna, nouvelle bouteille', brand: acc.M.email, agency: acc.A.email });
  const file = path.join(OUT, `brief-dossier-${st}.txt`); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(file, BRIEF);
  const shot = async (p, n) => p.screenshot({ path: path.join(OUT, `dossier-${n}.png`) });
  const gate = async p => (await p.locator('app-fiche .gate h2').innerText().catch(() => '')).trim();
  const waitGate = async (p, title, ms = 30000) => p.locator('app-fiche .gate h2', { hasText: title }).waitFor({ timeout: ms }).then(() => true).catch(() => false);
  const click = async (p, name) => { await p.getByRole('button', { name }).first().click(); await p.waitForTimeout(1200); };

  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  const P = await login(b, acc.P); await P.setViewportSize({ width: 1500, height: 950 });
  const M = await login(b, acc.M); await M.setViewportSize({ width: 390, height: 844 });
  const A = await login(b, acc.A); await A.setViewportSize({ width: 1500, height: 950 });

  // 1. Le producer ouvre le projet : c'est le dossier, en phase brief
  await P.goto(BASE + '/demandes/' + id); await P.waitForSelector('app-fiche .gate', { timeout: 15000 }); await P.waitForTimeout(1200);
  ok(await gate(P) === 'Le brief', 'la page projet est le dossier, phase « Le brief »');
  ok(await P.locator('app-fiche .stage').count() === 7, 'sept chapitres');
  ok(await P.locator('text=V0').count() === 0, 'plus aucune mention de V0 sur la page');
  ok(await P.getByRole('button', { name: /Transmettre le brief/ }).isDisabled(), 'transmission bloquée tant que le brief est incomplet');
  await A.goto(BASE + '/demandes/' + id); await A.waitForSelector('app-fiche .gate', { timeout: 15000 });   // l'agence garde la page ouverte
  await shot(P, '1-producer-brief');

  // 2. La marque, sur téléphone, dépose son brief et le transmet
  await M.goto(BASE + '/demandes/' + id); await M.waitForSelector('app-fiche .gate', { timeout: 15000 });
  await M.locator('app-fiche app-dropzone input[type=file]').setInputFiles(file);
  const t0 = Date.now();
  await M.locator('app-fiche .sources li[data-st="FAIT"], app-fiche .sources li[data-st="ECHEC"]').first().waitFor({ timeout: 240000 });
  res.lectureIA = Math.round((Date.now() - t0) / 1000) + ' s';
  await M.waitForTimeout(1000);
  ok(/famille/i.test(await M.locator('#etape-brief .f', { hasText: 'Cible' }).locator('.val').innerText().catch(() => '')), 'le brief s’est rempli depuis le document');
  await M.locator('app-fiche .gate').scrollIntoViewIfNeeded(); await shot(M, '2-marque-brief-pret');
  await click(M, /Transmettre le brief/);
  ok(await waitGate(M, 'La recommandation créative', 10000), 'brief transmis : phase recommandation');

  // 3. L'agence voit la phase changer sans recharger, reprend la proposition de l'IA et présente
  ok(await waitGate(A, 'La recommandation créative', 25000), 'l’agence voit le brief arriver sans recharger');
  ok(await A.locator('app-fiche .gate .go.big').count() === 1, 'l’agence a le bouton « Présenter »');
  await A.locator('#etape-concept').scrollIntoViewIfNeeded(); await A.waitForTimeout(800); await shot(A, '3-agence-concept');
  const sugg = A.locator('#etape-concept .f', { hasText: 'L\'idée' }).locator('.sugg');
  if (await sugg.count()) await sugg.getByRole('button', { name: 'Accepter' }).click(); else {
    await A.locator('#etape-concept .f', { hasText: 'L\'idée' }).getByRole('button', { name: /Remplir/ }).click();
    await A.locator('#etape-concept .edit textarea').fill('Trois générations autour d’un olivier'); await A.locator('#etape-concept .edit').getByRole('button', { name: 'Enregistrer' }).click();
  }
  await A.waitForTimeout(1000);
  const der = A.locator('#etape-concept .f', { hasText: 'Déroulé du film' });
  if (await der.locator('.sugg').count()) await der.locator('.sugg').getByRole('button', { name: 'Accepter' }).click();
  else { await der.getByRole('button', { name: /Remplir|Modifier/ }).click(); await A.locator('#etape-concept .edit textarea').fill('La bouteille passe de main en main, du matin au dîner.'); await A.locator('#etape-concept .edit').getByRole('button', { name: 'Enregistrer' }).click(); }
  await A.waitForTimeout(1000);
  await A.locator('app-fiche .gate').scrollIntoViewIfNeeded(); await click(A, /Présenter la recommandation/);
  ok(await waitGate(A, 'La validation de la marque', 10000), 'recommandation présentée : la marque a la main');
  ok(await A.locator('app-fiche .gate .wait').count() === 1, 'l’agence voit « En attente : la marque »');

  // 4. La marque demande une modification, puis valide la nouvelle présentation
  ok(await waitGate(M, 'La validation de la marque', 20000), 'la marque voit la validation sans recharger');
  await M.locator('app-fiche .gate').scrollIntoViewIfNeeded(); await shot(M, '4-marque-valider');
  await click(M, 'Demander des modifications');
  await M.locator('#ask-c').fill('Montrez la famille au réveil, moins de paysage.');
  await click(M, 'Envoyer à l\'agence');
  ok(await waitGate(A, 'La recommandation créative', 20000), 'l’agence reçoit le retour');
  ok((await A.locator('app-fiche .gate .fb').innerText().catch(() => '')).includes('famille au réveil'), 'le retour de la marque est affiché dans la phase');
  await A.locator('app-fiche .gate').scrollIntoViewIfNeeded(); await shot(A, '5-agence-retour');
  await click(A, /Présenter la recommandation/);
  ok(await waitGate(M, 'La validation de la marque', 20000), 'nouvelle présentation reçue');
  await click(M, 'Valider la recommandation');
  ok(await waitGate(M, 'La préparation', 10000), 'recommandation validée : préparation');

  // 5. Le producer prépare : rôle écrit dans le dossier, puis lancement du casting
  ok(await waitGate(P, 'La préparation', 25000), 'le producer voit la préparation sans recharger');
  await P.locator('#etape-roles').scrollIntoViewIfNeeded(); await click(P, '+ Ajouter un rôle');
  await P.locator('.role-form input[name=rn]').fill('La grand-mère');
  await P.locator('.role-form textarea[name=ri]').fill('Une femme solaire, des mains qui racontent une vie de récoltes.');
  await P.locator('.role-form select[name=rg]').selectOption('Femme');
  await P.locator('.role-form input[name=ra]').fill('60'); await P.locator('.role-form input[name=rb]').fill('78');
  await click(P, 'Enregistrer le rôle');
  ok((await P.locator('#etape-roles .role').first().innerText()).includes('60 à 78 ans'), 'rôle enregistré dans le dossier');
  await P.locator('#etape-roles').scrollIntoViewIfNeeded(); await P.waitForTimeout(600); await shot(P, '6-producer-roles');
  await P.locator('app-fiche .gate').scrollIntoViewIfNeeded(); await click(P, 'Lancer le casting');
  ok(await waitGate(P, 'Le casting', 10000), 'casting lancé');
  const roomLink = P.getByRole('link', { name: 'Ouvrir la room de casting' });
  ok(await roomLink.count() === 1, 'lien vers la room');
  await shot(P, '7-producer-casting');
  await roomLink.click(); await P.waitForURL(/\/rooms\//, { timeout: 10000 }); await P.waitForSelector('app-fiche .gate', { timeout: 15000 }); await P.waitForTimeout(1000);
  ok(await P.locator('.tabs button', { hasText: 'Swipe' }).count() === 1, 'la room est ouverte, dossier en premier onglet');
  await shot(P, '8-room-dossier');
  ok((await j('/me/notifications', {}, acc.A.tk)).b.items.some(n => /modifications demandées/i.test(n.title)), 'l’agence a été prévenue du retour');
  for (const x of [P, M, A]) if (x.errs.length) res.erreurs.push('erreur JS : ' + x.errs[0]);
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(res.erreurs.length ? 1 : 0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
