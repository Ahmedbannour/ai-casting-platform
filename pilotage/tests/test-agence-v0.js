// Sprint 3 · T-160 : l'agence analyse la V0 (IA locale), refuse avec un motif ; la marque renvoie à une autre agence, qui accepte.
// Comptes recette.*@exemple.tn et organisations « Recette … », effacés ensuite par nettoyer-recette.sql.
const { chromium } = require('playwright-core');
const projet = require('./projet');
const choisir = require('./choisir');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
async function login(b, a) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' }); const p = await ctx.newPage(); p.setDefaultTimeout(10000);
  p.errs = []; p.on('pageerror', x => p.errs.push(x.message));
  await p.goto(BASE + '/auth/login'); await p.fill('#email', a.email); await p.fill('#password', a.pw); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 }).catch(() => {});
  if (p.url().includes('/consentement')) {
    await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check();
    await p.getByRole('button', { name: /^Continuer/ }).click();
    await p.waitForURL(u => !u.pathname.startsWith('/consentement'), { timeout: 10000 }).catch(() => {});
  }
  return p;
}
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const today = new Date().toISOString().slice(0, 10), st = Date.now(), res = {}, acc = {};
  for (const [k, kind, nom] of [['M', 'MARQUE', 'Marque Olive'], ['A', 'AGENCE_MARKETING', 'Agence Alpha'], ['B', 'AGENCE_MARKETING', 'Agence Beta'], ['P', 'BOITE_PROD', 'Prod Sahel']]) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${nom} ${st}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.t160.${k.toLowerCase()}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Test', lastName: nom, role: kind, agencyId: o, password: pw }) }, adm);
    if (c.s >= 300) throw new Error('compte ' + k + ' ' + c.s);
    acc[k] = { email, pw, o, nom: `Recette ${nom} ${st}` };
  }
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  // Marque : demande + V0 (texte et PDF), envoi à Alpha
  const m = await login(b, acc.M);
  const ptk = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: acc.P.email, password: acc.P.pw }) })).b.accessToken;
  const id = await projet(j, { prodTk: ptk, title: 'Recette Huile du Sahel ' + st, brand: acc.M.email, agency: acc.A.email });
  await m.goto(BASE + '/demandes/' + id); await m.waitForTimeout(1200);
  await m.fill('textarea[name=v0]', 'Un grand-père récolte les olives avec sa petite-fille au lever du soleil, dans les collines du Sahel.');
  await m.setInputFiles('.drop input[type=file]', path.join(__dirname, 'v0-recette.pdf')); await m.waitForTimeout(1500);
  await m.locator('button.send', { hasText: 'Envoyer à' }).click(); await m.waitForTimeout(1500);
  res.envoiAlpha = await m.locator('.steps .now').innerText();
  // Alpha : analyse puis refus
  const a = await login(b, acc.A);
  await a.goto(BASE + '/demandes/' + id); await a.waitForTimeout(1500);
  res.alphaBoutons = await a.locator('.answer button').allInnerTexts();
  const t0 = Date.now();
  await a.getByRole('button', { name: 'Analyser la V0' }).click();
  res.attenteAffichee = await a.locator('.ai [role=status]').innerText().catch(() => '');
  await a.locator('.ai .src').waitFor({ timeout: 200000 });
  res.analyseSecondes = Math.round((Date.now() - t0) / 1000);
  res.analyseSource = await a.locator('.ai .src').innerText();
  res.resume = (await a.locator('.ai .body').innerText()).slice(0, 220);
  res.manques = await a.locator('.ai .pts').first().locator('li').allInnerTexts();
  res.questions = await a.locator('.ai .pts').nth(1).locator('li').allInnerTexts().catch(() => []);
  res.budgetCite = /budget/i.test(res.manques.join(' '));
  await a.screenshot({ path: path.join(OUT, 'v2-agence-analyse.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  await a.getByRole('button', { name: 'Refuser…' }).click();
  res.refusSansMotifBloque = !(await a.getByRole('button', { name: 'Refuser la demande' }).isEnabled());
  await a.fill('textarea[name=reason]', 'Pas de disponibilité avant mars');
  await a.getByRole('button', { name: 'Refuser la demande' }).click(); await a.waitForURL(/mes-demandes/, { timeout: 10000 }); await a.waitForTimeout(1200);
  res.alphaListeApresRefus = await a.locator('.list li').count();
  // Marque : bannière de refus, renvoi à Beta
  await m.goto(BASE + '/demandes/' + id); await m.waitForTimeout(1500);
  res.banniereRefus = await m.locator('.warn').innerText().catch(() => '');
  res.marqueModifiable = await m.locator('input[name=title]').count() === 1;
  // Le producer invite une autre agence ; la marque renvoie sa V0
  const inv = await j(`/demandes/${id}/invitations`, { method: 'POST', body: JSON.stringify({ email: acc.B.email, kind: 'AGENCE_MARKETING' }) }, ptk);
  if (inv.s !== 200) throw new Error('invitation Beta ' + inv.s);
  await m.reload(); await m.waitForTimeout(1500);
  await m.locator('button.send', { hasText: 'Envoyer à' }).click(); await m.waitForTimeout(1500);
  // Beta : accepte
  const bb = await login(b, acc.B);
  await bb.goto(BASE + '/demandes/' + id); await bb.waitForTimeout(1500);
  await bb.getByRole('button', { name: 'Accepter la demande' }).click(); await bb.waitForTimeout(1500);
  res.betaMessage = await bb.locator('.ok').innerText().catch(() => '');
  res.betaEtape = await bb.locator('.steps .now').innerText();
  res.betaPlusDeBoutons = await bb.locator('.answer').count() === 0;
  await bb.screenshot({ path: path.join(OUT, 'v2-agence-acceptee.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  // Marque : notification et étape
  const mtk = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: acc.M.email, password: acc.M.pw }) })).b.accessToken;
  const items = (await j('/me/notifications', {}, mtk)).b.items || [];
  res.notifsMarque = items.map(n => n.title);
  await m.goto(BASE + '/demandes/' + id); await m.waitForTimeout(1500);
  res.marqueEtape = await m.locator('.steps .now').innerText();
  res.marquePeutAnnuler = await m.getByRole('button', { name: 'Annuler la demande' }).count();
  res.journal = await m.locator('.journal li span').allInnerTexts();
  res.erreurs = [...m.errs, ...a.errs, ...bb.errs];
  await b.close(); console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
