// Sprint 5 · T-164 : depuis un rôle, chaque acteur proposé dit quel passage de l'intention il remplit.
// Projet « Recette … » créé puis supprimé.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const intention = 'Une mère chaleureuse et pressée, qui garde son humour au petit-déjeuner. On doit sentir la complicité avec ses enfants.';
  const prj = (await j('/projects', { method: 'POST', body: JSON.stringify({ title: 'Recette Pub intention', type: 'PUBLICITE' }) }, adm)).b;
  await j(`/projects/${prj.id}/roles`, { method: 'POST', body: JSON.stringify({ name: 'La mère', gender: 'Femme', minAge: 30, maxAge: 45, intention }) }, adm);
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' })).newPage(); p.setDefaultTimeout(10000);
  const errs = []; p.on('pageerror', x => errs.push(x.message));
  const res = {};
  await p.goto(BASE + '/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
  await p.goto(BASE + '/projects/' + prj.id); await p.waitForTimeout(1500);
  await p.getByRole('button', { name: 'Trouver des acteurs' }).first().click();
  await p.waitForURL(/\/chat/);
  const t0 = Date.now();
  await p.getByText(/Répond à «/).first().waitFor({ timeout: 120000 }).catch(() => {});
  res.secondes = Math.round((Date.now() - t0) / 1000);
  const txt = await p.locator('body').innerText();
  const cites = [...txt.matchAll(/Répond à « (.+?) »/g)].map(m => m[1]);
  res.explicationsAffichees = cites.length;
  res.citationsExactes = cites.every(c => intention.toLowerCase().includes(c.toLowerCase()));
  res.exemple = (txt.match(/Répond à «[^\n]+/) || [''])[0].slice(0, 200);
  await p.screenshot({ path: path.join(OUT, 'v2-propositions-intention.jpg'), type: 'jpeg', quality: 75 });
  res.erreurs = errs;
  await b.close();
  await j('/projects/' + prj.id, { method: 'DELETE' }, adm);
  console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
