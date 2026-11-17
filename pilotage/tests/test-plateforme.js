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
    if (page.url().includes('/consentement')) {
      // T-101 · accord demandé à la connexion : refus sans case cochée, puis accord
      await page.getByRole('radio', { name: /18 ans ou plus/i }).click();
      await page.getByRole('button', { name: /^Continuer/ }).click(); await page.waitForTimeout(400);
      check(P + 'Accord : case non cochée → message', /Cochez/.test(await page.locator('[role=alert]').textContent().catch(() => '')));
      await page.locator('.check input').check();
      await page.getByRole('button', { name: /^Continuer/ }).click();
      await page.waitForURL(u => !u.pathname.startsWith('/consentement'), { timeout: 10000 }).catch(() => {});
      check(P + 'Accord : enregistré puis retour à la page demandée', !page.url().includes('/consentement'), page.url());
    }
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
    if (vp.mobile) {
      const g = await page.evaluate(() => {
        const bell = document.querySelector('.m-bell .bell')?.getBoundingClientRect();
        const inter = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        // la cloche est dans la barre du haut (opaque) : seul compte le texte visible sous la barre
        const top = document.querySelector('.m-top')?.getBoundingClientRect();
        const inBar = !!top && bell && bell.top >= top.top && bell.bottom <= top.bottom;
        const hits = inBar ? [] : [...document.querySelectorAll('.messages-list *, h1')].filter(e => e.children.length === 0 && e.textContent.trim() && inter(bell, e.getBoundingClientRect())).map(e => e.textContent.trim().slice(0, 20));
        if (inBar && getComputedStyle(document.querySelector('.m-top')).position !== 'sticky') hits.push('barre non collée en haut');
        const ta = document.querySelector('textarea')?.getBoundingClientRect();
        return { hits, inputVisible: !!ta && ta.bottom <= innerHeight && ta.top >= 0 };
      });
      check(P + 'Mobile : la cloche ne recouvre aucun texte', g.hits.length === 0, g.hits);
      check(P + 'Mobile : la zone de saisie de la recherche reste visible', g.inputVisible);
    }
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    check(P + 'Recherche IA : pas de débordement', !ov);

    // Fiche acteur
    await page.goto(BASE + '/dashboard'); await page.waitForTimeout(500);
    const actorLink = await page.evaluate(() => [...document.querySelectorAll('a[href^="/actors/"]')].map(a => a.getAttribute('href')).find(h => /^\/actors\/[0-9a-f-]{36}$/.test(h)));
    if (actorLink) await audit(page, actorLink, P + 'Fiche acteur', errors); else notes.push(P + 'aucun lien de fiche acteur sur le tableau de bord');

    check(P + 'Aucune erreur JavaScript', errors.length === 0, errors.slice(0, 3));
    await ctx.close();
  }

  // T-102 · invitation : l'administrateur crée un lien, l'acteur l'ouvre sans être connecté et crée son compte
  { const api = 'http://localhost:8080/api';
    const tk = (await (await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ahmed@casting.com', password: 'password123' }) })).json()).accessToken;
    const im = `recette.invit.${Date.now()}@exemple.tn`;
    const act = await (await fetch(api + '/actors', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
      body: JSON.stringify({ firstName: 'Recette', lastName: 'Invitation', email: im }) })).json();
    const c1 = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
    const p1 = await c1.newPage(); const e1 = []; p1.on('pageerror', e => e1.push(e.message));
    await p1.goto(BASE + '/auth/login'); await p1.waitForTimeout(1200);
    await p1.fill('#email', 'ahmed@casting.com'); await p1.fill('#password', 'password123'); await p1.click('button.submit-btn');
    await p1.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
    await p1.goto(BASE + '/actors/' + act.id); await p1.waitForTimeout(1500);
    const btn = p1.getByRole('button', { name: /Créer le lien d'invitation/ });
    check('Invitation : bouton sur la fiche d\'un acteur sans compte', await btn.count() === 1);
    await btn.click(); await p1.waitForTimeout(900);
    const link = await p1.locator('app-invite-panel input').inputValue().catch(() => '');
    check('Invitation : lien affiché une fois créé', /\/invitation\/[A-Za-z0-9_-]{30,}$/.test(link), link.replace(/[^/]+$/, '…'));
    await p1.getByRole('button', { name: /Copier le lien/ }).click(); await p1.waitForTimeout(300);
    check('Invitation : bouton « Copié » après copie', await p1.getByRole('button', { name: /^Copié/ }).count() === 1);
    await p1.screenshot({ path: out + 'invitation-agence.png' });
    check('Invitation (agence) : aucune erreur JavaScript', e1.length === 0, e1.slice(0, 3));
    await c1.close();

    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
    const p2 = await c2.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(e.message));
    await p2.goto(link); await p2.waitForTimeout(1300);
    check('Invitation : page publique « Bonjour Recette » (mobile, sans connexion)', /Bonjour Recette/.test(await p2.locator('h1').textContent().catch(() => '')));
    check('Invitation : e-mail de la fiche pré-rempli', await p2.locator('#e').inputValue() === im);
    await p2.fill('#pw', 'Recette-' + Date.now()); await p2.getByRole('button', { name: /Créer mon compte/ }).click(); await p2.waitForTimeout(400);
    check('Invitation : refusée sans âge ni accord', /âge/.test(await p2.locator('[role=alert]').textContent().catch(() => '')));
    await p2.getByRole('radio', { name: /18 ans ou plus/ }).click(); await p2.locator('.check input').check();
    const over = await p2.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    await p2.screenshot({ path: out + 'invitation-acteur.png', fullPage: true });
    await p2.getByRole('button', { name: /Créer mon compte/ }).click();
    await p2.waitForURL(u => u.pathname.startsWith('/mon-profil'), { timeout: 15000 }).catch(() => {});
    check('Invitation : compte créé, arrivée sur « Mon profil » sans redemande d\'accord', p2.url().includes('/mon-profil'), p2.url());
    check('Invitation : pas de débordement sur mobile', !over);
    await p2.goto(link); await p2.waitForTimeout(1200);
    check('Invitation : lien déjà utilisé → « Lien plus valable »', /plus valable/.test(await p2.locator('h1').textContent().catch(() => '')));
    check('Invitation (acteur) : aucune erreur JavaScript', e2.length === 0, e2.slice(0, 3));
    notes.push('Compte acteur de test créé par invitation : ' + im + ' (T-127)');
    await c2.close(); }

  // Parcours acteur : inscription d'un compte de test
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 }, locale: 'fr-FR' });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const mail = `recette.e2e.${Date.now()}@exemple.tn`;
  await page.goto(BASE + '/auth/inscription'); await page.waitForTimeout(1500);
  await page.fill('#firstName', 'Recette'); await page.fill('#lastName', 'Automatique');
  await page.fill('#email', mail); await page.fill('#password', 'Recette-' + Date.now());
  await page.click('button.submit-btn'); await page.waitForTimeout(600);
  check('Inscription : refusée sans âge ni case cochée', page.url().includes('/auth/inscription') && await page.locator('.consent.error').count() === 1);
  await page.getByRole('radio', { name: /Moins de 18 ans/i }).click(); await page.locator('.consent input').check();
  await page.click('button.submit-btn'); await page.waitForTimeout(600);
  check('Inscription : mineur sans représentant légal → refusée', page.url().includes('/auth/inscription') && await page.locator('#guardianName').count() === 1);
  await page.getByRole('radio', { name: /18 ans ou plus/i }).click();
  check('Inscription : champ représentant masqué pour un majeur', await page.locator('#guardianName').count() === 0);
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
  await ctx.close();

  // T-101 · pages publiques des textes
  { const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' }); const p2 = await c2.newPage();
    for (const [u, t] of [['/legal/conditions', /Conditions d’utilisation/], ['/legal/confidentialite', /Politique de confidentialité/]]) {
      await p2.goto(BASE + u); await p2.waitForTimeout(900);
      const h = await p2.locator('h1').textContent().catch(() => '');
      const over = await p2.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      check(`Page publique ${u} (mobile, sans connexion)`, t.test(h || '') && !over && !p2.url().includes('/auth'), { h, over });
    }
    // Vitrine publique
    await p2.goto(BASE + '/'); await p2.waitForTimeout(4500);
    check('Vitrine : affichée aux visiteurs (mobile)', /Décrivez le rôle/.test(await p2.locator('h1').textContent().catch(() => '')) && p2.url() === BASE + '/');
    await p2.locator('.deck').scrollIntoViewIfNeeded(); await p2.waitForTimeout(400);
    { const bx = await p2.locator('.card.top').boundingBox(); const x0 = bx.x + bx.width / 2, y0 = bx.y + bx.height / 2;
      await p2.mouse.move(x0, y0); await p2.mouse.down(); for (let i = 1; i <= 8; i++) await p2.mouse.move(x0 + i * 22, y0);
      await p2.mouse.up(); await p2.waitForTimeout(500); }
    check('Vitrine : glisser une fiche à droite la retient', (await p2.locator('.deck-ctrl .count').textContent()).trim().startsWith('2'));
    await p2.locator('.deck').focus(); await p2.keyboard.press('ArrowLeft'); await p2.waitForTimeout(450);
    for (let i = 0; i < 3; i++) { await p2.getByRole('button', { name: 'Retenir ce profil' }).click(); await p2.waitForTimeout(420); }
    await p2.waitForTimeout(600);
    check('Vitrine : résumé après la dernière fiche', /retenus? sur 5/.test(await p2.locator('.summary h3').textContent().catch(() => '')));
    await p2.getByRole('button', { name: /Rôle d’enfant/ }).click(); await p2.waitForTimeout(1200);
    check('Vitrine : choisir un autre rôle relance les fiches', /Adam/.test(await p2.locator('.card.top h3').textContent().catch(() => '')));
    check('Vitrine : pas de débordement sur mobile', !(await p2.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
    // Contact : erreurs claires, envoi, e-mail affiché à la demande, carte
    await p2.locator('#contact').scrollIntoViewIfNeeded(); await p2.waitForTimeout(800);
    await p2.getByRole('button', { name: 'Envoyer le message' }).click(); await p2.waitForTimeout(300);
    check('Vitrine contact : erreurs sous les champs, focus sur le premier', await p2.locator('.f .err').count() === 3 && await p2.evaluate(() => document.activeElement?.id) === 'c-name');
    await p2.fill('#c-name', 'Recette Vitrine'); await p2.fill('#c-email', 'recette.vitrine@exemple.tn');
    await p2.fill('#c-message', 'Message de recette automatique, à ignorer (T-127).');
    await p2.getByRole('button', { name: 'Envoyer le message' }).click(); await p2.waitForTimeout(1500);
    check('Vitrine contact : message envoyé et confirmé', await p2.locator('.sent[role=status]').count() === 1);
    await p2.getByRole('button', { name: 'Afficher notre e-mail' }).click();
    check('Vitrine contact : e-mail affiché seulement au clic', /@gmail\.com$/.test(await p2.locator('.direct a').textContent()));
    await p2.waitForTimeout(2500);
    check('Vitrine : carte chargée avec le repère', await p2.locator('.pin').count() === 1 || await p2.locator('.map-fallback').count() === 1);
    await p2.locator('.burger').click(); await p2.getByRole('link', { name: /^Créer mon profil$/ }).first().click();
    await p2.waitForURL(u => u.pathname.startsWith('/auth/inscription'), { timeout: 8000 }).catch(() => {});
    check('Vitrine : menu mobile → inscription', p2.url().includes('/auth/inscription'), p2.url());
    await c2.close(); }
  { const c4 = await browser.newContext({ viewport: { width: 1600, height: 860 }, locale: 'fr-FR' }); const p4 = await c4.newPage();
      await p4.goto(BASE + '/'); await p4.waitForTimeout(2200);
      check('Vitrine : le haut de page couvre l\'écran', Math.abs(await p4.evaluate(() => document.querySelector('.hero').getBoundingClientRect().bottom - innerHeight)) <= 4);
      await p4.getByRole('link', { name: 'Comment ça marche' }).first().click(); await p4.waitForTimeout(500);
      check('Vitrine : rideau « Scène 02 » au clic sur le menu', /Comment ça marche/.test(await p4.locator('.wipe-title').textContent()) && await p4.locator('.wipe').isVisible());
      await p4.waitForTimeout(1300);
      check('Vitrine : arrivée sur la section choisie', Math.abs(await p4.evaluate(() => document.getElementById('methode').getBoundingClientRect().top) - 68) <= 6);
      await c4.close(); }
  { const c3 = await browser.newContext({ viewport: { width: 1366, height: 860 }, locale: 'fr-FR' }); const p3 = await c3.newPage();
    await p3.goto(BASE + '/auth/login'); await p3.waitForTimeout(1000);
    await p3.fill('#email', 'ahmed@casting.com'); await p3.fill('#password', 'password123'); await p3.click('button.submit-btn');
    await p3.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
    await p3.goto(BASE + '/'); await p3.waitForTimeout(1200);
    check('Vitrine : un utilisateur connecté va directement à son espace', new URL(p3.url()).pathname !== '/', p3.url());
    await p3.goto(BASE + '/admin'); await p3.waitForTimeout(1200);
    await p3.getByRole('tab', { name: 'Messages' }).click(); await p3.waitForTimeout(900);
    check('Administration : onglet Messages avec le message de la vitrine', await p3.locator('app-contact-inbox li').filter({ hasText: 'recette.vitrine@exemple.tn' }).count() >= 1);
    await c3.close(); }
  await browser.close();

  console.log('RÉUSSIS (' + ok.length + ')\n  ' + ok.join('\n  '));
  console.log('ÉCHECS (' + ko.length + ')\n  ' + ko.join('\n  '));
  console.log('NOTES\n  ' + notes.join('\n  '));
  require('fs').writeFileSync(out + 'resultat.json', JSON.stringify({ reussis: ok.length, echecs: ko, notes, date: new Date().toISOString() }, null, 1));
})().catch(e => { console.error('ERREUR', e); process.exit(1); });
