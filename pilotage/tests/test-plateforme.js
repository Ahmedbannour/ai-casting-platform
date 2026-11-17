// Recette navigateur de la plateforme AI Casting (site localhost:4200 + serveur 8080), Edge sans fenêtre.
// Comptes : administrateur de démonstration du profil dev (DataSeederService) ; un acteur de test créé par l'inscription.
const { chromium } = require('playwright-core');
const out = process.env.TEMP + '\\pw\\plat-';
const BASE = 'http://localhost:4200';
const ok = [], ko = [], notes = [];
const check = (n, c, i) => (c ? ok : ko).push(n + (i !== undefined ? ' → ' + JSON.stringify(i).slice(0, 220) : ''));

async function audit(page, path, name, errors) {
  const t0 = Date.now();
  await page.goto(BASE + path); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({
    url: location.pathname, h1: document.querySelector('h1')?.textContent?.trim() || null,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
    broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')).length
  }));
  r.ms = Date.now() - t0;
  check(`${name} : la page s'affiche (${path})`, !!r.h1 && r.url === path.split('#')[0], r);
  check(`${name} : pas de débordement horizontal`, !r.overflow);
  check(`${name} : pas d'image cassée`, r.broken === 0, r.broken);
  await page.screenshot({ path: out + name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.png' });
  return r;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const vp of [{ name: 'Bureau', w: 1366, h: 820, mobile: false }, { name: 'Mobile', w: 390, h: 844, mobile: true }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile, locale: 'fr-FR' });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('pageerror', () => {});
    page.on('response', r => { const u = r.url(); if (r.status() >= 400 && !/auth\/login$|google|facebook|gstatic/.test(u)) errors.push(`HTTP ${r.status()} ${r.request().method()} ${u.replace(BASE, '').replace('http://localhost:8080', '')}`); });
    const P = vp.name + ' · ';

    // Connexion
    await page.goto(BASE + '/auth/login'); await page.waitForTimeout(2500);
    check(P + 'Connexion : bouton Google affiché', await page.locator('.google-slot iframe').count() === 1);
    check(P + 'Connexion : bouton Facebook affiché', await page.locator('.fb-btn').count() === 1);
    await page.fill('#email', `inconnu.${Date.now()}@exemple.tn`); await page.fill('#password', 'mauvais-mdp-123');
    await page.click('button.submit-btn'); await page.waitForTimeout(1200);
    const err = await page.locator('[role=alert], .error, .form-error').first().textContent().catch(() => '');
    check(P + 'Connexion : mauvais mot de passe → message clair', /incorrect/i.test(err || ''), err);
    await page.fill('#email', 'ahmed@casting.com'); await page.fill('#password', 'password123');
    await page.click('button.submit-btn'); await page.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
    const logged = !page.url().includes('/auth');
    check(P + 'Connexion administrateur (compte de démo du profil dev)', logged, page.url());
    if (!logged) { await ctx.close(); continue; }

    // Pages agence / administration
    await audit(page, '/admin', P + 'Administration', errors);
    for (const tab of ['Agences', 'Journal']) {
      const b = page.getByRole('tab', { name: new RegExp(tab, 'i') }).or(page.getByRole('button', { name: new RegExp('^' + tab, 'i') })).first();
      if (await b.count()) { await b.click(); await page.waitForTimeout(500); check(P + `Administration : onglet ${tab}`, true); }
      else notes.push(P + `onglet ${tab} introuvable par son nom`);
    }
    await audit(page, '/dashboard', P + 'Tableau de bord', errors);
    await audit(page, '/projects', P + 'Projets', errors);

    // Cloche
    const bell = page.locator(vp.mobile ? '.m-bell .bell' : 'app-sidebar .bell, .sidebar .bell').first();
    if (await bell.count()) { await bell.click(); await page.waitForTimeout(500);
      const pan = await page.evaluate(() => { const p = document.querySelector('.cdk-overlay-container .panel'); if (!p) return null; const r = p.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: innerWidth }; });
      check(P + 'Cloche : panneau entier dans l\'écran', !!pan && pan.l >= 0 && pan.r <= pan.w, pan);
      await page.keyboard.press('Escape'); }

    // Recherche IA
    await page.goto(BASE + '/chat'); await page.waitForTimeout(800);
    const t0 = Date.now();
    await page.fill('textarea', 'Actrice entre 20 et 30 ans à Tunis, qui parle anglais');
    await page.keyboard.press('Enter');
    const before = await page.locator('.messages-list article.card').count();
    await page.waitForFunction(n => document.querySelectorAll('.messages-list article.card').length > n, before, { timeout: 120000 }).catch(() => {});
    const found = (await page.locator('.messages-list article.card').count()) - before;
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    check(P + `Recherche IA : des profils proposés (${secs} s)`, found > 0, secs);
    await page.waitForTimeout(800); await page.screenshot({ path: out + (vp.mobile ? 'mobile' : 'bureau') + '-recherche.png' });
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check(P + 'Recherche IA : pas de débordement', !ov);

    // Fiche acteur
    await page.goto(BASE + '/dashboard'); await page.waitForTimeout(500);
    const actorLink = await page.evaluate(() => [...document.querySelectorAll('a[href^="/actors/"]')].map(a => a.getAttribute('href')).find(h => /^\/actors\/[0-9a-f-]{36}$/.test(h)));
    if (actorLink) await audit(page, actorLink, P + 'Fiche acteur', errors); else notes.push(P + 'aucun lien de fiche acteur sur le tableau de bord');

    check(P + 'Aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // Parcours acteur : inscription d'un compte de test
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: 'fr-FR' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const mail = `recette.e2e.${Date.now()}@exemple.tn`;
  await page.goto(BASE + '/auth/inscription'); await page.waitForTimeout(1500);
  await page.fill('#firstName', 'Recette'); await page.fill('#lastName', 'Automatique');
  await page.fill('#email', mail); await page.fill('#password', 'Recette-' + Date.now());
  await page.click('button.submit-btn'); await page.waitForURL(u => u.pathname.startsWith('/mon-profil'), { timeout: 15000 }).catch(() => {});
  check('Acteur : inscription puis arrivée sur « Mon profil »', page.url().includes('/mon-profil'), page.url());
  notes.push('Compte acteur de test créé : ' + mail + ' (à supprimer avec les autres comptes de test, T-127)');
  await audit(page, '/mon-profil', 'Acteur · Mon profil', errors);
  await page.getByRole('radio', { name: /En pause/i }).first().click(); await page.waitForTimeout(1000);
  await page.reload(); await page.waitForTimeout(1500);
  check('Acteur : « en pause » enregistré (après rechargement)', await page.getByRole('radio', { name: /En pause/i }).first().getAttribute('aria-checked') === 'true');
  await page.getByRole('radio', { name: /Visible des agences/i }).first().click(); await page.waitForTimeout(800);
  await audit(page, '/mon-profil/photos', 'Acteur · Mes photos', errors);
  await audit(page, '/mes-propositions', 'Acteur · Propositions', errors);
  await page.goto(BASE + '/admin'); await page.waitForTimeout(800);
  check('Acteur : pas d\'accès à l\'administration', !page.url().endsWith('/admin'), page.url());
  check('Acteur : aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3));
  await ctx.close(); await browser.close();

  console.log('RÉUSSIS (' + ok.length + ')\n  ' + ok.join('\n  '));
  console.log('ÉCHECS (' + ko.length + ')\n  ' + ko.join('\n  '));
  console.log('NOTES\n  ' + notes.join('\n  '));
})().catch(e => { console.error('ERREUR', e); process.exit(1); });
