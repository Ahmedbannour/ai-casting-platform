// P-087 · Fiche : agent de lecture (vraie présentation), planning précis, équipe technique par lien, documents, affichage par rôle.
// Comptes recette.*@exemple.tn et organisations « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const projet = require('./projet');
const fs = require('fs'), path = require('path'), os = require('os');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { ...(opt.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
async function login(b, a, vp) {
  const ctx = await b.newContext({ viewport: vp, colorScheme: 'dark', permissions: ['clipboard-read', 'clipboard-write'] }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
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
  for (const [k, kind, nom] of [['M', 'MARQUE', 'Marque P87'], ['A', 'AGENCE_MARKETING', 'Agence P87'], ['P', 'BOITE_PROD', 'Prod P87']]) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${nom} ${st}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.p87.${k.toLowerCase()}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: nom.split(' ')[0], role: kind, agencyId: o, password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + c.s);
    acc[k] = { email, pw, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  const id = await projet(j, { prodTk: acc.P.tk, title: 'Golden Coffee', brand: acc.M.email, agency: acc.A.email });
  const base = `/demandes/${id}/fiche`;

  // ── 1. L'agent lit la vraie présentation ──
  const dl = path.join(os.homedir(), 'Downloads');
  const gc = fs.readdirSync(dl).find(f => f.startsWith('Golden Coffee') && f.endsWith('.pdf'));
  if (gc) {
    const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(path.join(dl, gc))], { type: 'application/pdf' }), gc);
    const t0 = Date.now(); const up = await j(base + '/sources', { method: 'POST', body: fd }, acc.P.tk);
    ok(up.s === 200, 'dépôt de « ' + gc + ' » (' + up.s + ')');
    let src = null, steps = new Set();
    for (let i = 0; i < 300; i++) {
      const f = (await j(base, {}, acc.P.tk)).b; src = f.sources[0];
      if (src.status === 'LECTURE' && src.message) steps.add(src.message);
      if (src.status !== 'LECTURE') break;
      await new Promise(r => setTimeout(r, 2000));
    }
    res.agent = { duree: Math.round((Date.now() - t0) / 1000) + ' s', statut: src.status, moteur: src.engine, caracteres: src.chars, remplis: src.filled, propositions: src.proposed, message: src.message, progression: [...steps] };
    const f = (await j(base, {}, acc.P.tk)).b; res.champs = {};
    for (const s of f.stages) for (const x of s.fields || []) if (x.value || x.suggestion) res.champs[x.key] = (x.value ? '' : '(proposé) ') + (x.value || x.suggestion);
    ok(src.status === 'FAIT' && src.engine === 'IA', 'l’agent a lu le document avec l’IA (' + res.agent.duree + ')');
    ok(src.filled + src.proposed >= 4, `l’agent a trouvé ${src.filled + src.proposed} informations (avant : 0)`);
    ok(src.hasFile, 'le document est conservé');
  } else ok(false, 'présentation Golden Coffee introuvable dans Téléchargements');

  // Dates du film pour le planning
  const iso = n => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  await j(base + '/champs/dates_tournage', { method: 'PUT', body: JSON.stringify({ value: `${iso(45)}/${iso(46)}` }) }, acc.P.tk);
  await j(base + '/champs/diffusion', { method: 'PUT', body: JSON.stringify({ value: iso(80) }) }, acc.P.tk);

  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  const p = await login(b, acc.P, { width: 1440, height: 950 });
  await p.goto(BASE + '/demandes/' + id); await p.waitForSelector('app-fiche .hero'); await p.waitForTimeout(1200);

  // ── 2. Documents : voir, partager ──
  const docs = p.locator('#documents');
  await docs.scrollIntoViewIfNeeded();
  ok(await docs.locator('app-dropzone').count() === 1, 'le producer peut déposer');
  if (gc) {
    await docs.locator('.doc .ic[title="Partager"]').first().click();
    await docs.locator('.d-share a', { hasText: 'WhatsApp' }).waitFor({ timeout: 8000 }).catch(() => {});
    const wa = await docs.locator('.d-share a', { hasText: 'WhatsApp' }).getAttribute('href').catch(() => '');
    ok(/wa\.me.*api%2Fpublic%2Ffichiers/.test(wa || ''), 'partage WhatsApp avec un lien public du fichier');
    await docs.screenshot({ path: path.join(OUT, 'p87-documents-partage.png') });
    const [tab] = await Promise.all([p.context().waitForEvent('page', { timeout: 15000 }).catch(() => null), docs.locator('.d-open').first().click()]);
    if (tab) await tab.waitForURL(/^blob:/, { timeout: 15000 }).catch(() => {});
    ok(!!tab && tab.url().startsWith('blob:'), 'le PDF s’ouvre dans un nouvel onglet');
    if (tab) await tab.close();
    await docs.locator('.doc .ic[title="Partager"]').first().click();
    await docs.screenshot({ path: path.join(OUT, 'p87-documents.png') });
  }

  // ── 3. Planning précis ──
  const prod = p.locator('#etape-production');
  await prod.scrollIntoViewIfNeeded();
  const t1 = Date.now();
  await prod.getByRole('button', { name: /Construire le planning/ }).click();
  await prod.locator('app-planning .cards').waitFor({ timeout: 300000 });
  res.planning = { duree: Math.round((Date.now() - t1) / 1000) + ' s', note: await prod.locator('app-planning .note').innerText().catch(() => ''), etapes: await prod.locator('app-planning .card').count() };
  ok(res.planning.etapes >= 6, `planning construit : ${res.planning.etapes} étapes en ${res.planning.duree}`);
  await prod.locator('app-planning .card').nth(1).scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, 'p87-planning-edition.png') });
  { const c0 = prod.locator('app-planning .card').first(), d0 = await c0.locator('.c-dur').innerText();
    await c0.getByRole('button', { name: 'Un jour de plus' }).click();
    ok(parseInt(await c0.locator('.c-dur').innerText()) === parseInt(d0) + 1, 'la durée se règle en un clic (+1 jour)');
    await c0.getByRole('button', { name: 'Un jour de moins' }).click(); }
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(600);
  await prod.locator('app-planning .card').first().scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(OUT, 'p87-planning-mobile.png') });
  await docs.scrollIntoViewIfNeeded(); await p.screenshot({ path: path.join(OUT, 'p87-documents-mobile.png') });
  await p.setViewportSize({ width: 1440, height: 950 }); await p.waitForTimeout(600); await prod.scrollIntoViewIfNeeded();
  await prod.getByRole('button', { name: 'Enregistrer le planning' }).click(); await p.waitForTimeout(1500);
  ok(await prod.locator('app-planning .bars li').count() >= 6, 'la frise du planning s’affiche');
  res.planning.lignes = await prod.locator('app-planning .list li').allInnerTexts();
  await prod.locator('app-planning').screenshot({ path: path.join(OUT, 'p87-planning.png') });

  // ── 4. Équipe technique : inviter par lien ──
  const crew = prod.locator('app-crew');
  ok(await crew.locator('.post').count() === 14, '14 postes fixes');
  const chef = crew.locator('.post', { hasText: 'Chef opérateur' });
  await chef.getByRole('button', { name: 'Inviter par lien' }).click();
  await chef.locator('input[name=in]').fill('Sami Ben Ali'); await chef.locator('input[name=ip]').fill('+216 20 123 456');
  await chef.getByRole('button', { name: 'Créer le lien d’invitation' }).click();
  await chef.locator('.i-link input').waitFor();
  const link = await chef.locator('.i-link input').inputValue();
  ok(/\/equipe\/rejoindre\//.test(link), 'lien d’invitation créé');
  ok(/wa\.me\/21620123456\?text=/.test(await chef.locator('.f-actions a.go', { hasText: 'WhatsApp' }).getAttribute('href')), 'envoi WhatsApp au bon numéro');
  await crew.screenshot({ path: path.join(OUT, 'p87-equipe-invitation.png') });
  const son = crew.locator('.post', { hasText: 'Ingénieur' });
  await son.getByRole('button', { name: 'Renseigner' }).click();
  await son.locator('input[name=n]').fill('Nour Gharbi'); await son.locator('input[name=p]').fill('+216 22 333 444'); await son.locator('input[name=v]').fill('Sfax');
  await son.getByRole('button', { name: 'Enregistrer' }).click(); await p.waitForTimeout(1000);
  ok((await crew.locator('.post', { hasText: 'Ingénieur' }).innerText()).includes('Nour Gharbi'), 'poste renseigné à la main');

  // ── 5. L'invité ouvre le lien sur son téléphone, crée son compte avec un mot de passe ──
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' }); const g = await ctx.newPage(); g.errs = []; g.on('pageerror', x => g.errs.push(x.message));
  await g.goto(link.replace(/^https?:\/\/[^/]+/, BASE)); await g.waitForSelector('.hero');
  ok((await g.locator('.hero').innerText()).includes('Chef opérateur'), 'la page d’invitation affiche le poste');
  await g.screenshot({ path: path.join(OUT, 'p87-invitation-mobile.png') });
  await g.locator('input[name=fn]').fill('Sami'); await g.locator('input[name=ln]').fill('Ben Ali');
  await g.locator('input[name=em]').fill(`recette.p87.tech.${st}@exemple.tn`); await g.locator('input[name=pw]').fill('Rec3tte-tech-2026');
  await g.locator('input[name=ph]').fill('+216 20 123 456'); await g.locator('input[name=ci]').fill('Tunis');
  await g.locator('.check input').check();
  await g.getByRole('button', { name: /Créer mon compte et rejoindre/ }).click();
  await g.waitForURL(u => u.pathname.startsWith('/demandes/'), { timeout: 20000 }).catch(() => {});
  ok(g.url().includes('/demandes/' + id), 'l’invité arrive sur le dossier du film');
  await g.waitForSelector('app-fiche .hero', { timeout: 15000 }).catch(() => {});
  await g.waitForTimeout(1500);
  ok(await g.locator('#etape-brief').count() === 0, 'l’équipe technique ne voit pas le brief');
  ok(await g.locator('#documents app-dropzone').count() === 0 && await g.locator('#documents .doc').count() >= (gc ? 1 : 0), 'pas de dépôt pour l’équipe technique, mais les documents sont visibles');
  ok((await g.locator('app-crew').innerText()).includes('+216 22 333 444'), 'l’équipe confirmée voit les coordonnées des autres');
  await g.locator('#etape-production').scrollIntoViewIfNeeded(); await g.waitForTimeout(600);
  await g.screenshot({ path: path.join(OUT, 'p87-technicien-mobile.png') });
  await g.goto(BASE + '/rooms'); await g.waitForTimeout(1200);

  // ── 6. La marque : pas d'accès aux coordonnées ──
  const m = await login(b, acc.M, { width: 1280, height: 900 });
  await m.goto(BASE + '/demandes/' + id); await m.waitForSelector('app-fiche .hero'); await m.waitForTimeout(1200);
  ok(!(await m.locator('app-crew').innerText().catch(() => '')).includes('+216'), 'la marque ne voit pas les téléphones de l’équipe');
  res.erreursJs = [...p.errs, ...g.errs, ...m.errs]; ok(!res.erreursJs.length, 'aucune erreur JavaScript');
  await b.close();
  fs.writeFileSync(path.join(OUT, 'test-p87.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
})().catch(e => { console.error('ECHEC', e.message); process.exit(1); });
