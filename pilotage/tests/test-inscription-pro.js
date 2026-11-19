// T-157 · Inscription d'un professionnel, refus de connexion avant validation, validation par l'administrateur.
// Comptes recette.pro.*@exemple.tn et organisation « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200';
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const stamp = Date.now(), email = `recette.pro.${stamp}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
  const res = {};
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 1000 }, colorScheme: 'dark' })).newPage(); p.setDefaultTimeout(8000);
  await p.goto(BASE + '/auth/login'); await p.waitForTimeout(1200);
  res.lienDepuisConnexion = await p.locator('a[href="/auth/inscription-pro"]').count();
  await p.goto(BASE + '/auth/inscription-pro'); await p.waitForTimeout(1200);
  await p.click('button[type=submit]'); await p.waitForTimeout(300);
  res.erreursVides = await p.locator('.msg').count();
  await p.locator('.role', { hasText: 'Marque' }).click();
  await p.fill('input[name=org]', 'Recette Marque ' + stamp); await p.fill('input[name=city]', 'Tunis');
  await p.fill('input[name=first]', 'Sana'); await p.fill('input[name=last]', 'Recette'); await p.fill('input[name=email]', email); await p.fill('input[name=pw]', pw);
  await p.locator('.consent input').check();
  await p.screenshot({ path: path.join(__dirname, '..', 'nav', 'v2-inscription-pro.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  await p.click('button[type=submit]'); await p.waitForTimeout(1500);
  res.confirmation = await p.locator('.done h1').innerText().catch(() => '');
  const avant = await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) });
  res.connexionAvant = [avant.s, avant.b.message];
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const list = (await j('/admin/users', {}, adm)).b; const u = (Array.isArray(list) ? list : (list.content || [])).find(x => x.email === email);
  if (!u) { console.log(JSON.stringify(res, null, 1)); throw new Error('compte introuvable chez l admin'); }
  res.enAttenteChezAdmin = u && u.pendingApproval;
  res.validation = (await j('/admin/users/' + u.id, { method: 'PATCH', body: JSON.stringify({ enabled: true }) }, adm)).s;
  const apres = await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) });
  res.connexionApres = [apres.s, apres.b.role];
  const real = await j('/auth/register-pro', { method: 'POST', body: JSON.stringify({ role: 'REALISATEUR', firstName: 'Ali', lastName: 'Recette', email: `recette.pro.real.${stamp}@exemple.tn`, password: pw, acceptTerms: true }) });
  res.realisateurIndependant = real.s;
  const acteur = await j('/auth/register-pro', { method: 'POST', body: JSON.stringify({ role: 'ACTEUR', firstName: 'X', lastName: 'Y', email: `recette.pro.x.${stamp}@exemple.tn`, password: pw, organisation: 'Recette X', acceptTerms: true }) });
  res.acteurRefuse = acteur.s;
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
