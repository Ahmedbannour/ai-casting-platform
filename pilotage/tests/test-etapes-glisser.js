// Formulaires en étapes et glisser-déposer des rôles, sur téléphone (mode clair) :
// 1) « Nouveau rôle » : 3 étapes, « Suivant » bloqué sans nom, rôle créé à la dernière étape ;
// 2) glisser le 3e rôle tout en haut par sa poignée : nouvel ordre affiché et enregistré.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
const ok = (c, m) => { if (!c) throw new Error('ÉCHEC : ' + m); console.log('OK  ' + m); };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const prj = (await j('/projects', { method: 'POST', body: JSON.stringify({ title: 'Recette étapes ' + Date.now(), type: 'PUBLICITE', description: 'Aa' }) }, adm)).b;
  for (const n of ['Alpha', 'Beta']) await j(`/projects/${prj.id}/roles`, { method: 'POST', body: JSON.stringify({ name: n, importance: 'SECONDAIRE', languages: [], skills: [] }) }, adm);
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 150 : 0 });
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => localStorage.setItem('casting_theme', 'light'));
  const p = await ctx.newPage(); p.setDefaultTimeout(10000); const errs = []; p.on('pageerror', e => errs.push(e.message));
  try {
    await p.goto(BASE + '/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
    await p.goto(BASE + '/projects/' + prj.id); await p.waitForTimeout(1500);

    // 1) Nouveau rôle en étapes
    await p.getByRole('button', { name: 'Nouveau rôle' }).first().click(); await p.waitForTimeout(500);
    const panel = p.locator('form.panel');
    ok((await panel.locator('app-form-steps li').count()) === 3, 'Nouveau rôle : 3 étapes');
    await panel.locator('button.next').click(); await p.waitForTimeout(200);
    ok((await panel.locator('#r-name').count()) === 1 && /nom/i.test(await panel.locator('.err').innerText()), 'Suivant refusé sans nom, message affiché');
    await panel.locator('#r-name').fill('Gamma');
    await p.screenshot({ path: path.join(OUT, 'etapes-role-1.png') });
    await panel.locator('button.next').click(); await p.waitForTimeout(400);
    ok(await panel.getByRole('radiogroup', { name: 'Genre' }).isVisible(), 'Étape 2 : le profil');
    await panel.getByRole('radio', { name: 'Femme' }).click();
    await p.screenshot({ path: path.join(OUT, 'etapes-role-2.png') });
    await panel.locator('button.next').click(); await p.waitForTimeout(400);
    ok(await panel.locator('#r-city').isVisible(), 'Étape 3 : le tournage');
    await panel.locator('#r-city').fill('Tunis');
    await p.screenshot({ path: path.join(OUT, 'etapes-role-3.png') });
    await panel.getByRole('button', { name: 'Créer le rôle' }).click(); await p.waitForTimeout(1500);
    let roles = (await j(`/projects/${prj.id}/roles`, {}, adm)).b;
    ok(roles.map(r => r.name).join(',') === 'Alpha,Beta,Gamma' && roles[2].gender === 'Femme' && roles[2].city === 'Tunis', 'Rôle créé avec les réponses des 3 étapes');

    // 2) Glisser « Gamma » (3e) tout en haut, par sa poignée
    await p.locator('.role-list').scrollIntoViewIfNeeded();
    await p.locator('.content').evaluate(c => { const l = document.querySelector('.role-list'); c.scrollTop += l.getBoundingClientRect().top - 70; });
    await p.waitForTimeout(400);
    const grips = p.locator('.role .grip');
    const from = await grips.nth(2).boundingBox(), to = await grips.nth(0).boundingBox();
    await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await p.mouse.down();
    for (let i = 1; i <= 12; i++) { await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + (to.y - from.y - 20) * i / 12); await p.waitForTimeout(30); }
    await p.screenshot({ path: path.join(OUT, 'glisser-roles-pendant.png') });
    await p.mouse.up(); await p.waitForTimeout(1200);
    const affiches = await p.locator('.role h3').allInnerTexts();
    ok(affiches.join(',') === 'Gamma,Alpha,Beta', 'Ordre affiché après glisser : ' + affiches.join(', '));
    roles = (await j(`/projects/${prj.id}/roles`, {}, adm)).b;
    ok(roles.map(r => r.name).join(',') === 'Gamma,Alpha,Beta', 'Ordre enregistré sur le serveur');
    await p.screenshot({ path: path.join(OUT, 'glisser-roles-apres.png') });
    // Clavier : flèche bas sur la poignée de Gamma
    await grips.nth(0).focus(); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(1000);
    ok((await p.locator('.role h3').allInnerTexts()).join(',') === 'Alpha,Gamma,Beta', 'Au clavier, flèche bas : Gamma descend d\'une place');
    ok(errs.length === 0, 'Aucune erreur JS ' + errs.join(' | '));
  } finally {
    await b.close(); await j('/projects/' + prj.id, { method: 'DELETE' }, adm);
  }
})().catch(e => { console.error(e.message); process.exit(1); });
