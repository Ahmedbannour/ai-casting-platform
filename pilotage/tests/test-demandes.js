// Le producer crée le projet et invite la marque et l'agence depuis la carte « Inviter l'équipe » ; la marque écrit sa V0,
// dépose un PDF et l'envoie à l'agence invitée ; l'agence la reçoit et est notifiée.
// Comptes recette.*@exemple.tn et organisations « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const choisir = require('./choisir');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
async function login(b, email, pw) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark', acceptDownloads: true }); const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  p.errs = []; p.on('pageerror', x => p.errs.push(x.message));
  await p.goto(BASE + '/auth/login'); await p.fill('#email', email); await p.fill('#password', pw); await p.click('button.submit-btn');
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
  const today = new Date().toISOString().slice(0, 10), stamp = Date.now(), res = {};
  const org = {}, acc = {};
  for (const kind of ['MARQUE', 'AGENCE_MARKETING', 'BOITE_PROD']) {
    const r = await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${kind === 'MARQUE' ? 'Marque' : kind === 'BOITE_PROD' ? 'Prod' : 'Agence'} ${stamp}`, contractStart: today, kind }) }, adm);
    org[kind] = r.b.id;
    const email = `recette.dem.${kind.toLowerCase()}.${stamp}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: kind, role: kind, agencyId: org[kind], password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + kind + ' ' + c.s + ' ' + JSON.stringify(c.b));
    acc[kind] = { email, pw };
  }
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  // ── Producer : crée le projet, invite la marque et l'agence ──
  const p = await login(b, acc.BOITE_PROD.email, acc.BOITE_PROD.pw);
  await p.goto(BASE + '/mes-demandes'); await p.waitForTimeout(1500);
  res.producerVide = await p.locator('.empty h2').innerText().catch(() => '');
  await p.locator('a.send', { hasText: 'Nouveau projet' }).first().click(); await p.waitForURL(/demandes\/nouvelle/);
  await p.fill('input[name=title]', 'Recette Lancement printemps ' + stamp);
  await p.fill('input[name=product]', 'Jus d’orange');
  await p.click('button.next'); await p.fill('textarea[name=objective]', 'Faire connaître la nouvelle bouteille');
  await p.click('button[type=submit]'); await p.waitForURL(u => /\/demandes\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 10000 });
  const id = p.url().split('/').pop();
  await p.waitForTimeout(1200);
  res.carteInvitation = await p.locator('app-invite-card h2').innerText();
  res.maintenant = await p.locator('.now-card p').innerText();
  for (const [i, email] of [[0, acc.MARQUE.email], [1, acc.AGENCE_MARKETING.email]]) {
    const li = p.locator('app-invite-card .slots li').nth(i);
    await li.getByRole('button', { name: 'Inviter' }).click();
    await li.locator('input[type=email]').fill(email);
    await li.locator('form button[type=submit]').click(); await p.waitForTimeout(1500);
  }
  res.invitationsOk = await p.locator('app-invite-card .slots li.ok').count();
  if (res.invitationsOk !== 2) throw new Error('ÉCHEC : marque et agence non rattachées (' + res.invitationsOk + ')');
  await p.screenshot({ path: path.join(OUT, 'producer-invitations.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  // ── Marque ──
  const m = await login(b, acc.MARQUE.email, acc.MARQUE.pw);
  await m.goto(BASE + '/mes-demandes'); await m.waitForTimeout(1500);
  res.marqueNouveauProjet = await m.locator('a.send', { hasText: 'Nouveau projet' }).count();
  await m.goto(BASE + '/demandes/' + id); await m.waitForTimeout(1200);
  await m.fill('textarea[name=v0]', 'Une famille au petit-déjeuner, lumière du matin, ton chaleureux. Message : le goût du verger.');
  await m.getByRole('button', { name: 'Enregistrer le texte' }).click(); await m.waitForTimeout(800);
  await m.setInputFiles('.drop input[type=file]', path.join(__dirname, 'v0-recette.pdf')); await m.waitForTimeout(1500);
  res.fichierDepose = await m.locator('.file span').first().innerText().catch(() => '');
  const [dl] = await Promise.all([m.waitForEvent('download', { timeout: 8000 }).catch(() => null), m.getByRole('button', { name: 'Télécharger' }).first().click()]);
  res.telechargementMarque = dl ? dl.suggestedFilename() : null;
  res.destinataire = await m.locator('.to-agency').innerText();
  await m.screenshot({ path: path.join(OUT, 'v2-demande-brouillon.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  await m.locator('button.send', { hasText: 'Envoyer à' }).click(); await m.waitForTimeout(1500);
  res.envoi = await m.locator('.ok').innerText().catch(() => '');
  res.etapeMarque = await m.locator('.steps .now').innerText().catch(() => '');
  res.formulaireFige = await m.locator('input[name=title]').count() === 0;
  res.journal = await m.locator('.journal li').count();
  await m.screenshot({ path: path.join(OUT, 'v2-demande-envoyee.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  await m.goto(BASE + '/mes-demandes'); await m.waitForTimeout(1200);
  res.listeMarque = await m.locator('.list li').count();
  res.erreursMarque = m.errs.length;
  // ── Agence ──
  const a = await login(b, acc.AGENCE_MARKETING.email, acc.AGENCE_MARKETING.pw);
  const atk = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: acc.AGENCE_MARKETING.email, password: acc.AGENCE_MARKETING.pw }) })).b.accessToken;
  const notifs = (await j('/me/notifications', {}, atk)).b; const nl = Array.isArray(notifs) ? notifs : (notifs.items || notifs.content || []);
  const n = nl.find(x => (x.link || '').includes(id));
  res.notificationAgence = n ? [n.title, n.link] : null;
  await a.goto(BASE + '/mes-demandes'); await a.waitForTimeout(1500);
  res.listeAgence = await a.locator('.list li').count();
  await a.locator('.list a').first().click(); await a.waitForURL(/\/demandes\//); await a.waitForTimeout(1200);
  res.agenceLectureSeule = await a.locator('input[name=title]').count() === 0;
  res.agenceVoitV0 = (await a.locator('.body').first().innerText().catch(() => '')).slice(0, 30);
  const [dl2] = await Promise.all([a.waitForEvent('download', { timeout: 8000 }).catch(() => null), a.getByRole('button', { name: 'Télécharger' }).first().click()]);
  res.telechargementAgence = dl2 ? dl2.suggestedFilename() : null;
  res.annulerVisiblePourAgence = await a.getByRole('button', { name: 'Annuler la demande' }).count();
  await a.screenshot({ path: path.join(OUT, 'v2-demande-agence.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  // ── Un autre compte ne voit pas la demande ──
  const autre = await j(`/demandes/${id}`, {}, (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken);
  res.adminVoit = autre.s;
  res.erreursAgence = a.errs.length;
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
