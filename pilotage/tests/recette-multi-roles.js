// Recette à plusieurs : 7 testeurs (un par rôle), chacun dans son navigateur (ordinateur ou téléphone), en même temps,
// sur un vrai cycle de publicité. Mesures sur chaque écran : erreurs JavaScript, requêtes en échec, temps d'affichage,
// défilement horizontal, cibles tactiles trop petites (téléphone), et délai avant qu'une action d'un rôle soit vue par les autres
// sans recharger la page. Résultat : pilotage/multi/rapport.json et une capture par écran. Comptes recette.* effacés ensuite.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200';
const OUT = path.join(__dirname, '..', 'multi'); fs.mkdirSync(OUT, { recursive: true });
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DESK = { viewport: { width: 1366, height: 820 } };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const report = { debut: new Date().toISOString(), testeurs: {}, ecrans: [], etapes: [], synchro: [], incidents: [] };
let shot = 0;

/** Un testeur : son navigateur, ses erreurs, ses requêtes en échec. */
async function tester(b, key, label, dev, theme = 'dark') {
  const ctx = await b.newContext({ ...dev, colorScheme: theme, locale: 'fr-FR' });
  await ctx.addInitScript(t => localStorage.setItem('casting_theme', t), theme);
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const t = { key, label, appareil: dev.isMobile ? 'téléphone' : 'ordinateur', theme, p, erreursJs: [], requetesEchec: [] };
  p.on('pageerror', e => t.erreursJs.push(e.message.slice(0, 200)));
  p.on('response', r => { const u = r.url(); if (r.status() >= 400 && u.includes('/api/') && !u.includes('/notifications')) t.requetesEchec.push(`${r.status()} ${r.request().method()} ${u.replace(/^.*\/api/, '/api').replace(/[0-9a-f-]{36}/g, ':id')}`); });
  report.testeurs[key] = t;
  return t;
}

async function login(t, email, pw) {
  const p = t.p;
  await p.goto(BASE + '/auth/login'); await p.fill('#email', email); await p.fill('#password', pw); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 20000 });
  if (p.url().includes('/consentement')) {
    await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check();
    await p.getByRole('button', { name: /^Continuer/ }).click(); await p.waitForURL(u => !u.pathname.startsWith('/consentement'));
  }
}

/** Ouvre un écran, mesure, capture. */
async function ecran(t, url, nom) {
  const p = t.p, t0 = Date.now();
  try {
    if (url) await p.goto(BASE + url, { waitUntil: 'domcontentloaded' });
    await p.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    const ms = Date.now() - t0;
    const m = await p.evaluate(mobile => {
      const over = document.documentElement.scrollWidth - innerWidth;
      const small = mobile ? [...document.querySelectorAll('a, button, input, select, [role=button], [role=tab]')]
        .filter(e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (r.height < 32 || r.width < 32) && r.top < innerHeight * 3; })
        .map(e => (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 30)) : [];
      const noLabel = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea')]
        .filter(i => i.offsetParent && !i.getAttribute('aria-label') && !(i.id && document.querySelector(`label[for="${i.id}"]`)) && !i.closest('label')).length;
      const words = (document.querySelector('main, .content, body')?.innerText || '').split(/\s+/).length;
      return { debordement: over > 1 ? over : 0, petitesCibles: [...new Set(small)].slice(0, 8), nbPetitesCibles: small.length, champsSansEtiquette: noLabel, mots: words, titre: document.querySelector('h1')?.textContent?.trim() ?? '' };
    }, !!t.appareil.startsWith('t'));
    const file = `${String(++shot).padStart(2, '0')}-${t.key}-${nom}.jpg`;
    await p.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 70, fullPage: !t.appareil.startsWith('t') });
    report.ecrans.push({ testeur: t.label, appareil: t.appareil, ecran: nom, url: p.url().replace(BASE, ''), affichageMs: ms, ...m, capture: file });
  } catch (e) { incident(t, 'écran ' + nom, e); }
}

async function etape(t, nom, fn) {
  const t0 = Date.now();
  try { await fn(); report.etapes.push({ testeur: t.label, etape: nom, ok: true, ms: Date.now() - t0 }); }
  catch (e) { report.etapes.push({ testeur: t.label, etape: nom, ok: false, ms: Date.now() - t0, erreur: e.message.split('\n')[0].slice(0, 200) }); incident(t, nom, e); }
}
function incident(t, ou, e) { report.incidents.push({ testeur: t.label, ou, erreur: (e.message || String(e)).split('\n')[0].slice(0, 220) }); }

/** Délai avant qu'un testeur voie un changement SANS recharger sa page (null = jamais dans le délai). */
async function voitSansRecharger(t, quoi, test, maxMs = 75000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) { if (await test().catch(() => false)) { const s = Math.round((Date.now() - t0) / 1000); report.synchro.push({ testeur: t.label, quoi, vuApresSecondes: s }); return s; } await sleep(1500); }
  report.synchro.push({ testeur: t.label, quoi, vuApresSecondes: null, note: `pas vu en ${maxMs / 1000} s sans recharger` });
  return null;
}
const bell = async t => +(await t.p.locator('app-notification-bell .badge:visible').first().innerText({ timeout: 1000 }).catch(() => '0')) || 0;

(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const st = Date.now(), today = new Date().toISOString().slice(0, 10), acc = {};
  const org = async (n, kind) => (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${n} ${st}`, contractStart: today, kind }) }, adm)).b.id;
  const oP = await org('Studio Atlas', 'BOITE_PROD'), oM = await org('Marque Zitouna', 'MARQUE'), oA = await org('Agence Nour', 'AGENCE_MARKETING');
  for (const [k, role, o, first, last] of [['prod', 'BOITE_PROD', oP, 'Yasmine', 'Producer'], ['marque', 'MARQUE', oM, 'Salma', 'Marque'], ['agence', 'AGENCE_MARKETING', oA, 'Karim', 'Agence'],
      ['real', 'REALISATEUR', oP, 'Nadia', 'Réalisatrice'], ['ad', 'REALISATEUR', oP, 'Omar', 'PremierAD']]) {
    const email = `recette.multi.${k}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: first, lastName: last, role, agencyId: o, password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + JSON.stringify(c.b));
    acc[k] = { email, pw, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  // Acteur : inscription publique
  acc.acteur = { email: `recette.multi.acteur.${st}@exemple.tn`, pw: 'Rec3tte-' + st };
  const reg = await j('/auth/register', { method: 'POST', body: JSON.stringify({ email: acc.acteur.email, password: acc.acteur.pw, firstName: 'Ines', lastName: 'Recette', acceptTerms: true, age: 'MAJEUR' }) });
  acc.acteur.tk = reg.b?.accessToken;
  const users = (await j('/admin/users?size=500', {}, adm)).b; const ul = Array.isArray(users) ? users : users.content;
  const uid = e => ul.find(u => u.email === e)?.id;

  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  const T = {
    prod: await tester(b, 'prod', 'Producer (Yasmine)', DESK),
    assist: await tester(b, 'assist', 'Assistante de production', PHONE),
    marque: await tester(b, 'marque', 'Marque (Salma)', PHONE, 'light'),
    agence: await tester(b, 'agence', 'Agence marketing (Karim)', DESK, 'light'),
    real: await tester(b, 'real', 'Réalisatrice (Nadia)', DESK),
    ad: await tester(b, 'ad', '1er AD (Omar)', PHONE),
    acteur: await tester(b, 'acteur', 'Acteur (Ines)', PHONE, 'light')
  };

  // ── 1. Tout le monde se connecte en même temps ──
  await Promise.all([['prod', 'prod'], ['marque', 'marque'], ['agence', 'agence'], ['real', 'real'], ['ad', 'ad'], ['acteur', 'acteur']]
    .map(([t, a]) => etape(T[t], 'connexion', () => login(T[t], acc[a].email, acc[a].pw))));
  await Promise.all([ecran(T.prod, null, 'accueil'), ecran(T.marque, null, 'accueil'), ecran(T.agence, null, 'accueil'), ecran(T.real, null, 'accueil'), ecran(T.ad, null, 'accueil'), ecran(T.acteur, null, 'accueil')]);

  // ── 2. Le producer crée le projet et invite, pendant que la marque attend sur sa liste ──
  let id;
  await ecran(T.marque, '/mes-demandes', 'liste-vide');
  await etape(T.prod, 'créer le projet (interface)', async () => {
    const p = T.prod.p; await p.goto(BASE + '/projects'); await p.getByRole('button', { name: 'Nouveau projet' }).first().click();
    await p.locator('.new-choice button', { hasText: 'Publicité' }).click(); await p.waitForURL(/demandes\/nouvelle/);
    await p.fill('input[name=title]', 'Recette Huile Zitouna ' + st); await p.fill('input[name=product]', 'Huile d’olive');
    await p.click('button.next'); await p.fill('textarea[name=objective]', 'Lancer la nouvelle bouteille');
    await p.click('button[type=submit]'); await p.waitForURL(u => /\/demandes\/[0-9a-f-]{36}$/.test(u.pathname)); id = p.url().split('/').pop();
  });
  await ecran(T.prod, null, 'projet-cree');
  await etape(T.prod, 'inviter marque et agence (carte d’invitation)', async () => {
    const p = T.prod.p;
    for (const [i, email] of [[0, acc.marque.email], [1, acc.agence.email]]) {
      const li = p.locator('app-invite-card .slots li').nth(i);
      await li.getByRole('button', { name: 'Inviter' }).click(); await li.locator('input[type=email]').fill(email); await li.locator('form button[type=submit]').click(); await sleep(1500);
    }
  });
  await voitSansRecharger(T.marque, 'le nouveau projet apparaît dans sa liste', async () => (await T.marque.p.locator('.list li').count()) > 0);
  await voitSansRecharger(T.marque, 'la cloche signale l’invitation', async () => (await bell(T.marque)) > 0, 70000);

  // ── 3. Assistante invitée (téléphone) pendant que la marque écrit sa V0 ──
  const inv = await j('/production/assistantes', { method: 'POST', body: JSON.stringify({ email: `recette.multi.assist.${st}@exemple.tn`, perms: ['PROJETS', 'INVITATIONS', 'ROOM'] }) }, acc.prod.tk);
  await Promise.all([
    etape(T.assist, 'accepter l’invitation (téléphone)', async () => {
      const p = T.assist.p; await p.goto(BASE + '/invitation-pro/' + inv.b.token); await ecran(T.assist, null, 'invitation');
      await p.fill('#fn', 'Sarra'); await p.fill('#ln', 'Assistante'); await p.getByRole('button', { name: 'Suivant' }).click();
      await p.fill('#pw', 'Rec3tte-' + st); await p.locator('.check input').check(); await p.getByRole('button', { name: 'Rejoindre le projet' }).click();
      await p.waitForURL(/mes-demandes/); await ecran(T.assist, null, 'publicites');
    }),
    etape(T.marque, 'écrire et envoyer la V0 (téléphone)', async () => {
      const p = T.marque.p; await p.goto(BASE + '/demandes/' + id); await ecran(T.marque, null, 'projet-v0');
      await p.fill('textarea[name=v0]', 'Une famille sous un olivier centenaire, la lumière de fin de journée, la bouteille passe de main en main.');
      await p.getByRole('button', { name: 'Enregistrer le texte et le lien' }).click(); await sleep(800);
      await p.locator('button.send', { hasText: 'Envoyer à' }).click(); await sleep(1500);
    })
  ]);

  // ── 4. L'agence a sa page ouverte : voit-elle arriver la V0 sans recharger ? Puis V1 ──
  await T.agence.p.goto(BASE + '/mes-demandes'); await sleep(800);
  await voitSansRecharger(T.agence, 'la V0 envoyée apparaît (page déjà ouverte)', async () => (await T.agence.p.locator('.list li', { hasText: 'Zitouna' }).locator('.st').innerText()).includes('V0'), 20000);
  await etape(T.agence, 'accepter, écrire et livrer la V1', async () => {
    const p = T.agence.p; await p.goto(BASE + '/demandes/' + id); await ecran(T.agence, null, 'v0-recue');
    await p.getByRole('button', { name: 'Accepter la demande' }).click(); await sleep(1200);
    await p.fill('textarea[name=v1]', 'Concept : « L’arbre qui nourrit » — 30 s, trois générations, voix off de la grand-mère.');
    await p.getByRole('button', { name: /^Livrer la V1/ }).click(); await sleep(1500); await ecran(T.agence, null, 'v1-livree');
  });
  await T.marque.p.goto(BASE + '/demandes/' + id); await sleep(800);
  const avant = await T.marque.p.locator('.now-card p').innerText().catch(() => '');
  report.etapes.push({ testeur: T.marque.label, etape: 'état affiché avant rechargement', ok: true, ms: 0, note: avant });
  await etape(T.marque, 'valider la V1 (téléphone)', async () => {
    const p = T.marque.p; await p.reload(); await sleep(1200);
    await p.getByRole('button', { name: /^Valider la V1/ }).click(); await sleep(1500); await ecran(T.marque, null, 'v1-validee');
  });

  // ── 4 bis. Discussion : la marque pose une question au producer au lieu de l'appeler ──
  await T.prod.p.goto(BASE + '/demandes/' + id); await sleep(1500);
  const avantMsg = await T.prod.p.locator('app-discussion .msgs li').count().catch(() => 0);
  const avantCloche = await bell(T.prod);
  await etape(T.marque, 'question à l’équipe avec @mention (téléphone)', async () => {
    const p = T.marque.p; await p.goto(BASE + '/demandes/' + id); await sleep(1000);
    await p.locator('#disc-in').scrollIntoViewIfNeeded();
    await p.locator('#disc-in').fill('Bonjour, ');
    await p.locator('app-discussion .chip', { hasText: '@Yasmine' }).first().click();
    await p.locator('#disc-in').press('End'); await p.keyboard.type('qui valide le lieu du tournage ?');
    await p.getByRole('button', { name: 'Envoyer', exact: true }).click(); await sleep(1200); await ecran(T.marque, null, 'discussion');
  });
  await voitSansRecharger(T.prod, 'le message de la marque apparaît dans la discussion (page ouverte)', async () => (await T.prod.p.locator('app-discussion .msgs li').count()) > avantMsg, 40000);
  await voitSansRecharger(T.prod, 'la cloche signale la mention', async () => (await bell(T.prod)) > avantCloche, 40000);

  // ── 5. Production : attentes et transmission ; réalisatrice et 1er AD ──
  await etape(T.prod, 'attentes et équipe (interface puis API)', async () => {
    const p = T.prod.p; await p.goto(BASE + '/demandes/' + id); await ecran(T.prod, null, 'attentes');
    await j(`/demandes/${id}/personnages`, { method: 'POST', body: JSON.stringify({ name: 'La grand-mère', story: 'Elle cueille les olives', brandWish: 'Femme de 65 à 75 ans, sourire franc' }) }, acc.prod.tk);
    const tr = await j(`/demandes/${id}/transmettre`, { method: 'POST', body: JSON.stringify({ directorId: uid(acc.real.email), firstAdId: uid(acc.ad.email) }) }, acc.prod.tk);
    if (tr.s !== 200) throw new Error('transmission ' + tr.s + ' ' + JSON.stringify(tr.b).slice(0, 120));
  });
  await Promise.all([ecran(T.real, '/mes-demandes', 'publicites'), ecran(T.ad, '/mes-demandes', 'publicites')]);
  await etape(T.real, 'écrire la V2, un rôle, publier', async () => {
    const p = T.real.p; await p.goto(BASE + '/demandes/' + id); await ecran(T.real, null, 'v2');
    await j(`/demandes/${id}/v2`, { method: 'PUT', body: JSON.stringify({ body: 'V2 : plan large sur l’oliveraie, puis la table familiale.' }) }, acc.real.tk);
    await j(`/demandes/${id}/roles`, { method: 'POST', body: JSON.stringify({ name: 'La grand-mère', intention: 'Une femme solaire, des mains qui racontent une vie de récoltes.', importance: 'PRINCIPAL', gender: 'Femme', minAge: 65, maxAge: 78 }) }, acc.real.tk);
    const pub = await j(`/demandes/${id}/v2/publier`, { method: 'POST' }, acc.real.tk);
    if (pub.s !== 200) throw new Error('publication ' + pub.s + ' ' + JSON.stringify(pub.b).slice(0, 120));
    report.projectId = pub.b.projectId;
  });
  const pid = report.projectId;

  // ── 6. Casting : shortlist, puis tout le monde swipe en même temps dans la room ──
  let roleId, entries = [];
  await etape(T.prod, 'shortlist (3 candidats + l’acteur inscrit)', async () => {
    roleId = (await j(`/rooms/${pid}`, {}, acc.prod.tk)).b.roles[0].id;
    const actors = (await j('/actors/search?size=3', {}, adm)).b.content;
    for (const a of actors) { const r = await j(`/roles/${roleId}/shortlist`, { method: 'POST', body: JSON.stringify({ actorId: a.id }) }, acc.prod.tk); if (r.b?.id) entries.push(r.b.id); }
    const me = (await j('/me', {}, acc.acteur.tk)).b;
    if (me?.actorId) { const r = await j(`/roles/${roleId}/shortlist`, { method: 'POST', body: JSON.stringify({ actorId: me.actorId }) }, acc.prod.tk); if (r.b?.id) { entries.push(r.b.id); report.entreeActeur = r.b.id; } else report.incidents.push({ testeur: 'Producer', ou: 'shortlist de l’acteur inscrit', erreur: r.s + ' ' + JSON.stringify(r.b).slice(0, 160) }); }
  });
  await ecran(T.prod, `/rooms/${pid}`, 'room');
  const swipe = async (t, mode) => etape(t, 'swiper la shortlist (' + mode + ')', async () => {
    const p = t.p; await p.goto(BASE + '/rooms/' + pid); await sleep(1500); await ecran(t, null, 'room-swipe');
    for (let i = 0; i < 4; i++) {
      if (!(await p.locator('.card, .swipe-card, [class*=card]').first().isVisible().catch(() => false))) break;
      // « C'est un match ! » couvre l'écran : on continue comme un vrai utilisateur
      await p.getByRole('button', { name: 'Continuer à swiper' }).click({ timeout: 500 }).catch(() => {});
      if (mode === 'clavier') await p.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
      else await p.locator('button.act.yes').first().click({ timeout: 5000 }).catch(async () => p.keyboard.press('ArrowRight'));
      await sleep(700);
    }
  });
  await Promise.all([swipe(T.marque, 'boutons, téléphone'), swipe(T.agence, 'clavier'), swipe(T.real, 'clavier')]);
  await voitSansRecharger(T.prod, 'les votes apparaissent dans les résultats (onglet ouvert)', async () => {
    const p = T.prod.p; if (!p.url().includes('/rooms/')) await p.goto(BASE + '/rooms/' + pid);
    await p.locator('button', { hasText: 'Résultats' }).first().click().catch(() => {}); return (await p.locator('.face, .vote, [class*=vote]').count()) > 0;
  }, 15000);
  await ecran(T.prod, null, 'resultats');
  await Promise.all([ecran(T.assist, '/rooms', 'rooms'), ecran(T.ad, `/rooms/${pid}`, 'room')]);

  // ── 7. Convocation de l'acteur, réponse sur son téléphone ──
  if (report.entreeActeur) {
    await etape(T.prod, 'convoquer l’acteur en audition', async () => {
      const d = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
      const o = await j(`/shortlist/${report.entreeActeur}/offers`, { method: 'POST', body: JSON.stringify({ kind: 'AUDITION', message: 'Audition pour la grand-mère', auditionDate: d, auditionTime: '10:30', auditionPlace: 'Studio Atlas, Tunis' }) }, acc.prod.tk);
      if (o.s >= 300) throw new Error('convocation ' + o.s + ' ' + JSON.stringify(o.b).slice(0, 140));
    });
    await voitSansRecharger(T.acteur, 'la cloche signale la convocation', async () => (await bell(T.acteur)) > 0, 70000);
    await etape(T.acteur, 'accepter la convocation (téléphone)', async () => {
      const p = T.acteur.p; await p.goto(BASE + '/mes-propositions'); await ecran(T.acteur, null, 'propositions');
      await p.getByRole('button', { name: /^Accepter/ }).first().click(); await sleep(1500);
    });
    await Promise.all([ecran(T.acteur, '/agenda', 'agenda'), ecran(T.prod, '/agenda', 'agenda')]);
  }
  await Promise.all([ecran(T.prod, '/equipe', 'equipe'), ecran(T.acteur, '/mon-profil', 'profil'), ecran(T.agence, '/rooms', 'rooms')]);

  // ── Bilan par testeur ──
  for (const t of Object.values(report.testeurs)) { delete t.p; }
  report.fin = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, 'rapport.json'), JSON.stringify(report, null, 1));
  const ko = report.etapes.filter(e => !e.ok);
  console.log(`Écrans : ${report.ecrans.length} · Étapes : ${report.etapes.length} (${ko.length} en échec) · Incidents : ${report.incidents.length}`);
  for (const e of ko) console.log('ÉCHEC', e.testeur, '·', e.etape, '·', e.erreur);
  for (const s of report.synchro) console.log('SYNCHRO', s.testeur, '·', s.quoi, '·', s.vuApresSecondes === null ? s.note : s.vuApresSecondes + ' s');
  await b.close();
})().catch(e => { console.error(e.stack || e.message); fs.writeFileSync(path.join(OUT, 'rapport.json'), JSON.stringify(report, null, 1)); process.exit(1); });
