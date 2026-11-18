// Diagnostic mise en page / défilement de la recherche IA (ordinateur et mobile)
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const OUT = 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage\\nav';
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }); const res = {};
  for (const [dev, opt] of [['bureau', { viewport: { width: 1366, height: 768 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    const p = await (await b.newContext({ ...opt, colorScheme: 'dark' })).newPage();
    await p.goto('http://localhost:4200/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 20000 }); await p.goto('http://localhost:4200/chat'); await p.waitForTimeout(1500);
    await p.addStyleTag({ content: 'img[src*="/api/"]{filter:blur(14px)}' });
    await p.screenshot({ path: path.join(OUT, `diag-chat-vide-${dev}.jpg`), type: 'jpeg', quality: 70 });
    for (const q of ['Actrice entre 20 et 35 ans qui parle anglais', 'Homme de 40 ans à Paris']) { await p.fill('textarea', q); await p.keyboard.press('Enter'); await p.waitForTimeout(5000); }
    // Remonter puis glisser une fiche : la zone ne doit pas redescendre toute seule
    const remonte = await p.evaluate(async () => { const l = document.querySelector('.messages-list'); l.scrollTop = 0; await new Promise(r => setTimeout(r, 300)); return l.scrollTop; });
    await p.evaluate(async () => { const l = document.querySelector('.messages-list'); l.scrollTop = 0; });
    await p.waitForTimeout(800);
    const resteEnHaut = await p.evaluate(() => document.querySelector('.messages-list').scrollTop);
    await p.fill('textarea', 'Comédienne qui chante'); await p.keyboard.press('Enter'); await p.waitForTimeout(5000);
    const vis = await p.evaluate(() => {
      const l = document.querySelector('.messages-list').getBoundingClientRect();
      const decks = document.querySelectorAll('app-swipe-deck'); const d = decks[decks.length - 1]?.querySelector('.deck')?.getBoundingClientRect();
      const ctrl = decks[decks.length - 1]?.querySelector('.act')?.getBoundingClientRect();
      const users = document.querySelectorAll('.user-message'); const u = users[users.length - 1].getBoundingClientRect();
      return { demandeEnHaut: Math.round(u.top - l.top), carteHaut: d && Math.round(d.top - l.top), carteBas: d && Math.round(l.bottom - d.bottom), boutonsVisibles: !!ctrl && ctrl.bottom <= l.bottom + 1, hauteurCarte: d && Math.round(d.height), resumes: document.querySelectorAll('.older').length };
    });
    const m = await p.evaluate(() => {
      const se = document.scrollingElement; const scrollers = [...document.querySelectorAll('*')].filter(e => { const s = getComputedStyle(e); return /(auto|scroll)/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 2; })
        .map(e => (e.className && typeof e.className === 'string' ? e.className.split(' ')[0] : e.tagName) + ':' + e.scrollHeight + '/' + e.clientHeight + '@' + e.scrollTop);
      const input = document.querySelector('.input-area')?.getBoundingClientRect();
      return { page: se.scrollHeight + '/' + innerHeight, scrollers, inputTop: input && Math.round(input.top), inputBottom: input && Math.round(input.bottom), vh: innerHeight,
        horiz: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    await p.screenshot({ path: path.join(OUT, `diag-chat-${dev}.jpg`), type: 'jpeg', quality: 70 });
    res[dev] = { ...m, remonte, resteEnHaut, vis };
  }
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
