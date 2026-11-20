// Sprint 5 · T-165 : un rôle de figuration (type silhouette) ne propose que les acteurs qui acceptent la silhouette.
// Projet « Recette … » et acteurs « Recette Figurant … » créés puis supprimés à la fin.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const st = Date.now(), L = String(st).slice(-6).split('').map(c => 'abcdefghij'[+c]).join(''), res = {}, made = [];
  for (const [last, fig] of [['Silhouette', ['SILHOUETTE']], ['Extra', ['EXTRA']]]) {
    const a = (await j('/actors', { method: 'POST', body: JSON.stringify({ firstName: 'Recette Figurant', lastName: last + L }) }, adm)).b;
    await j('/actors/' + a.id, { method: 'PUT', body: JSON.stringify({ figuration: fig }) }, adm); made.push(a.id);
  }
  const prj = (await j('/projects', { method: 'POST', body: JSON.stringify({ title: 'Recette Pub figuration ' + st, type: 'PUBLICITE' }) }, adm)).b;
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' })).newPage(); p.setDefaultTimeout(10000);
  const errs = []; p.on('pageerror', x => errs.push(x.message));
  const bodies = []; p.on('request', r => { if (r.url().includes('/api/ai/search')) bodies.push(r.postDataJSON()); });
  await p.goto(BASE + '/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
  await p.goto(BASE + '/projects/' + prj.id); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Nouveau rôle' }).first().click(); await p.waitForTimeout(500);
  res.typeCacheAvant = await p.getByRole('radiogroup', { name: 'Type de figuration' }).count();
  await p.fill('#r-name', 'Passants remarqués');
  await p.getByRole('radio', { name: 'Figuration' }).click();
  res.typesProposes = await p.getByRole('radiogroup', { name: 'Type de figuration' }).getByRole('radio').allInnerTexts();
  await p.getByRole('radio', { name: 'Silhouette' }).click();
  await p.screenshot({ path: path.join(OUT, 'v2-role-figuration.jpg'), type: 'jpeg', quality: 75 });
  await p.click('form.panel button.next'); await p.click('form.panel button.next');
  await p.getByRole('button', { name: 'Créer le rôle' }).click(); await p.waitForTimeout(1500);
  const roles = (await j(`/projects/${prj.id}/roles`, {}, adm)).b;
  res.roleEnregistre = roles.map(r => `${r.name} · ${r.importance} · ${r.figurationType}`);
  await p.getByRole('button', { name: 'Trouver des acteurs' }).first().click();
  await p.waitForURL(/\/chat/); await p.waitForTimeout(4000);
  res.rechercheAvecRole = bodies.length ? !!bodies[0].roleId : false;
  const txt = await p.locator('body').innerText();
  res.silhouetteProposee = txt.includes('Silhouette' + L);
  res.extraEcarte = !txt.includes('Extra' + L);
  res.erreurs = errs;
  await b.close();
  // Nettoyage
  await j('/projects/' + prj.id, { method: 'DELETE' }, adm);
  for (const id of made) await j('/actors/' + id, { method: 'DELETE' }, adm);
  console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
