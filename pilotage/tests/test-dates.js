// P-086 · Les dates de la fiche au calendrier : diffusion (un jour), tournage (une période), alertes et rétroplanning.
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
  const iso = n => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  for (const [k, kind, nom] of [['M', 'MARQUE', 'Marque Dates'], ['A', 'AGENCE_MARKETING', 'Agence Dates'], ['P', 'BOITE_PROD', 'Prod Dates']]) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${nom} ${st}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.dates.${k.toLowerCase()}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: nom.split(' ')[0], role: kind, agencyId: o, password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + c.s);
    acc[k] = { email, pw, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  const id = await projet(j, { prodTk: acc.P.tk, title: 'Spot dates', brand: acc.M.email, agency: acc.A.email });
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  const p = await login(b, acc.P, { width: 1400, height: 950 });
  await p.goto(BASE + '/demandes/' + id); await p.waitForSelector('app-fiche .hero', { timeout: 15000 }); await p.waitForTimeout(1000);
  const day = async (scope, d) => {
    for (let i = 0; i < 14 && !(await scope.locator(`button.d[data-iso="${d}"]`).count()); i++) {
      const first = await scope.locator('button.d').first().getAttribute('data-iso');
      await scope.getByRole('button', { name: d < first ? 'Mois précédent' : 'Mois suivant' }).click();
    }
    await scope.locator(`button.d[data-iso="${d}"]`).click();
  };

  // Diffusion : un raccourci, puis un jour dans le calendrier
  const dif = p.locator('#etape-diffusion .f', { hasText: 'Date de diffusion' });
  await dif.scrollIntoViewIfNeeded(); await dif.getByRole('button', { name: /Remplir Date de diffusion/ }).click();
  ok(await dif.locator('app-calendar .d').count() >= 56, 'le calendrier s’affiche dans la fiche, deux mois côte à côte');
  await dif.locator('.qchip', { hasText: '3 mois' }).click();
  ok((await dif.locator('.when-big').innerText()).includes('dans 91 jours'), 'raccourci « 3 mois » : la date et le compte à rebours s’affichent');
  const D = iso(100); await day(dif, D);
  ok(await dif.locator(`button.d[data-iso="${D}"].s`).count() === 1, 'un clic choisit le jour');
  await dif.screenshot({ path: path.join(OUT, 'dates-diffusion.png') });
  await dif.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await p.waitForTimeout(900);
  ok((await dif.locator('.date-note').innerText()).includes('dans 100 jours'), 'la date enregistrée montre « dans 100 jours »');

  // Tournage : premier jour, dernier jour, réserve météo, alerte
  const tr = p.locator('#etape-production .f', { hasText: 'Dates de tournage' });
  await tr.scrollIntoViewIfNeeded(); await tr.getByRole('button', { name: /Remplir Dates de tournage/ }).click();
  ok(await tr.locator(`button.d[data-iso="${D}"] .mk i[data-tone="danger"]`).count() === 1 || await tr.locator('.legend', { hasText: 'Diffusion' }).count() === 1, 'la diffusion apparaît en repère dans le calendrier du tournage');
  const S = iso(60), E = iso(62);
  await day(tr, S);
  ok((await tr.locator('app-calendar .status').innerText()).includes('Cliquez le dernier jour'), 'après le premier jour, le calendrier demande le dernier');
  await tr.locator(`button.d[data-iso="${E}"]`).hover(); await p.waitForTimeout(150);
  ok(await tr.locator('button.d.pv').count() >= 2, 'la période s’affiche au survol avant le second clic');
  await tr.locator(`button.d[data-iso="${E}"]`).click();
  ok((await tr.locator('.when-big').innerText()).includes('3 jours de tournage'), 'premier et dernier jour : « 3 jours de tournage »');
  ok(await tr.locator('button.d.in').count() === 1, 'le ruban couvre la période');
  await tr.locator('.qchip', { hasText: 'réserve météo' }).click();
  ok((await tr.locator('.when-big').innerText()).includes('4 jours'), '+ 1 jour de réserve météo');
  await tr.locator('.qchip', { hasText: /^2 jours$/ }).click();
  ok((await tr.locator('.when-big').innerText()).includes('2 jours'), 'raccourci « 2 jours » depuis le premier jour');
  await day(tr, iso(90)); await tr.locator(`button.d[data-iso="${iso(92)}"]`).click();
  const warn = await tr.locator('.warn').innerText().catch(() => '');
  ok(/jours entre la fin du tournage et la diffusion/.test(warn), 'alerte : trop peu de temps avant la diffusion (' + warn.slice(0, 50) + '…)');
  await tr.screenshot({ path: path.join(OUT, 'dates-tournage.png') });
  await day(tr, S); await tr.locator(`button.d[data-iso="${E}"]`).click();
  // Clavier : flèche droite puis Entrée déplace la fin
  await tr.locator(`button.d[data-iso="${E}"]`).focus(); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.activeElement?.getAttribute('data-iso')) === iso(63), 'les flèches du clavier déplacent le jour');
  await tr.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await p.waitForTimeout(900);
  const shown = await tr.locator('.val').innerText();
  ok(/^Du .+ au .+/.test(shown) && (await tr.locator('.date-note').innerText()).includes('3 jours'), 'enregistré : « ' + shown + ' · 3 jours »');
  const api = (await j(`/demandes/${id}/fiche`, {}, acc.P.tk)).b.stages.find(x => x.key === 'production').fields.find(x => x.key === 'dates_tournage').value;
  ok(api === `${S}/${E}`, 'la période est stockée proprement (' + api + ')');

  // Planning : le rétroplanning se construit d'après les dates
  const pl = p.locator('#etape-production .f', { hasText: 'Planning' });
  await pl.getByRole('button', { name: /Remplir Planning/ }).click();
  await pl.locator('.tool.hint', { hasText: 'rétroplanning' }).click();
  const txt = await pl.locator('textarea').inputValue();
  ok(/Casting et repérages/.test(txt) && /PPM/.test(txt) && /Livraison/.test(txt) && /Première diffusion/.test(txt), 'le rétroplanning se remplit en un clic');
  res.retroplanning = txt;
  await pl.screenshot({ path: path.join(OUT, 'dates-planning.png') });
  await pl.getByRole('button', { name: 'Annuler' }).click();

  // Téléphone : un mois à la fois
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
  await dif.getByRole('button', { name: /Modifier Date de diffusion/ }).click(); await p.waitForTimeout(400);
  ok(await dif.locator('app-calendar .month').count() === 1, 'sur téléphone, un seul mois à la fois');
  await dif.screenshot({ path: path.join(OUT, 'dates-mobile.png') });
  res.erreursJs = p.errs; ok(!p.errs.length, 'aucune erreur JavaScript');
  await b.close();
  fs.writeFileSync(path.join(OUT, 'test-dates.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
})().catch(e => { console.error('ECHEC', e.message); process.exit(1); });
