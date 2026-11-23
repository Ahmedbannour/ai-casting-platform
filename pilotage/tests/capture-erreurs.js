// Captures des messages d'erreur (bandeau et ligne sous un champ), en sombre et en clair.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const bloc = txt.split('Boîte de production')[1];
const email = bloc.match(/e-mail : (\S+)/)[1], pw = bloc.match(/mot de passe : (\S+)/)[1];
const BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
(async () => {
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  for (const theme of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: theme });
    await ctx.addInitScript(t => localStorage.setItem('casting_theme', t), theme);
    const p = await ctx.newPage();
    // 1. Connexion refusée (bandeau)
    await p.goto(BASE + '/auth/login'); await p.fill('#email', 'inconnu@exemple.tn'); await p.fill('#password', 'mauvais-mot-de-passe'); await p.click('button.submit-btn');
    await p.locator('.error-banner').waitFor(); await p.waitForTimeout(600);
    await p.locator('form').first().screenshot({ path: path.join(OUT, `erreur-connexion-${theme}.jpg`), type: 'jpeg', quality: 85 });
    // 2. Inscription pro : champs refusés (lignes sous les champs) et bandeau
    await p.goto(BASE + '/auth/inscription-pro'); await p.waitForTimeout(800);
    await p.locator('button', { hasText: /Suivant|Continuer/ }).first().click(); await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, `erreur-inscription-${theme}.jpg`), type: 'jpeg', quality: 85 });
    await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e.message); process.exit(1); });
