// P-083 · Fiche unique du projet : trois rôles, un brief déposé, l'IA remplit et propose.
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
    const email = `recette.fiche.${k.toLowerCase()}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: { M: 'Salma', A: 'Karim', P: 'Yasmine' }[k], lastName: nom.split(' ')[0], role: kind, agencyId: o, password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + c.s);
    acc[k] = { email, pw, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  const id = await projet(j, { prodTk: acc.P.tk, title: 'Huile Zitouna, nouvelle bouteille', brand: acc.M.email, agency: acc.A.email });
  const file = path.join(OUT, `brief-zitouna-${st}.txt`); fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(file, BRIEF);

  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  // ── La marque, sur téléphone, dépose son brief ──
  const m = await login(b, acc.M); await m.setViewportSize({ width: 390, height: 844 });
  await m.goto(BASE + '/demandes/' + id + '/fiche'); await m.waitForSelector('app-fiche .hero', { timeout: 15000 });
  await m.waitForTimeout(1200); await m.screenshot({ path: path.join(OUT, 'fiche-marque-haut.png') });
  ok(await m.locator('app-fiche .stage').count() === 7, 'sept étapes affichées');
  ok((await m.locator('#etape-brief .owner').innerText()).includes('Votre étape'), 'la marque voit le brief comme son étape');
  ok((await m.locator('#etape-concept .edit-btn').count()) === 0, 'la marque ne peut pas modifier le concept');
  const t0 = Date.now();
  await m.locator('app-fiche app-dropzone input[type=file]').setInputFiles(file);
  await m.locator('app-fiche .sources li[data-st="LECTURE"]').first().waitFor({ timeout: 8000 }).catch(() => {});
  ok(await m.locator('app-fiche .sources li').count() > 0, 'le document apparaît « L’IA lit le document »');
  await m.screenshot({ path: path.join(OUT, 'fiche-marque-lecture.png') });
  await m.locator('app-fiche .sources li[data-st="FAIT"], app-fiche .sources li[data-st="ECHEC"]').first().waitFor({ timeout: 240000 });
  res.dureeIA = Math.round((Date.now() - t0) / 1000) + ' s';
  res.resultat = (await m.locator('app-fiche .sources li').first().innerText()).replace(/\s+/g, ' ');
  ok((await m.locator('app-fiche .sources li').first().getAttribute('data-st')) === 'FAIT', 'lecture terminée');
  await m.waitForTimeout(800);
  const cible = await m.locator('#etape-brief .f', { hasText: 'Cible' }).locator('.val').innerText().catch(() => '');
  ok(/famille/i.test(cible), 'la cible du brief est remplie sans saisie (' + cible.slice(0, 40) + ')');
  ok(await m.locator('#etape-brief .ai-tag').count() > 0, 'les champs remplis portent « Rempli par l’IA »');
  await m.locator('#etape-brief').scrollIntoViewIfNeeded(); await m.waitForTimeout(700);
  await m.screenshot({ path: path.join(OUT, 'fiche-marque-brief.png') });

  // ── L'agence, sur ordinateur : la fiche s'est préparée pour elle ──
  const a = await login(b, acc.A); await a.setViewportSize({ width: 1500, height: 950 });
  await a.goto(BASE + '/demandes/' + id + '/fiche'); await a.waitForSelector('app-fiche .hero'); await a.waitForTimeout(1500);
  await a.screenshot({ path: path.join(OUT, 'fiche-agence-haut.png') });
  const sugg = await a.locator('#etape-concept .sugg').count();
  ok(sugg >= 1, `l'agence reçoit ${sugg} proposition(s) pour son concept`);
  await a.locator('#etape-concept').scrollIntoViewIfNeeded(); await a.waitForTimeout(900);
  await a.screenshot({ path: path.join(OUT, 'fiche-agence-concept.png') });
  if (sugg) {
    await a.locator('#etape-concept .sugg').first().getByRole('button', { name: 'Accepter' }).click(); await a.waitForTimeout(1200);
    ok(await a.locator('#etape-concept .sugg').count() === sugg - 1, 'une proposition acceptée en un clic');
  }
  ok(await a.locator('app-page-rail li').count() >= 8, 'le sommaire liste l’état des lieux et les étapes');

  // ── Le producer : l'identité du projet l'attend ──
  const p = await login(b, acc.P); await p.setViewportSize({ width: 1500, height: 950 });
  await p.goto(BASE + '/demandes/' + id + '/fiche'); await p.waitForSelector('app-fiche .hero'); await p.waitForTimeout(1200);
  ok(await p.locator('#etape-identite .sugg').count() >= 2, 'le producer reçoit les propositions de l’identité (produit, durée, supports…)');
  ok(await p.locator('#etape-production .sugg').count() >= 1, 'et celle des lieux de tournage');
  await p.locator('#etape-identite').scrollIntoViewIfNeeded(); await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(OUT, 'fiche-producer-identite.png') });
  ok((await j('/me/notifications', {}, acc.P.tk)).b.items.some(n => /pré-rempli/.test(n.title)), 'le producer est prévenu dans sa cloche');
  // Modifier en place
  await p.locator('#etape-production .f', { hasText: 'Dates de tournage' }).getByRole('button', { name: /Remplir/ }).click();
  await p.locator('#etape-production .edit input').fill('du 12 au 14 mars 2027');
  await p.locator('#etape-production .edit').getByRole('button', { name: 'Enregistrer' }).click(); await p.waitForTimeout(1000);
  ok((await p.locator('#etape-production .f', { hasText: 'Dates de tournage' }).locator('.val').innerText()).includes('12 au 14'), 'le producer remplit les dates en place');
  // La marque voit la mise à jour sans recharger
  const vu = await m.locator('#etape-production .f', { hasText: 'Dates de tournage' }).locator('.val').filter({ hasText: '12 au 14' }).waitFor({ timeout: 25000 }).then(() => true).catch(() => false);
  ok(vu, 'la marque voit les dates du producer sans recharger');
  await p.evaluate(() => document.querySelector('.content')?.scrollTo({ top: 0 }));
  await p.waitForTimeout(600); await p.screenshot({ path: path.join(OUT, 'fiche-producer-haut.png') });
  // API : refus hors de son étape
  ok((await j(`/demandes/${id}/fiche/champs/idee`, { method: 'PUT', body: JSON.stringify({ value: 'x' }) }, acc.M.tk)).s === 403, 'la marque ne modifie pas le concept (403)');
  for (const x of [m, a, p]) if (x.errs.length) res.erreurs.push('erreur JS : ' + x.errs[0]);
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(res.erreurs.length ? 1 : 0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
