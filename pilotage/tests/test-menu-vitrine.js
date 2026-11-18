// T-140 · Le menu de la vitrine sélectionne bien la section cliquée (Agences et Acteurs sont côte à côte sur ordinateur).
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true }); const out = {};
  for (const [dev, opt] of [['bureau', { viewport: { width: 1366, height: 820 } }], ['mobile', { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true }]]) {
    const p = await (await b.newContext(opt)).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:4200/'); await p.waitForSelector('app-splash .skip'); await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
    const on = () => p.locator('#menu-mobile a.on').first().textContent().catch(() => '(aucun)');
    const r = {};
    for (const [id, label] of [['agences', 'Agences'], ['acteurs', 'Acteurs'], ['agences', 'Agences'], ['engagements', 'Vos données'], ['methode', 'Comment ça marche']]) {
      if (dev === 'mobile') { await p.click('button.burger'); await p.waitForTimeout(300); }
      await p.click(`#menu-mobile a[href="#${id}"]`); await p.waitForTimeout(1900);
      const apres = await on();
      await p.mouse.wheel(0, 60); await p.waitForTimeout(400);
      r[label + (r[label] ? ' (2e)' : '')] = { selection: (apres || '').trim(), apresPetitDefilement: ((await on()) || '').trim() };
    }
    out[dev] = { r, errs };
  }
  await b.close(); console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
