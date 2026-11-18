// Recherche IA : détail déplié dans la fiche (mobile) et vue liste (bureau)
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const OUT = 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage\\nav';
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }); const res = {};
  for (const [dev, opt] of [['bureau', { viewport: { width: 1366, height: 768 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const p = await (await b.newContext({ ...opt, colorScheme: 'dark' })).newPage();
    await p.goto('http://localhost:4200/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 20000 }); await p.goto('http://localhost:4200/chat'); await p.waitForTimeout(1200);
    await p.addStyleTag({ content: 'img[src*="/api/"]{filter:blur(14px)}' });
    await p.fill('textarea', 'Actrice qui parle anglais à Tunis'); await p.keyboard.press('Enter'); await p.waitForTimeout(9000);
    await p.click('.card.top .expand'); await p.waitForTimeout(600);
    res[dev] = await p.evaluate(() => { const c = document.querySelector('.card.top'); const m = c.querySelector('.more-in').getBoundingClientRect(); const r = c.getBoundingClientRect();
      return { ouvert: c.classList.contains('open'), detailDansFiche: m.bottom <= r.bottom + 1 && m.height > 20 }; });
    await p.screenshot({ path: path.join(OUT, `diag-detail-${dev}.jpg`), type: 'jpeg', quality: 70 });
    await p.click('.view-toggle button:nth-child(2)'); await p.waitForTimeout(600);
    res[dev].liste = await p.evaluate(() => document.querySelectorAll('.actor-result-card').length);
    await p.screenshot({ path: path.join(OUT, `diag-liste-${dev}.jpg`), type: 'jpeg', quality: 70 });
  }
  await b.close(); console.log(JSON.stringify(res));
})().catch(e => { console.error(e.message); process.exit(1); });
