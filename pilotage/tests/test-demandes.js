// Sprint 2 · T-158 / T-159 : la marque crée une demande, écrit sa V0, dépose un PDF, l'envoie ; l'agence la reçoit et est notifiée.
// Comptes recette.*@exemple.tn et organisations « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
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
  for (const kind of ['MARQUE', 'AGENCE_MARKETING']) {
    const r = await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${kind === 'MARQUE' ? 'Marque' : 'Agence'} ${stamp}`, contractStart: today, kind }) }, adm);
    org[kind] = r.b.id;
    const email = `recette.dem.${kind.toLowerCase()}.${stamp}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: kind, role: kind, agencyId: org[kind], password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + kind + ' ' + c.s + ' ' + JSON.stringify(c.b));
    acc[kind] = { email, pw };
  }
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  // ── Marque ──
  const m = await login(b, acc.MARQUE.email, acc.MARQUE.pw);
  await m.goto(BASE + '/mes-demandes'); await m.waitForTimeout(1500);
  res.listeVide = await m.locator('.empty h2').innerText().catch(() => '');
  await m.click('a.send'); await m.waitForURL(/demandes\/nouvelle/);
  await m.fill('input[name=title]', 'Recette Lancement printemps ' + stamp);
  await m.fill('input[name=product]', 'Jus d’orange');
  await m.fill('textarea[name=objective]', 'Faire connaître la nouvelle bouteille');
  await m.click('button[type=submit]'); await m.waitForURL(u => /\/demandes\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 10000 });
  res.creee = await m.locator('.ok').innerText().catch(() => '');
  const id = m.url().split('/').pop();
  await m.fill('textarea[name=v0]', 'Une famille au petit-déjeuner, lumière du matin, ton chaleureux. Message : le goût du verger.');
  await m.getByRole('button', { name: 'Enregistrer le texte' }).click(); await m.waitForTimeout(800);
  await m.setInputFiles('.drop input[type=file]', path.join(__dirname, 'v0-recette.pdf')); await m.waitForTimeout(1500);
  res.fichierDepose = await m.locator('.file span').first().innerText().catch(() => '');
  const [dl] = await Promise.all([m.waitForEvent('download', { timeout: 8000 }).catch(() => null), m.getByRole('button', { name: 'Télécharger' }).first().click()]);
  res.telechargementMarque = dl ? dl.suggestedFilename() : null;
  res.envoyerActifSansAgence = await m.getByRole('button', { name: "Envoyer à l'agence" }).isEnabled();
  await m.selectOption('select[name=agency]', { label: `Recette Agence ${stamp}` });
  await m.screenshot({ path: path.join(OUT, 'v2-demande-brouillon.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  await m.getByRole('button', { name: "Envoyer à l'agence" }).click(); await m.waitForTimeout(1500);
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
