// Zone de dépôt modernisée : états normal, survol par un fichier, envoi, fichier déposé ; clair et sombre ; photos de l'acteur.
// Comptes recette.*@exemple.tn effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const mails = [...txt.matchAll(/e-mail\s*:\s*(\S+)/g)].map(m => m[1]), pws = [...txt.matchAll(/mot de passe\s*:\s*(\S+)/g)].map(m => m[1]);
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const stamp = Date.now(), today = new Date().toISOString().slice(0, 10);
  const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: 'Recette Marque ' + stamp, contractStart: today, kind: 'MARQUE' }) }, adm)).b.id;
  const email = `recette.depot.${stamp}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
  await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: 'Depot', role: 'MARQUE', agencyId: o, password: pw }) }, adm);
  const tk = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken;
  const id = (await j('/demandes', { method: 'POST', body: JSON.stringify({ title: 'Recette dépôt' }) }, tk)).b.id;
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const res = {};
  for (const T of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(t => localStorage.setItem('casting_theme', t), T);
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '/auth/login'); await p.fill('#email', email); await p.fill('#password', pw); await p.click('button.submit-btn');
    await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
    if (p.url().includes('/consentement')) { await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check(); await p.getByRole('button', { name: /^Continuer/ }).click(); await p.waitForTimeout(1200); }
    await p.route('**/v0/fichier', r => setTimeout(() => r.continue(), 1600));   // envoi ralenti pour voir l'état « envoi »
    await p.goto(BASE + '/demandes/' + id + '/historique'); await p.waitForTimeout(1500);
    const dz = p.locator('app-dropzone').first(); await dz.scrollIntoViewIfNeeded();
    const shot = async n => { const bb = await dz.boundingBox(); await p.screenshot({ path: path.join(OUT, `depot-${T}-${n}.png`), clip: { x: bb.x - 12, y: bb.y - 12, width: bb.width + 24, height: bb.height + 24 } }); };
    await shot('1-normal');
    // Un fichier survole la zone (vrai événement de glisser avec un fichier)
    await dz.locator('label').evaluate(el => { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'v0.pdf', { type: 'application/pdf' }));
      el.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt })); });
    await p.waitForTimeout(350); res[T + ' survol'] = await dz.locator('b').first().innerText(); await shot('2-survol');
    // Dépôt réel d'un fichier par glisser-déposer
    await dz.locator('label').evaluate(el => { const dt = new DataTransfer(); dt.items.add(new File(['%PDF-1.4 recette'], 'v0-depot.pdf', { type: 'application/pdf' }));
      el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); });
    await p.waitForTimeout(250); await shot('3-envoi');
    await p.waitForTimeout(2600);
    res[T + ' fichier'] = await p.locator('.file span').first().innerText().catch(() => '(aucun)');
    // remettre la zone pour le mode suivant
    await j(`/demandes/${id}/v0/fichier`, { method: 'DELETE' }, tk);
    res[T + ' erreurs'] = errs;
    await ctx.close();
  }
  // Photos de l'acteur (compte démo, rien n'est envoyé)
  const k = mails.findIndex(m => m.includes('demo.acteur'));
  const ctx = await b.newContext({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto(BASE + '/auth/login'); await p.fill('#email', mails[k]); await p.fill('#password', pws[k]); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
  await p.goto(BASE + '/mon-profil/photos'); await p.waitForTimeout(1600);
  const dz = p.locator('app-dropzone').first();
  if (await dz.count()) { await dz.scrollIntoViewIfNeeded(); const bb = await dz.boundingBox(); await p.screenshot({ path: path.join(OUT, 'depot-photos.png'), clip: { x: bb.x - 12, y: bb.y - 12, width: bb.width + 24, height: bb.height + 24 } }); res.photos = 'ok'; }
  await b.close();
  console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
