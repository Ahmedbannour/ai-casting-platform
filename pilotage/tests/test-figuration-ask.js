// T-156 · Un acteur sans réponse sur la figuration (inscrit par Google/Facebook, ou avant la v2) la voit dans son espace.
// Compte recette.figask.*@exemple.tn, effacé ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const path = require('path');
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200';
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const email = `recette.figask.${Date.now()}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
  const reg = await j('/auth/register', { method: 'POST', body: JSON.stringify({ acceptTerms: true, age: 'MAJEUR', email, password: pw, firstName: 'Karim', lastName: 'Recette' }) });
  const res = { inscriptionSansReponse: reg.s, avant: (await j('/me/actor', {}, reg.b.accessToken)).b.figuration };
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' })).newPage(); p.setDefaultTimeout(8000);
  await p.goto(BASE + '/auth/login'); await p.fill('#email', email); await p.fill('#password', pw); await p.click('button.submit-btn');
  await p.waitForURL(u => u.pathname.startsWith('/mon-espace'), { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(2000);
  res.questionVisible = await p.locator('app-figuration-ask .ask').isVisible();
  await p.locator('app-figuration-ask button', { hasText: 'Enregistrer' }).click(); await p.waitForTimeout(300);
  res.messageSansChoix = await p.locator('app-figuration-ask .msg').innerText().catch(() => '');
  await p.locator('app-figuration-ask').getByRole('radio', { name: 'Oui' }).click();
  await p.locator('app-figuration-ask .type', { hasText: 'Extra' }).click();
  await p.screenshot({ path: path.join(__dirname, '..', 'nav', 'v2-figuration-espace.jpg'), type: 'jpeg', quality: 75 });
  await p.locator('app-figuration-ask button', { hasText: 'Enregistrer' }).click(); await p.waitForTimeout(2000);
  res.apres = (await j('/me/actor', {}, reg.b.accessToken)).b.figuration;
  await p.reload(); await p.waitForTimeout(2500);
  res.questionApresRechargement = await p.locator('app-figuration-ask .ask').isVisible();
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
