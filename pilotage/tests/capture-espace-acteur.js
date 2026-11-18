// T-141 · « Mon espace » d'un acteur de recette convoqué à une audition ; captures ordinateur et mobile.
// Le compte recette.espace.*@exemple.tn est effacé ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200';
const OUT = 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage\\nav';
const ROLE = process.argv[2];
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const email = `recette.espace.${Date.now()}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
  const reg = await j('/auth/register', { method: 'POST', body: JSON.stringify({ acceptTerms: true, age: 'MAJEUR', email, password: pw, firstName: 'Salma', lastName: 'Recette' }) });
  const atk = reg.b.accessToken;
  const me = await j('/me', {}, atk);
  await j('/me/actor', { method: 'PUT', body: JSON.stringify({ firstName: 'Salma', lastName: 'Recette', city: 'Tunis', gender: 'Femme', birthDate: '1997-04-12', height: 168 }) }, atk);
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const e = await j(`/roles/${ROLE}/shortlist`, { method: 'POST', body: JSON.stringify({ actorId: me.b.actorId }) }, adm);
  const d = new Date(Date.now() + 2 * 864e5); const iso = d.toISOString().slice(0, 10);
  const off = await j(`/shortlist/${e.b.id}/offers`, { method: 'POST', body: JSON.stringify({ kind: 'AUDITION', auditionDate: iso, auditionTime: '10:30', auditionPlace: 'Studio Lumière, 12 rue de Marseille, Tunis', message: 'Scène 2, texte joint.' }) }, adm);
  const res = { inscription: reg.s, shortlist: e.s, convocation: off.s };
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [dev, opt] of [['bureau', { viewport: { width: 1280, height: 860 } }], ['mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const ctx = await b.newContext({ ...opt, colorScheme: 'dark' }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', x => errs.push(x.message));
    await p.goto(BASE + '/auth/login'); await p.fill('#email', email); await p.fill('#password', pw); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 20000 }).catch(() => {});
    res['arrivee_' + dev] = new URL(p.url()).pathname;
    await p.goto(BASE + '/mon-espace'); await p.waitForTimeout(2200);
    await p.addStyleTag({ content: 'app-email-banner{display:none!important}' }).catch(() => {});
    await p.screenshot({ path: path.join(OUT, `t141-espace-${dev}.jpg`), type: 'jpeg', quality: 78, fullPage: dev === 'bureau' });
    res['tuiles_' + dev] = await p.locator('.tile').count();
    res['aTraiter_' + dev] = (await p.locator('.tile >> nth=0').innerText()).replace(/\s+/g, ' ');
    res['erreurs_' + dev] = errs;
    await ctx.close();
  }
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
