// Tests de la salle de pilotage (P-035) : roadmap, carte mentale -> tchat, tchat style messagerie.
const { chromium } = require('playwright-core');
const out = process.env.TEMP + '\\pw\\';
const URL = 'http://127.0.0.1:8765/tableau-de-bord.html';
const ok = [], ko = [];
const check = (name, cond, info) => { (cond ? ok : ko).push(name + (info !== undefined ? ' → ' + JSON.stringify(info) : '')); };

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // 1. Roadmap
  await page.goto(URL + '#roadmap'); await page.waitForSelector('#rm-grid .rm-lotbar', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(400);
  const rm = await page.evaluate(() => ({
    bars: document.querySelectorAll('#rm-grid .rm-bar:not(.lotbar)').length,
    lots: document.querySelectorAll('#rm-grid .rm-lotbar').length,
    today: document.querySelector('.rm-day.today')?.textContent,
    todayLine: !!document.querySelector('.rm-today'),
    scrolled: document.getElementById('rm-scroll').scrollLeft > 0
  }));
  const planned = Object.keys(JSON.parse(require('fs').readFileSync(require('path').join(process.env.PILOTAGE || 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage', 'data.json'), 'utf8')).plan.calendrier || {}).length;

  const DATA = JSON.parse(require('fs').readFileSync(require('path').join(process.env.PILOTAGE || 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage', 'data.json'), 'utf8'));
  const nLots = DATA.plan.lots.filter(l => l.taches.some(i => DATA.plan.calendrier[i])).length;
  check('Roadmap : ' + nLots + ' lots (plan v2 : 8 lots + 6 sprints)', rm.lots === nLots, rm.lots);
  check('Roadmap : colonne du jour = ' + new Date().getDate(), rm.today === String(new Date().getDate()), rm.today);
  // « Tout déplier » : une barre par tâche planifiée d'un lot
  const ids = new Set(DATA.taches.map(t => t.id));
  const expected = new Set(DATA.plan.lots.flatMap(l => l.taches.filter(i => DATA.plan.calendrier[i] && ids.has(i)))).size;
  await page.click('#rm-all'); await page.waitForTimeout(300);
  const nb = await page.evaluate(() => document.querySelectorAll('#rm-grid .rm-bar[data-task]').length);
  check('Roadmap : une barre par tâche planifiée (' + expected + ')', nb === expected, nb);
  check('Roadmap : ligne « aujourd’hui »', rm.todayLine);
  const align = await page.evaluate(() => {
    const bad = [];
    document.querySelectorAll('#rm-grid .rm-bar[data-task]').forEach(b => {
      const lab = document.querySelector(`#rm-grid .rm-lab[data-task="${b.dataset.task}"]`);
      const yb = b.getBoundingClientRect(), yl = lab.getBoundingClientRect();
      if (Math.abs((yb.top + yb.bottom) / 2 - (yl.top + yl.bottom) / 2) > 3) bad.push(b.dataset.task);
    });
    const lots = [...document.querySelectorAll('#rm-grid .rm-lotbar')].map(b => b.getBoundingClientRect().top);
    const lotLabs = [...document.querySelectorAll('#rm-grid .rm-lab.lot')].map(l => { const r = l.getBoundingClientRect(); return r; });
    const lotBad = lots.filter((t, i) => !(t >= lotLabs[i].top && t <= lotLabs[i].bottom)).length;
    const td = document.querySelector('.rm-day.today').getBoundingClientRect();
    const lab = document.querySelector('.rm-corner').getBoundingClientRect();
    return { bad, lotBad, todayVisible: td.left >= lab.right - 1 };
  });
  check('Roadmap : chaque barre est sur la ligne de sa tâche', align.bad.length === 0, align.bad);
  check('Roadmap : chaque barre de lot sur sa ligne', align.lotBad === 0, align.lotBad);
  check('Roadmap : le jour courant est visible', align.todayVisible);
  await page.screenshot({ path: out + 'roadmap.png' });
  await page.click('#rm-z-w'); await page.waitForTimeout(200);
  const wk = await page.evaluate(() => getComputedStyle(document.getElementById('rm-grid')).gridTemplateColumns.split(' ')[1]);
  check('Roadmap : zoom semaines (12 px par jour)', wk === '12px', wk);
  await page.click('#rm-z-d');
  await page.click('#rm-fs'); await page.waitForTimeout(400);
  const fs = await page.evaluate(() => !!document.fullscreenElement || document.getElementById('rm-wrap').classList.contains('fs'));
  check('Roadmap : plein écran', fs);
  await page.screenshot({ path: out + 'roadmap-plein-ecran.png' });
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); document.getElementById('rm-wrap').classList.remove('fs'); });
  // La tâche en cours est dans un lot replié : on ouvre son lot, puis on clique sa barre
  const lotEnCours = DATA.plan.lots.find(l => l.taches.includes(DATA.plan.courante)).id;
  if (!(await page.isVisible('.rm-bar.en_cours'))) { await page.click(`#rm-grid .rm-lab[data-lot="${lotEnCours}"]`); await page.waitForTimeout(300); }
  await page.click('.rm-bar.en_cours'); await page.waitForTimeout(200);
  check('Roadmap : clic sur une barre ouvre la tâche', await page.isVisible('#modal.on'));
  await page.keyboard.press('Escape');

  // 2. Carte mentale : clic sur un agent -> conversation
  await page.goto(URL + '#carte'); await page.waitForTimeout(800);
  await page.click('#mm-all'); await page.waitForTimeout(400);
  const clicked = await page.evaluate(() => {
    const g = [...document.querySelectorAll('#mm g.node')].find(x => x.querySelector('circle.main') && x.textContent.includes('Rami Saidi'));
    if (!g) return false; g.querySelector('circle.main').dispatchEvent(new MouseEvent('click', { bubbles: true })); return true;
  });
  await page.waitForTimeout(400);
  const conv = await page.evaluate(() => ({
    open: document.getElementById('chatp').classList.contains('on'),
    who: document.querySelector('.wa-mh .who b')?.textContent,
    status: document.getElementById('wa-status')?.textContent
  }));
  check('Carte mentale : agent trouvé et cliqué', clicked);
  check('Carte mentale : la conversation s’ouvre', conv.open && conv.who === 'Rami Saidi', conv);

  // 3. Tchat
  await page.fill('#ch-in', 'Où en es-tu ?'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.fill('#ch-in', 'Et après ?'); await page.click('#ch-send'); await page.waitForTimeout(1500);
  const chat = await page.evaluate(() => ({
    me: [...document.querySelectorAll('#ch-msgs .wb.me .tx')].map(e => e.textContent),
    ag: [...document.querySelectorAll('#ch-msgs .wb.ag .tx')].map(e => e.textContent),
    retry: document.querySelectorAll('#ch-msgs .retry').length,
    ticks: document.querySelectorAll('#ch-msgs .wb.me .ticks').length,
    sendDisabled: document.getElementById('ch-send').disabled,
    input: document.getElementById('ch-in').value,
    list: document.querySelectorAll('.wa-c').length
  }));
  const agents = JSON.parse(require('fs').readFileSync(require('path').join(process.env.PILOTAGE || 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage', 'data.json'), 'utf8')).departements.reduce((a, d) => a + d.membres.length, 0);
  check(`Tchat : ${agents} agents dans la liste`, chat.list === agents, chat.list);
  check('Tchat : 2 messages envoyés à la suite', chat.me.length === 2, chat.me);
  check('Tchat : heure + coches sur mes messages', chat.ticks === 2, chat.ticks);
  check('Tchat : champ vidé après envoi', chat.input === '');
  check('Tchat : bouton jamais grisé', !chat.sendDisabled);
  check('Tchat hors claude.ai : message clair + Réessayer', chat.retry === 2 && /claude\.ai/.test(chat.ag[0] || ''), chat.ag);
  await page.screenshot({ path: out + 'tchat-bureau.png' });
  // Reproduction de la panne sur claude.ai : fils venus de la base = objets en lecture seule
  const frozen = await page.evaluate(async () => {
    CHATS = Object.freeze({ 'Claire Dubois': Object.freeze([Object.freeze({ at: new Date().toISOString(), r: 'me', x: 'ancien message' })]) });
    const before = window.__errs = []; addEventListener('error', e => window.__errs.push(e.message));
    chatOpen('Claire Dubois'); await new Promise(r => setTimeout(r, 200));
    document.getElementById('ch-in').value = 'hi'; chatAsk(document.getElementById('ch-in').value);
    await new Promise(r => setTimeout(r, 1200));
    return { errs: window.__errs, me: [...document.querySelectorAll('#ch-msgs .wb.me .tx')].map(e => e.textContent), n: (CHATS['Claire Dubois'] || []).length };
  });
  check('Fil existant en lecture seule : envoi sans erreur', frozen.errs.length === 0 && frozen.me.includes('hi') && frozen.n >= 3, frozen);
  await page.fill('#wa-q', 'laura'); await page.waitForTimeout(150);
  check('Tchat : recherche d’agent', await page.locator('.wa-c').count() === 1);

  // 4. Mobile
  const m = await browser.newPage({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
  m.on('pageerror', e => errors.push('mobile: ' + e.message));
  await m.goto(URL + '#plan'); await m.waitForTimeout(800);
  await m.click('#team-fab'); await m.waitForTimeout(300);
  const ml = await m.evaluate(() => ({ side: getComputedStyle(document.querySelector('.wa-side')).display, main: getComputedStyle(document.querySelector('.wa-main')).display, w: document.getElementById('chatp').getBoundingClientRect().width }));
  check('Mobile : liste plein écran', ml.side !== 'none' && ml.main === 'none' && ml.w >= 370, ml);
  await m.click('.wa-c[data-chat="Sarra Mansouri"]'); await m.waitForTimeout(300);
  const mc = await m.evaluate(() => ({ side: getComputedStyle(document.querySelector('.wa-side')).display, main: getComputedStyle(document.querySelector('.wa-main')).display }));
  check('Mobile : conversation plein écran', mc.side === 'none' && mc.main !== 'none', mc);
  await m.screenshot({ path: out + 'tchat-mobile.png' });
  await m.click('#wa-back'); await m.waitForTimeout(200);
  check('Mobile : retour à la liste', await m.evaluate(() => getComputedStyle(document.querySelector('.wa-side')).display !== 'none'));
  await m.goto(URL + '#roadmap'); await m.waitForTimeout(600);
  check('Mobile : roadmap sans débordement de page', await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));

  check('Aucune erreur JavaScript', errors.length === 0, errors);
  console.log('RÉUSSIS (' + ok.length + ')\n  ' + ok.join('\n  '));
  console.log('ÉCHECS (' + ko.length + ')\n  ' + ko.join('\n  '));
  await browser.close();
})().catch(e => { console.error('ERREUR', e); process.exit(1); });
