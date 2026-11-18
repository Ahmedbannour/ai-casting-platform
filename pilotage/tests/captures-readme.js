// Captures d'écran du README (docs/captures) : ordinateur 1280x800 et mobile 390x844.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const BASE = 'http://localhost:4200';
const OUT = path.join(__dirname, '..', '..', 'docs', 'captures');
const ROLE = process.argv[2];
const SCENES = [
  ['01-vitrine', '/', false, []],
  ['02-recherche-ia', '/chat', true, [{ fill: 'textarea', v: 'Actrice entre 20 et 35 ans qui parle anglais et sait danser' }, { press: 'Enter', wait: 9000 }]],
  ['03-acteurs-filtres', '/dashboard', true, [{ click: 'button.more-btn', wait: 700 }, { click: '.tags .tag >> nth=0', wait: 1200 }]],
  ['04-shortlist-role', ROLE ? '/roles/' + ROLE : '/projects', true, []],
  ['05-agenda', '/agenda', true, [{ click: '.range button >> nth=2', wait: 1200 }]],
  ['06-confidentialite', '/legal/confidentialite', false, []],
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  for (const [dev, opt] of [['bureau', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }], ['mobile', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const ctx = await b.newContext({ ...opt, colorScheme: 'dark' }); const p = await ctx.newPage();
    await p.goto(BASE + '/auth/login'); await p.waitForTimeout(1000);
    await p.fill('#email', QA.email); await p.fill('#password', QA.password);
    await p.click('button.submit-btn'); await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 20000 });
    // Bandeau « adresse non vérifiée » du compte de recette : masqué pour les captures
    await p.addStyleTag({ content: 'app-email-banner{display:none!important}' }).catch(() => {});
    for (const [name, route, auth, acts] of SCENES) {
      if (dev === 'mobile' && !['01-vitrine', '02-recherche-ia', '05-agenda'].includes(name)) continue;
      const pg = auth ? p : await (await b.newContext({ ...opt, colorScheme: 'dark' })).newPage();
      await pg.goto(BASE + route); await pg.waitForTimeout(2500);
      await pg.addStyleTag({ content: 'app-email-banner{display:none!important}' }).catch(() => {});
      // Dépôt public : les photos de démonstration sont floutées
      await pg.addStyleTag({ content: 'img[src*="/api/"],img[src*="casting-media"],img[src*="blob:"]{filter:blur(14px) saturate(.85)}' }).catch(() => {});
      for (const a of acts) { try { if (a.fill) await pg.fill(a.fill, a.v); if (a.click) await pg.click(a.click); if (a.press) await pg.keyboard.press(a.press); await pg.waitForTimeout(a.wait || 600); } catch (e) { console.error(name, e.message.split('\n')[0]); } }
      await pg.screenshot({ path: path.join(OUT, `${name}-${dev}.png`) });
      console.log('ok', name, dev);
      if (!auth) await pg.context().close();
    }
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
