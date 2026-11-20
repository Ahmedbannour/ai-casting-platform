// Popups sur téléphone : « Nouveau projet » et « Nouveau rôle » défilent, la description garde sa hauteur.
const { chromium, devices } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  const res = {};
  for (const [nom, vp] of [['petit', { width: 360, height: 640 }], ['grand', { width: 412, height: 860 }]]) {
    const p = await (await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6, colorScheme: 'dark' })).newPage(); p.setDefaultTimeout(10000);
    await p.goto(BASE + '/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
    await p.goto(BASE + '/projects'); await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /Nouveau projet/ }).first().click(); await p.waitForTimeout(600);
    const m = await p.evaluate(() => {
      const panel = document.querySelector('app-project-form .panel') || document.querySelector('.panel');
      const ta = panel.querySelector('textarea');
      return { hauteurDescription: Math.round(ta.getBoundingClientRect().height), defile: panel.scrollHeight > panel.clientHeight, hauteurPopup: Math.round(panel.getBoundingClientRect().height), ecran: innerHeight };
    });
    await p.evaluate(() => { const panel = document.querySelector('.panel'); panel.scrollTop = panel.scrollHeight; });
    await p.waitForTimeout(300);
    m.boutonVisibleEnBas = await p.getByRole('button', { name: 'Créer le projet' }).isVisible();
    await p.screenshot({ path: path.join(OUT, `popup-projet-${nom}.jpg`), type: 'jpeg', quality: 70 });
    res[nom] = m;
  }
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
