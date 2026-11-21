// Cahier v2 · Une V0 peut être une présentation Canva : la marque donne le lien, l'agence l'ouvre ; l'analyse demande aussi le PDF.
// Comptes recette.*@exemple.tn et organisations « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const projet = require('./projet');
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
    const email = `recette.canva.${kind.toLowerCase()}.${stamp}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: kind, role: kind, agencyId: org[kind], password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + kind + ' ' + c.s + ' ' + JSON.stringify(c.b));
    acc[kind] = { email, pw };
  }
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  const m = await login(b, acc.MARQUE.email, acc.MARQUE.pw);
  const ptk = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: acc.BOITE_PROD.email, password: acc.BOITE_PROD.pw }) })).b.accessToken;
  const id = await projet(j, { prodTk: ptk, title: 'Recette Pub Canva ' + stamp, brand: acc.MARQUE.email, agency: acc.AGENCE_MARKETING.email });
  await m.goto(BASE + '/demandes/' + id); await m.waitForTimeout(1200);
  res.champLien = await m.locator('input[name=v0link]').count();
  await m.fill('input[name=v0link]', 'http://pas-https.example');
  await m.getByRole('button', { name: 'Enregistrer le texte et le lien' }).click(); await m.waitForTimeout(1000);
  res.lienHttpRefuse = (await m.locator('.err').innerText().catch(() => '')).slice(0, 60);
  await m.fill('input[name=v0link]', 'https://www.canva.com/design/DAFdemo/view');
  res.envoiActifAvecLienSeul = null;
  await m.getByRole('button', { name: 'Enregistrer le texte et le lien' }).click(); await m.waitForTimeout(1000);
  const envoyer = m.locator('button.send', { hasText: 'Envoyer à' });
  res.envoiActifAvecLienSeul = await envoyer.isEnabled();
  await envoyer.click(); await m.waitForTimeout(1500);
  res.envoi = await m.locator('.ok').innerText().catch(() => '');
  const a = await login(b, acc.AGENCE_MARKETING.email, acc.AGENCE_MARKETING.pw);
  await a.goto(BASE + '/demandes/' + id); await a.waitForTimeout(1500);
  const lien = a.locator('a.canva');
  res.boutonCanva = await lien.innerText().catch(() => '');
  res.lienCible = await lien.getAttribute('href').catch(() => '');
  res.nouvelOnglet = await lien.getAttribute('target').catch(() => '');
  await a.screenshot({ path: path.join(OUT, 'v2-v0-canva.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  res.erreurs = [...m.errs, ...a.errs];
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
