// Image de marque réglée par le producer (couleur, nom, logo) : aperçu en direct, appliquée à toute l'app, à sa room et à ses
// invitations ; menu réduit à l'essentiel avec « Plus » ; « Nouveau projet » propose publicité ou autre projet.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
const ok = (c, m) => { if (!c) throw new Error('ÉCHEC : ' + m); console.log('OK  ' + m); };
// Petit logo PNG 96×96 (cercle bleu sur fond blanc), écrit sans dépendance
function png(file) {
  const w = 96, h = 96, raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) {
    const i = y * (w * 4 + 1) + 1 + x * 4, inC = (x - 48) ** 2 + (y - 48) ** 2 < 36 ** 2;
    raw[i] = inC ? 0x43 : 255; raw[i + 1] = inC ? 0x61 : 255; raw[i + 2] = inC ? 0xEE : 255; raw[i + 3] = 255; } }
  const crc = b => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const st = Date.now(), today = new Date().toISOString().slice(0, 10);
  const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette Prod Azur ${st}`, contractStart: today, kind: 'BOITE_PROD' }) }, adm)).b.id;
  const prod = { email: `recette.marque.prod.${st}@exemple.tn`, pw: 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!' };
  await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email: prod.email, firstName: 'Lina', lastName: 'Recette', role: 'BOITE_PROD', agencyId: o, password: prod.pw }) }, adm);
  const logo = path.join(require('os').tmpdir(), 'logo-recette.png'); png(logo);
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  const p = await (await b.newContext({ viewport: { width: 1366, height: 860 }, colorScheme: 'dark' })).newPage();
  p.setDefaultTimeout(15000); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/auth/login'); await p.fill('#email', prod.email); await p.fill('#password', prod.pw); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'));
  if (p.url().includes('/consentement')) { await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check(); await p.getByRole('button', { name: /^Continuer/ }).click(); await p.waitForURL(u => !u.pathname.startsWith('/consentement')); }
  await p.goto(BASE + '/accueil'); await p.waitForTimeout(1500);

  // 1. Menu réduit à l'essentiel
  const main = await p.locator('nav.nav > a.nav-link .label').allInnerTexts();
  ok(JSON.stringify(main) === JSON.stringify(['Accueil', 'Projets', 'Rooms', 'Acteurs', 'Mon équipe']), 'menu essentiel : ' + main.join(', '));
  ok(await p.locator('.more-list').count() === 0, 'les rubriques secondaires sont rangées sous « Plus »');
  await p.locator('.more-toggle').click(); await p.waitForTimeout(300);
  const more = await p.locator('.more-list .label').allInnerTexts();
  ok(more.includes('Propositions IA') && more.includes('Agenda'), '« Plus » ouvre : ' + more.join(', '));

  // 2. Image de marque : aperçu en direct, puis enregistrement
  await p.goto(BASE + '/equipe'); await p.waitForTimeout(1500);
  const accent = () => p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase());
  await p.locator('.sw[aria-label="#4361EE"]').click(); await p.waitForTimeout(200);
  ok((await accent()) === '#4361EE', 'aperçu en direct : la couleur s’applique à toute l’interface');
  await p.fill('#b-name', 'Azur Films');
  await p.setInputFiles('.drop input[type=file]', logo); await p.waitForTimeout(1500);
  ok(await p.locator('.logo-row img').count() === 1, 'logo enregistré et affiché');
  await p.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await p.waitForTimeout(1200);
  ok((await p.locator('.brand-card .ok').innerText()).includes('enregistrée'), 'image de marque enregistrée');
  await p.screenshot({ path: path.join(OUT, 'marque-reglage.jpg'), type: 'jpeg', quality: 78 });
  await p.goto(BASE + '/accueil'); await p.waitForTimeout(1500);
  ok((await accent()) === '#4361EE', 'la couleur reste après navigation (enregistrée)');
  ok((await p.locator('.sidebar .logo-text').innerText()) === 'Azur Films' && await p.locator('.sidebar .org-logo').count() === 1, 'le menu montre le logo et le nom de la boîte');
  const on = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--on-accent').trim());
  ok(on.toUpperCase() === '#FFFFFF', 'texte blanc sur le bleu (contraste calculé)');
  await p.screenshot({ path: path.join(OUT, 'marque-accueil.jpg'), type: 'jpeg', quality: 78 });

  // 3. Nouveau projet : publicité ou autre projet
  await p.goto(BASE + '/projects'); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Nouveau projet' }).first().click(); await p.waitForTimeout(300);
  const choix = await p.locator('.new-choice b').allInnerTexts();
  ok(choix.join('|') === 'Publicité|Film, série ou autre', 'le producer choisit : ' + choix.join(' ou '));
  await p.screenshot({ path: path.join(OUT, 'marque-nouveau-projet.jpg'), type: 'jpeg', quality: 78 });

  // 4. Ses rooms et ses invitations portent sa marque
  const tk = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: prod.email, password: prod.pw }) })).b.accessToken;
  const pid = (await j('/projects', { method: 'POST', body: JSON.stringify({ title: 'Recette Azur ' + st, type: 'PUBLICITE' }) }, tk)).b.id;
  ok((await j('/rooms/' + pid, {}, tk)).b.brand?.name === 'Azur Films', 'la room porte la marque de la boîte');
  const inv = (await j(`/rooms/${pid}/invitations`, { method: 'POST', body: JSON.stringify({ email: `recette.inv.azur.${st}@exemple.tn`, kind: 'REALISATEUR' }) }, tk)).b;
  const g = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, colorScheme: 'dark' })).newPage();
  await g.goto(BASE + '/invitation-pro/' + inv.token); await g.waitForTimeout(1500);
  ok(await g.locator('.brand.org img').count() === 1 && (await g.locator('.brand.org').innerText()).includes('Azur Films'), 'l’invitation montre le logo et le nom de la boîte');
  ok((await g.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toUpperCase())) === '#4361EE', 'l’invitation prend sa couleur');
  await g.screenshot({ path: path.join(OUT, 'marque-invitation.jpg'), type: 'jpeg', quality: 80 });

  // 5. Retour aux couleurs Cercle
  await p.goto(BASE + '/equipe'); await p.waitForTimeout(1200);
  await p.locator('.sw.cercle').click(); await p.getByRole('button', { name: 'Enregistrer', exact: true }).click(); await p.waitForTimeout(1000);
  ok(!(await p.evaluate(() => document.documentElement.hasAttribute('data-brand'))), 'retour aux couleurs Cercle en un clic');
  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
