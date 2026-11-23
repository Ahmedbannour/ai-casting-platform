// Sommaire « Sur cette fiche » de la fiche projet : un déroulé propre à chaque rôle.
// Comptes recette.*@exemple.tn et organisations « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const projet = require('./projet');
const choisir = require('./choisir');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
async function login(b, a) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }); const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  p.errs = []; p.on('pageerror', x => p.errs.push(x.message));
  await p.goto(BASE + '/auth/login'); await p.fill('#email', a.email); await p.fill('#password', a.pw); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
  if (p.url().includes('/consentement')) {
    await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check();
    await p.getByRole('button', { name: /^Continuer/ }).click();
    await p.waitForURL(u => !u.pathname.startsWith('/consentement'), { timeout: 10000 }).catch(() => {});
  }
  return p;
}
// Sommaire « Sur cette fiche » : chaque rôle voit son propre déroulé, la section en cours suit le défilement.
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const today = new Date().toISOString().slice(0, 10), st = Date.now(), acc = {}, res = { roles: {}, erreurs: [] };
  for (const [k, kind, nom] of [['M', 'MARQUE', 'Marque Datte'], ['A', 'AGENCE_MARKETING', 'Agence Gamma'], ['P', 'BOITE_PROD', 'Prod Delta']]) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${nom} ${st}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.som.${k.toLowerCase()}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: nom, role: kind, agencyId: o, password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + c.s);
    acc[k] = { email, pw, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  const id = await projet(j, { prodTk: acc.P.tk, title: 'Recette Dattes de Tozeur ' + st, brand: acc.M.email, agency: acc.A.email });
  await j(`/demandes/${id}/v0`, { method: 'PUT', body: JSON.stringify({ body: 'Une caravane au coucher du soleil, des dattes partagées.' }) }, acc.M.tk);
  await j(`/demandes/${id}/envoyer`, { method: 'POST', body: '{}' }, acc.M.tk);
  await j(`/demandes/${id}/accepter`, { method: 'POST' }, acc.A.tk);
  await j(`/demandes/${id}/v1`, { method: 'PUT', body: JSON.stringify({ body: 'Concept : la palmeraie s’éveille, la famille partage les dattes.' }) }, acc.A.tk);
  await j(`/demandes/${id}/v1/livrer`, { method: 'POST' }, acc.A.tk);
  await j(`/demandes/${id}/discussion`, { method: 'POST', body: JSON.stringify({ body: 'On tourne à Tozeur ou à Kébili ?' }) }, acc.P.tk);

  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  fs.mkdirSync(OUT, { recursive: true });
  for (const [k, label, vp] of [['M', 'marque', { width: 390, height: 844 }], ['P', 'producer', { width: 1600, height: 950 }], ['A', 'agence', { width: 1600, height: 950 }]]) {
    const p = await login(b, acc[k]); await p.setViewportSize(vp);
    await p.goto(BASE + '/demandes/' + id + '/historique'); await p.waitForSelector('app-page-rail nav', { timeout: 10000 }).catch(() => res.erreurs.push(label + ' : pas de sommaire'));
    await p.waitForTimeout(800);
    const items = await p.locator('app-page-rail li .lb').allTextContents();
    const tours = await p.locator('app-page-rail li[data-s="tour"] .lb').allTextContents();
    const r = { sections: items.map(s => s.trim()), aVous: tours.map(s => s.trim()) };
    await p.screenshot({ path: path.join(OUT, `sommaire-${label}-haut.png`) });
    if (vp.width < 600) {
      await p.locator('app-page-rail .bar').click(); await p.waitForTimeout(300);
      await p.screenshot({ path: path.join(OUT, `sommaire-${label}-ouvert.png`) });
      await p.locator('app-page-rail li a').last().click(); await p.waitForTimeout(900);
    } else {
      await p.locator('app-page-rail li a').last().click(); await p.waitForTimeout(900);
    }
    r.activeApresClic = (await p.locator('app-page-rail li.on .lb').first().textContent().catch(() => '')).trim();
    r.lu = (await p.locator('app-page-rail .ft span').last().textContent().catch(() => '')).trim();
    await p.screenshot({ path: path.join(OUT, `sommaire-${label}-bas.png`) });
    if (!r.sections.length) res.erreurs.push(label + ' : aucune section');
    if (r.activeApresClic !== r.sections.at(-1)) res.erreurs.push(label + ' : la section active ne suit pas (' + r.activeApresClic + ')');
    if (p.errs.length) res.erreurs.push(label + ' : ' + p.errs[0]);
    res.roles[label] = r;
  }
  if (!res.roles.marque?.aVous.length) res.erreurs.push('marque : l’action « À vous » (relire la V1) n’apparaît pas');
  if (res.roles.producer?.aVous.length || res.roles.agence?.aVous.length) res.erreurs.push('« À vous » affiché alors que c’est le tour de la marque');
  if (JSON.stringify(res.roles.marque?.sections) === JSON.stringify(res.roles.agence?.sections)) res.erreurs.push('la marque et l’agence voient le même sommaire');
  console.log(JSON.stringify(res, null, 1));
  await b.close();
  process.exit(res.erreurs.length ? 1 : 0);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
