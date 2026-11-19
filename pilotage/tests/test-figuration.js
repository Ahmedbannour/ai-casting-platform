// Cahier v2 (EX-52) · À l'inscription, l'acteur dit s'il accepte la figuration (extra, silhouette, figurant spécial).
// Compte recette.figuration.*@exemple.tn, effacé ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const path = require('path');
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200';
const OUT = path.join(__dirname, '..', 'nav');
(async () => {
  const email = `recette.figuration.${Date.now()}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 }, colorScheme: 'dark' }); const p = await ctx.newPage(); p.setDefaultTimeout(8000);
  const res = {};
  await p.goto(BASE + '/auth/inscription'); await p.waitForTimeout(1500);
  await p.fill('#firstName', 'Salma'); await p.fill('#lastName', 'Recette'); await p.fill('#email', email); await p.fill('#password', pw);
  await p.getByRole('radio', { name: /18 ans ou plus/i }).click();
  await p.locator('.consent input').check();
  await p.click('button.submit-btn'); await p.waitForTimeout(500);
  res.sansReponse = await p.locator('app-figuration-picker .msg').innerText().catch(() => '');
  await p.locator('app-figuration-picker').getByRole('radio', { name: 'Oui' }).click();
  res.typesAffiches = await p.locator('app-figuration-picker .type').count();
  await p.locator('app-figuration-picker .type', { hasText: 'Silhouette' }).click();
  await p.locator('app-figuration-picker .type', { hasText: 'Figurant spécial' }).click();
  await p.locator('app-figuration-picker').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(OUT, 'v2-inscription-figuration.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
  res.arrivee = new URL(p.url()).pathname;
  const tk = (await (await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) })).json()).accessToken;
  const me = await (await fetch(API + '/me/actor', { headers: { Authorization: 'Bearer ' + tk } })).json();
  res.enregistre = me.figuration;
  await p.goto(BASE + '/mon-profil'); await p.waitForTimeout(2500);
  const fig = p.locator('app-figuration-picker'); await fig.scrollIntoViewIfNeeded().catch(() => {});
  res.profil = await fig.locator('.type.on').allInnerTexts().then(a => a.map(x => x.split('\n')[0])).catch(() => []);
  await fig.screenshot({ path: path.join(OUT, 'v2-profil-figuration.jpg'), type: 'jpeg', quality: 75 }).catch(() => {});
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
