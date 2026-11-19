// Mise en page de « Mon profil » (acteur) : la carte « Mes données » doit rester dans la colonne du formulaire.
// Compte recette.espace.*@exemple.tn, effacé ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const path = require('path');
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200';
const OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const email = `recette.espace.${Date.now()}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
  const reg = await j('/auth/register', { method: 'POST', body: JSON.stringify({ acceptTerms: true, age: 'MAJEUR', email, password: pw, firstName: 'Salma', lastName: 'Recette' }) });
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const res = { inscription: reg.s };
  for (const [dev, w, h] of [['bureau', 1440, 900], ['tablette', 900, 1000]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark' }); const p = await ctx.newPage();
    await p.goto(BASE + '/auth/login'); await p.fill('#email', email); await p.fill('#password', pw); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 20000 }).catch(() => {});
    await p.goto(BASE + '/mon-profil'); await p.waitForTimeout(2500);
    await p.addStyleTag({ content: 'app-email-banner{display:none!important}' }).catch(() => {});
    const md = p.locator('app-my-data'); await md.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
    const boxes = await p.evaluate(() => { const r = e => { const b = document.querySelector(e)?.getBoundingClientRect(); return b && { x: Math.round(b.x), w: Math.round(b.width) }; }; return { toc: r('.toc-wrap'), form: r('form.sections'), data: r('app-my-data') }; });
    res[dev] = boxes;
    await p.screenshot({ path: path.join(OUT, `mon-profil-${dev}.jpg`), type: 'jpeg', quality: 75 });
    await ctx.close();
  }
  await b.close(); console.log(JSON.stringify(res));
})().catch(e => { console.error(e.message); process.exit(1); });
