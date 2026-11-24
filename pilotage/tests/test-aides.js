// P-085 · Les aides de la fiche : choix rapides, modèle, exemple, IA, enregistrer et suivant, tout accepter, rôles types, copier.
// Comptes recette.*@exemple.tn et organisations « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const projet = require('./projet');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
async function login(b, a, vp) {
  const ctx = await b.newContext({ viewport: vp, colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'] }); const p = await ctx.newPage(); p.setDefaultTimeout(10000);
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
  const today = new Date().toISOString().slice(0, 10), st = Date.now(), acc = {}, res = { etapes: [], erreurs: [] };
  const ok = (c, m) => { res.etapes.push((c ? 'OK  ' : 'KO  ') + m); if (!c) res.erreurs.push(m); };
  for (const [k, kind, nom] of [['M', 'MARQUE', 'Marque Aides'], ['A', 'AGENCE_MARKETING', 'Agence Aides'], ['P', 'BOITE_PROD', 'Prod Aides']]) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${nom} ${st}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.aides.${k.toLowerCase()}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: nom.split(' ')[0], role: kind, agencyId: o, password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + c.s);
    acc[k] = { email, pw, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  const id = await projet(j, { prodTk: acc.P.tk, title: 'Spot aides', brand: acc.M.email, agency: acc.A.email });
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  const m = await login(b, acc.M, { width: 1400, height: 950 });
  await m.goto(BASE + '/demandes/' + id); await m.waitForSelector('app-fiche .hero', { timeout: 15000 }); await m.waitForTimeout(1200);
  ok(await m.locator('.hero-tools button', { hasText: 'Continuer' }).count() === 1, 'l’état des lieux propose « Continuer : » vers le prochain champ obligatoire');

  // Champ vide : un clic sur un choix rapide ouvre le champ déjà rempli
  const tonF = m.locator('#etape-brief .f', { hasText: 'Ton souhaité' });
  await tonF.scrollIntoViewIfNeeded(); await tonF.locator('.quick.mini .qchip', { hasText: 'Chaleureux' }).click();
  ok((await tonF.locator('input').inputValue()) === 'Chaleureux', 'un choix rapide sur un champ vide ouvre l’édition pré-remplie');
  await tonF.locator('.qchip', { hasText: 'Premium' }).click();
  ok((await tonF.locator('input').inputValue()) === 'Chaleureux, Premium', 'les choix se cumulent (Chaleureux, Premium)');
  await tonF.locator('.qchip', { hasText: 'Chaleureux' }).click();
  ok((await tonF.locator('input').inputValue()) === 'Premium', 'un second clic décoche');
  ok((await tonF.locator('.qchip[aria-pressed="true"]').count()) === 1, 'le choix coché est marqué');
  await m.screenshot({ path: path.join(OUT, 'aides-ton.png') });
  await tonF.locator('input').press('Control+Enter'); await m.waitForTimeout(900);
  ok((await tonF.locator('.val').innerText()).includes('Premium'), 'Ctrl + Entrée enregistre');

  // Cible : modèle et exemple, Échap annule
  const cible = m.locator('#etape-brief .f', { hasText: 'Cible' });
  await cible.getByRole('button', { name: 'Remplir Cible' }).click();
  await cible.getByRole('button', { name: 'Insérer le modèle' }).click();
  ok((await cible.locator('textarea').inputValue()).startsWith('Qui : …'), 'le modèle s’insère');
  await cible.getByRole('button', { name: 'Revenir à mon texte' }).click();
  ok((await cible.locator('textarea').inputValue()) === '', '« Revenir à mon texte » annule le modèle');
  await cible.getByRole('button', { name: 'Voir un exemple' }).click();
  ok(await cible.locator('.ex').count() === 1, 'un exemple s’affiche');
  await cible.getByRole('button', { name: 'Partir de cet exemple' }).click();
  ok((await cible.locator('textarea').inputValue()).startsWith('Familles'), 'l’exemple sert de point de départ');
  // L'IA rédige
  const t0 = Date.now();
  await cible.locator('.tool.ai').click();
  await cible.locator('.ai-note').waitFor({ timeout: 100000 }).catch(() => {});
  res.dureeIA = Math.round((Date.now() - t0) / 1000) + ' s';
  res.noteIA = await cible.locator('.ai-note').innerText().catch(() => '');
  res.texteIA = (await cible.locator('textarea').inputValue()).slice(0, 300);
  ok(res.noteIA.length > 0, 'le bouton IA répond (' + res.dureeIA + ')');
  await m.screenshot({ path: path.join(OUT, 'aides-ia.png') });
  // Enregistrer et passer au suivant
  await cible.getByRole('button', { name: 'Enregistrer et passer au suivant' }).click(); await m.waitForTimeout(1300);
  const ed = await m.locator('#etape-brief .f.editing dt').innerText().catch(() => '');
  ok(/Message clé/.test(ed), '« Enregistrer et passer au suivant » ouvre le champ vide suivant (' + ed.split('\n')[0] + ')');
  await m.keyboard.press('Escape'); await m.waitForTimeout(300);
  ok(await m.locator('#etape-brief .f.editing').count() === 0, 'Échap ferme le champ');

  // Diffusion : supports, puis format et durée déduits
  const sup = m.locator('#etape-diffusion .f', { hasText: 'Supports' });
  await sup.scrollIntoViewIfNeeded(); await sup.getByRole('button', { name: /Remplir Supports/ }).click();
  for (const c of ['Télévision', 'Instagram']) await sup.locator('.qchip', { hasText: c }).click();
  await sup.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await m.waitForTimeout(900);
  const dur = m.locator('#etape-diffusion .f', { hasText: 'Durée' });
  await dur.getByRole('button', { name: /Remplir Durée/ }).click();
  const hint = await dur.locator('.tool.hint').innerText().catch(() => '');
  ok(/30 s/.test(hint) && /15 s/.test(hint), 'la durée est suggérée d’après les supports (' + hint + ')');
  await dur.locator('.tool.hint').click(); await dur.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await m.waitForTimeout(900);
  await m.locator('#etape-diffusion').screenshot({ path: path.join(OUT, 'aides-diffusion.png') });

  // Copier le chapitre
  await m.locator('#etape-brief .st-tools .tool', { hasText: 'Copier le chapitre' }).click(); await m.waitForTimeout(400);
  const clip = await m.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(/01 Le brief|01 /.test(clip) && clip.includes('Premium'), 'le chapitre se copie en texte');

  // Le producer : rôles types, tranche d'âge, dupliquer
  const p = await login(b, acc.P, { width: 1400, height: 950 });
  await j(`/demandes/${id}/fiche/champs/objectif`, { method: 'PUT', body: JSON.stringify({ value: 'Faire connaître' }) }, acc.P.tk);
  await p.goto(BASE + '/demandes/' + id); await p.waitForSelector('app-fiche .hero'); await p.waitForTimeout(1000);
  await p.locator('#etape-roles').scrollIntoViewIfNeeded(); await p.locator('#etape-roles .add-role').click();
  await p.locator('.role-form .qchip', { hasText: 'La grand-mère' }).click();
  ok((await p.locator('.role-form input[name=rn]').inputValue()) === 'La grand-mère' && (await p.locator('.role-form input[name=ra]').inputValue()) === '60', 'un rôle type remplit nom, sexe et âge');
  await p.locator('.role-form .qchip', { hasText: 'Émotion retenue' }).click();
  await p.locator('.role-form .qchip', { hasText: '65+' }).click();
  ok((await p.locator('.role-form input[name=ra]').inputValue()) === '65', 'une tranche d’âge en un clic');
  await p.locator('#etape-roles').screenshot({ path: path.join(OUT, 'aides-roles.png') });
  await p.getByRole('button', { name: 'Enregistrer le rôle' }).click(); await p.waitForTimeout(1000);
  await p.locator('#etape-roles .edit-btn', { hasText: 'Dupliquer' }).first().click(); await p.waitForTimeout(1000);
  ok(await p.locator('#etape-roles .role').count() === 2, 'dupliquer un rôle');
  res.erreursJs = [...m.errs, ...p.errs];
  ok(!res.erreursJs.length, 'aucune erreur JavaScript');
  await b.close();
  fs.writeFileSync(path.join(OUT, 'test-aides.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
})().catch(e => { console.error('ECHEC', e.message); process.exit(1); });
