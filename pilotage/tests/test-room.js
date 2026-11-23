// Room de casting (téléphone, mode clair) : la marque swipe au doigt, l'agence au clavier, le réalisateur met un coup de cœur
// → « C'est un match ! » ; la production (chef de room) voit le classement, fixe le 1er choix, partage un document réservé
// au réalisateur et confie une tâche ; la marque ne voit pas ce document. Comptes recette.*@exemple.tn effacés à la fin.
const { chromium } = require('playwright-core');
const projet = require('./projet');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
const ok = (c, m) => { if (!c) throw new Error('ÉCHEC : ' + m); console.log('OK  ' + m); };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const st = Date.now(), today = new Date().toISOString().slice(0, 10), acc = {};
  for (const [k, role, kind, first] of [['m', 'MARQUE', 'MARQUE', 'Sana'], ['a', 'AGENCE_MARKETING', 'AGENCE_MARKETING', 'Karim'], ['p', 'BOITE_PROD', 'BOITE_PROD', 'Hédi'], ['r', 'REALISATEUR', null, 'Nadia']]) {
    const o = kind ? (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette Room ${k} ${st}`, contractStart: today, kind }) }, adm)).b.id : null;
    const email = `recette.room.${k}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: first, lastName: 'Recette', role, ...(o ? { agencyId: o } : {}), password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + JSON.stringify(c.b));
    acc[k] = { email, pw, o, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  const users = (await j('/admin/users?size=500', {}, adm)).b; const list = Array.isArray(users) ? users : users.content;
  const uid = e => list.find(u => u.email === e).id;
  // Cycle publicitaire jusqu'à la V2 publiée (par l'API)
  const id = await projet(j, { prodTk: acc.p.tk, title: 'Recette Room Eau ' + st, brand: acc.m.email, agency: acc.a.email });
  await j(`/demandes/${id}/v0`, { method: 'PUT', body: JSON.stringify({ body: 'Une source en montagne.' }) }, acc.m.tk);
  await j(`/demandes/${id}/envoyer`, { method: 'POST', body: '{}' }, acc.m.tk);
  await j(`/demandes/${id}/accepter`, { method: 'POST' }, acc.a.tk);
  await j(`/demandes/${id}/v1`, { method: 'PUT', body: JSON.stringify({ body: 'Concept : la source.' }) }, acc.a.tk);
  await j(`/demandes/${id}/v1/livrer`, { method: 'POST' }, acc.a.tk);
  await j(`/demandes/${id}/v1/valider`, { method: 'POST' }, acc.m.tk);
  await j(`/demandes/${id}/personnages`, { method: 'POST', body: JSON.stringify({ name: 'La randonneuse' }) }, acc.p.tk);
  await j(`/demandes/${id}/transmettre`, { method: 'POST', body: JSON.stringify({ directorId: uid(acc.r.email) }) }, acc.p.tk);
  await j(`/demandes/${id}/v2`, { method: 'PUT', body: JSON.stringify({ body: 'V2 : un plan-séquence.' }) }, acc.r.tk);
  await j(`/demandes/${id}/roles`, { method: 'POST', body: JSON.stringify({ name: 'La randonneuse', intention: 'Une femme libre et lumineuse, qui boit à la source comme on respire.', importance: 'PRINCIPAL' }) }, acc.r.tk);
  const pid = (await j(`/demandes/${id}/v2/publier`, { method: 'POST' }, acc.r.tk)).b.projectId;
  const roleId = (await j(`/rooms/${pid}`, {}, acc.p.tk)).b.roles[0].id;
  const actors = (await j('/actors/search?size=3', {}, adm)).b.content;
  for (const a of actors) await j(`/roles/${roleId}/shortlist`, { method: 'POST', body: JSON.stringify({ actorId: a.id }) }, acc.p.tk);
  const first = `${actors[0].firstName} ${actors[0].lastName}`;

  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  const open = async (who, theme = 'light') => {
    const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(t => localStorage.setItem('casting_theme', t), theme);
    const p = await ctx.newPage(); p.setDefaultTimeout(15000); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.goto(BASE + '/auth/login', { timeout: 30000 }); await p.fill('#email', acc[who].email); await p.fill('#password', acc[who].pw); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 20000 });
    if (p.url().includes('/consentement')) { await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check(); await p.getByRole('button', { name: /^Continuer/ }).click(); await p.waitForTimeout(1200); }
    return p;
  };
  const errs = [];
  try {
    // ── Marque : de la publicité à la room, swipe au doigt ──
    let p = await open('m');
    await p.goto(BASE + '/demandes/' + id + '/historique'); await p.waitForTimeout(1200);
    ok(await p.locator('a.room-cta').isVisible(), 'Marque : la publicité propose « La room de casting est ouverte »');
    await p.locator('a.room-cta').click(); await p.waitForURL(/\/rooms\//); await p.waitForTimeout(1500);
    ok(await p.locator('app-room-swipe article.card.top').isVisible(), 'Marque : la room s\'ouvre sur le swipe, première carte affichée');
    await p.waitForTimeout(800);
    ok(await p.locator('article.card.top').evaluate(el => { const r = el.getBoundingClientRect(), bar = document.querySelector('.tabbar').getBoundingClientRect(); return r.top >= 0 && r.bottom <= bar.top + 4; }), 'Marque : la carte est entière à l\'écran, au-dessus de la barre du bas');
    await p.screenshot({ path: path.join(OUT, 'room-1-swipe.png') });
    const card = await p.locator('article.card.top').boundingBox();
    const cx = card.x + card.width / 2, cy = card.y + card.height / 2;
    await p.mouse.move(cx, cy); await p.mouse.down();
    for (let i = 1; i <= 10; i++) { await p.mouse.move(cx + i * 16, cy + i * 2); await p.waitForTimeout(16); }
    await p.screenshot({ path: path.join(OUT, 'room-2-glisse.png') });
    await p.mouse.move(cx + 200, cy + 20); await p.mouse.up(); await p.waitForTimeout(900);
    await p.getByRole('button', { name: 'Non', exact: true }).click(); await p.waitForTimeout(900);
    await p.getByRole('button', { name: 'Oui', exact: true }).click(); await p.waitForTimeout(900);
    ok(await p.getByText('Vous avez tout vu pour ce rôle').isVisible(), 'Marque : 3 votes (glisser, Non, Oui), plus de carte');
    errs.push(...p.errs); await p.context().close();

    // ── Agence : au clavier ──
    p = await open('a');
    await p.goto(BASE + '/rooms/' + pid + '?tab=swipe'); await p.waitForTimeout(1500);
    await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
    await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(900);
    await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(900);
    ok(await p.getByText('Vous avez tout vu pour ce rôle').isVisible(), 'Agence : 3 votes au clavier');
    errs.push(...p.errs); await p.context().close();

    // ── Réalisateur : coup de cœur → match ──
    p = await open('r', 'dark');
    await p.goto(BASE + '/rooms/' + pid + '?tab=swipe'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: 'Coup de cœur', exact: true }).click(); await p.waitForTimeout(1400);
    ok(await p.getByRole('dialog', { name: "C'est un match" }).isVisible(), 'Réalisateur : coup de cœur → « C\'est un match ! »');
    ok((await p.locator('.match').innerText()).includes(first), 'Le match nomme le bon acteur : ' + first);
    await p.screenshot({ path: path.join(OUT, 'room-3-match.png') });
    await p.getByRole('button', { name: 'Voir les résultats' }).click(); await p.waitForTimeout(1200);
    ok((await p.locator('.row').first().innerText()).includes(first) && await p.locator('.row').first().locator('.b.match').isVisible(), 'Résultats : le match est en tête');
    errs.push(...p.errs); await p.context().close();

    // ── Production (chef de room) ──
    p = await open('p');
    await p.goto(BASE + '/rooms/' + pid + '?tab=swipe'); await p.waitForTimeout(1500);
    await p.getByRole('tab', { name: /Résultats/ }).click(); await p.waitForTimeout(1200);
    await p.locator('.row').first().getByRole('button', { name: '1er choix' }).click(); await p.waitForTimeout(900);
    ok(await p.locator('.row').first().locator('.b.rank').innerText() === '1er choix', 'Production : 1er choix fixé');
    await p.screenshot({ path: path.join(OUT, 'room-4-resultats.png') });
    await p.getByRole('tab', { name: /Documents/ }).click(); await p.waitForTimeout(700);
    for (const a of ['Marque', 'Agence', 'Production']) await p.locator('.add .chip', { hasText: a }).click();
    await p.setInputFiles('app-room-docs .drop input[type=file]', path.join(__dirname, 'v0-recette.pdf')); await p.waitForTimeout(1500);
    ok(await p.locator('.doc').count() === 1, 'Production : document partagé (réservé au réalisateur)');
    await p.screenshot({ path: path.join(OUT, 'room-5-documents.png') });
    await p.getByRole('tab', { name: /Tâches/ }).click(); await p.waitForTimeout(700);
    await p.fill('.quick input[name=title]', 'Confirmer les disponibilités du 1er choix');
    await p.locator('.quick app-select button.sf').click(); await p.locator('.sf-menu [role=option]', { hasText: 'Nadia' }).click();
    await p.click('.quick button.primary'); await p.waitForTimeout(1200);
    ok(await p.locator('.col[data-s="A_FAIRE"] .task').count() === 1, 'Production : tâche confiée au réalisateur');
    const t = await p.locator('.col[data-s="A_FAIRE"] .task').boundingBox(), to = await p.locator('.col[data-s="EN_COURS"] .drop').boundingBox();
    await p.mouse.move(t.x + 30, t.y + 15); await p.mouse.down();
    for (let i = 1; i <= 12; i++) { await p.mouse.move(t.x + 30, t.y + 15 + (to.y + 30 - t.y - 15) * i / 12); await p.waitForTimeout(25); }
    await p.mouse.up(); await p.waitForTimeout(1200);
    ok(await p.locator('.col[data-s="EN_COURS"] .task').count() === 1, 'Production : tâche glissée dans « En cours »');
    await p.screenshot({ path: path.join(OUT, 'room-6-taches.png') });
    await p.getByRole('tab', { name: /Équipe/ }).click(); await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, 'room-7-equipe.png') });
    errs.push(...p.errs); await p.context().close();

    // ── Marque : ne voit pas le document du réalisateur ──
    p = await open('m');
    await p.goto(BASE + '/rooms/' + pid + '?tab=swipe'); await p.waitForTimeout(1200);
    await p.getByRole('tab', { name: /Documents/ }).click(); await p.waitForTimeout(900);
    ok(await p.locator('.doc').count() === 0 && await p.locator('app-dropzone').count() === 0, 'Marque : pas de document réservé, pas de dépôt (autorisation fermée)');
    errs.push(...p.errs); await p.context().close();
    ok(errs.length === 0, 'Aucune erreur JS ' + errs.join(' | '));
  } finally { await b.close(); }
})().catch(e => { console.error(e.message); process.exit(1); });
