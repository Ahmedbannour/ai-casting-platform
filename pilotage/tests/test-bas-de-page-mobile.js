// Téléphone : en bas de chaque page, le dernier élément passe au-dessus de la barre d'onglets (rien de caché dessous).
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const prj = (await j('/projects', { method: 'POST', body: JSON.stringify({ title: 'Recette bas de page', type: 'SERIE', description: 'Aa' }) }, adm)).b;
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  const p = await (await b.newContext({ viewport: { width: 412, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6, colorScheme: 'dark' })).newPage(); p.setDefaultTimeout(10000);
  await p.goto(BASE + '/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
  const res = {};
  for (const [nom, url] of [['projet', '/projects/' + prj.id], ['projets', '/projects'], ['acteurs', '/dashboard'], ['accueil', '/accueil']]) {
    await p.goto(BASE + url); await p.waitForTimeout(1800);
    const r = await p.evaluate(() => {
      const c = document.querySelector('.content'); c.scrollTop = c.scrollHeight;
      const bar = document.querySelector('.tabbar').getBoundingClientRect();
      // dernier élément visible du contenu de la page
      const all = [...c.querySelectorAll('button, a, p, h2, h3, li, input')].filter(e => e.offsetParent && e.getBoundingClientRect().height > 0);
      const last = all.reduce((a, e) => (!a || e.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom) ? e : a, null);
      return { basDernier: Math.round(last.getBoundingClientRect().bottom), hautBarre: Math.round(bar.top), texte: (last.innerText || last.value || '').trim().slice(0, 30) };
    });
    await p.waitForTimeout(200);
    r.visible = r.basDernier <= r.hautBarre;
    res[nom] = r;
    if (nom === 'projet') await p.screenshot({ path: path.join(OUT, 'bas-de-page-projet.jpg'), type: 'jpeg', quality: 70 });
  }
  await b.close(); await j('/projects/' + prj.id, { method: 'DELETE' }, adm);
  console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
