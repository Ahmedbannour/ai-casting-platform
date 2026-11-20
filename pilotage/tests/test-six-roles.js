// Cahier v2, sprint 1 · Chaque rôle a son compte et arrive dans son espace.
// Crée une organisation par type et un compte par rôle (recette.*@exemple.tn), se connecte avec chacun,
// relève la page d'arrivée et le menu, puis vérifie l'intention du réalisateur sur un rôle.
// Nettoyage : nettoyer-recette.sql (comptes recette.* et organisations « Recette … »).
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200';
const OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const today = new Date().toISOString().slice(0, 10), stamp = Date.now();
  const org = {};
  for (const kind of ['MARQUE', 'AGENCE_MARKETING', 'BOITE_PROD']) {
    const r = await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${kind} ${stamp}`, contractStart: today, kind }) }, adm);
    org[kind] = r.b.id; if (r.s !== 201 && r.s !== 200) throw new Error('organisation ' + kind + ' : ' + r.s + ' ' + JSON.stringify(r.b));
  }
  const res = { organisations: Object.keys(org).length };
  console.error('organisations', JSON.stringify(org));
  // Mauvais type d'organisation : refusé
  const bad = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email: `recette.bad.${stamp}@exemple.tn`, firstName: 'Mauvais', lastName: 'Type', role: 'MARQUE', agencyId: org.BOITE_PROD, password: 'Rec3tte-' + stamp + '!' }) }, adm);
  res.mauvais_type = bad.s;
  const roles = { MARQUE: org.MARQUE, AGENCE_MARKETING: org.AGENCE_MARKETING, REALISATEUR: null, BOITE_PROD: org.BOITE_PROD };
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  for (const [role, orgId] of Object.entries(roles)) {
    const email = `recette.${role.toLowerCase()}.${stamp}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: role, role, agencyId: orgId, password: pw }) }, adm);
    console.error('compte', role, c.s);
    const ctx = await b.newContext({ viewport: { width: 1280, height: 820 }, colorScheme: 'dark' }); const p = await ctx.newPage(); p.setDefaultTimeout(8000); const errs = [];
    p.on('pageerror', x => errs.push(x.message));
    await p.goto(BASE + '/auth/login'); await p.fill('#email', email); await p.fill('#password', pw); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
    if (p.url().includes('/consentement')) {
      await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check();
      await p.getByRole('button', { name: /^Continuer/ }).click();
      await p.waitForURL(u => !u.pathname.startsWith('/consentement'), { timeout: 10000 }).catch(() => {});
    }
    await p.goto(BASE + '/'); await p.waitForTimeout(2500);
    const menu = await p.locator('nav a, .nav-item').allInnerTexts().catch(() => []);
    const roleName = await p.locator('.sidebar, aside, nav').first().innerText().then(t => (t.match(/Marque|Agence marketing|Réalisateur|Boîte de production/) || [''])[0]).catch(() => '');
    res[role] = { creation: c.s, arrivee: new URL(p.url()).pathname, menu: menu.map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 6), libelle: roleName, erreurs: errs.length };
    await p.addStyleTag({ content: 'app-email-banner{display:none!important}' }).catch(() => {});
    await p.screenshot({ path: path.join(OUT, `v2-${role.toLowerCase()}.jpg`), type: 'jpeg', quality: 72 });
    await ctx.close();
  }
  await b.close();
  // Intention du réalisateur sur un rôle
  const prj = await j('/projects', { method: 'POST', body: JSON.stringify({ title: 'Recette pub ' + stamp, type: 'PUBLICITE' }) }, adm);
  const role = await j(`/projects/${prj.b.id}/roles`, { method: 'POST', body: JSON.stringify({ name: 'La mère', gender: 'Femme', minAge: 30, maxAge: 40, city: 'Tunis', intention: 'Chaleureuse et pressée, elle garde son humour au petit-déjeuner.' }) }, adm);
  res.intention = { statut: role.s, intention: role.b.intention, envoyeAIA: role.b.intentionQuery };
  await j(`/projects/${prj.b.id}`, { method: 'DELETE' }, adm);
  console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
