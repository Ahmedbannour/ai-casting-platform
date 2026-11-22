// Le producer mène le projet : il invite une marque pas encore inscrite (lien), elle crée son compte en 3 étapes
// sur téléphone et arrive sur le projet ; il invite une assistante depuis « Mon équipe », lui ouvre le casting d'un geste ;
// la popup « Nouveau projet » ne défile jamais à l'horizontale. Comptes recette.*@exemple.tn effacés à la fin.
const { chromium } = require('playwright-core');
const projet = require('./projet');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
const ok = (c, m) => { if (!c) throw new Error('ÉCHEC : ' + m); console.log('OK  ' + m); };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESK = { viewport: { width: 1280, height: 860 } };

(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const st = Date.now(), today = new Date().toISOString().slice(0, 10);
  const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette Prod Lumen ${st}`, contractStart: today, kind: 'BOITE_PROD' }) }, adm)).b.id;
  const prod = { email: `recette.producer.${st}@exemple.tn`, pw: 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!' };
  const c = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email: prod.email, firstName: 'Yasmine', lastName: 'Producer', role: 'BOITE_PROD', agencyId: o, password: prod.pw }) }, adm);
  if (c.s >= 300) throw new Error('compte producer ' + c.s);
  prod.tk = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: prod.email, password: prod.pw }) })).b.accessToken;
  const id = await projet(j, { prodTk: prod.tk, title: 'Recette Lumen ' + st });

  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED, slowMo: process.env.HEADED ? 120 : 0 });
  const open = async (dev, who) => {
    const ctx = await b.newContext({ ...dev, colorScheme: 'dark' });
    const p = await ctx.newPage(); p.setDefaultTimeout(15000); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    if (who) {
      await p.goto(BASE + '/auth/login'); await p.fill('#email', who.email); await p.fill('#password', who.pw); await p.click('button.submit-btn');
      await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 15000 });
      if (p.url().includes('/consentement')) {
        await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check();
        await p.getByRole('button', { name: /^Continuer/ }).click(); await p.waitForURL(u => !u.pathname.startsWith('/consentement'));
      }
    }
    return p;
  };

  // 1. Le producer invite une marque pas encore inscrite : un lien à envoyer
  const p = await open(DESK, prod);
  await p.goto(BASE + '/demandes/' + id); await p.waitForTimeout(1500);
  ok(/invite la marque/.test(await p.locator('.now-card p').innerText()), 'le projet dit que le producer doit inviter la marque');
  const brandMail = `recette.marque.${st}@exemple.tn`;
  const slot = p.locator('app-invite-card .slots li').first();
  await slot.getByRole('button', { name: 'Inviter' }).click();
  await slot.locator('input[type=email]').fill(brandMail);
  await slot.locator('form button[type=submit]').click();
  await p.locator('app-share-link input').waitFor();
  const link = await p.locator('app-share-link input').inputValue();
  ok(/\/invitation-pro\/[A-Za-z0-9_-]{20,}$/.test(link), 'un lien d’invitation est prêt à envoyer');
  ok((await p.locator('app-share-link a').allInnerTexts()).join(',').includes('WhatsApp'), 'le lien s’envoie par e-mail ou WhatsApp');
  await p.screenshot({ path: path.join(OUT, 'producer-lien.jpg'), type: 'jpeg', quality: 75, fullPage: true });

  // 2. La marque ouvre le lien sur son téléphone et crée son compte en 3 étapes
  const m = await open(PHONE);
  await m.goto(link.replace(/^https?:\/\/[^/]+/, BASE)); await m.waitForTimeout(1200);
  ok((await m.locator('h1').innerText()).length > 0 && (await m.locator('.lead').innerText()).includes('Recette Lumen'), 'la page d’invitation nomme le projet');
  ok(await m.locator('app-form-steps').count() === 1, 'l’inscription est découpée en étapes');
  await m.screenshot({ path: path.join(OUT, 'invitation-marque-1.jpg'), type: 'jpeg', quality: 80 });
  await m.getByRole('button', { name: 'Suivant' }).click();
  ok((await m.locator('.err').innerText()).includes('prénom'), 'une étape incomplète dit quoi corriger');
  await m.fill('#fn', 'Salma'); await m.fill('#ln', 'Recette'); await m.getByRole('button', { name: 'Suivant' }).click();
  await m.fill('#org', `Recette Marque Lumen ${st}`); await m.getByRole('button', { name: 'Suivant' }).click();
  await m.fill('#pw', 'Rec3tte-' + st); await m.locator('.check input').check();
  await m.screenshot({ path: path.join(OUT, 'invitation-marque-3.jpg'), type: 'jpeg', quality: 80 });
  await m.getByRole('button', { name: 'Rejoindre le projet' }).click();
  await m.waitForURL(/mes-demandes/, { timeout: 15000 }); await m.waitForTimeout(1500);
  ok((await m.locator('.list').innerText()).includes('Recette Lumen'), 'la marque arrive sur ses projets et y trouve le sien');
  ok(await m.locator('a.send', { hasText: 'Nouveau projet' }).count() === 0, 'la marque ne crée pas de projet');
  ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'aucun défilement horizontal sur téléphone');

  // 3. Mon équipe : le producer invite une assistante avec ses autorisations
  await p.goto(BASE + '/equipe'); await p.waitForTimeout(1500);
  ok(await p.locator('.perm.on').count() === 2, 'deux autorisations cochées par défaut (projets, invitations)');
  const asMail = `recette.assistante.${st}@exemple.tn`;
  await p.fill('#as-mail', asMail);
  await p.getByRole('button', { name: /Créer le lien/ }).click();
  await p.locator('app-share-link input').waitFor();
  const asLink = await p.locator('app-share-link input').inputValue();
  await p.screenshot({ path: path.join(OUT, 'producer-equipe.jpg'), type: 'jpeg', quality: 75, fullPage: true });
  const as = await open(PHONE);
  await as.goto(asLink.replace(/^https?:\/\/[^/]+/, BASE)); await as.waitForTimeout(1200);
  ok((await as.locator('.perms li').allInnerTexts()).join(',').includes('Créer les projets'), 'l’assistante voit ce qu’elle pourra faire');
  await as.fill('#fn', 'Sarra'); await as.fill('#ln', 'Recette'); await as.getByRole('button', { name: 'Suivant' }).click();
  await as.fill('#pw', 'Rec3tte-' + st); await as.locator('.check input').check();
  await as.getByRole('button', { name: 'Rejoindre le projet' }).click();
  await as.waitForURL(/mes-demandes/, { timeout: 15000 }); await as.waitForTimeout(1800);
  ok((await as.locator('.list').innerText()).includes('Recette Lumen'), 'l’assistante voit les projets de sa boîte');
  ok(await as.locator('a.send', { hasText: 'Nouveau projet' }).count() > 0, 'avec « projets », elle peut en créer');
  const tabs = async () => (await as.locator('nav.tabbar .tab').evaluateAll(t => t.map(x => x.getAttribute('aria-label'))));
  ok(!(await tabs()).includes('Acteurs'), 'sans « casting », pas d’accès aux acteurs');
  await as.screenshot({ path: path.join(OUT, 'assistante-sans-casting.jpg'), type: 'jpeg', quality: 80 });

  // 4. Le producer lui ouvre le casting d'un geste
  await p.reload(); await p.waitForTimeout(1500);
  const row = p.locator('.people li', { hasText: 'Sarra Recette' });
  await row.locator('.chip', { hasText: 'Casting' }).click(); await p.waitForTimeout(1200);
  ok(await row.locator('.chip.on', { hasText: 'Casting' }).count() === 1, 'l’autorisation « casting » est enregistrée');
  await as.reload(); await as.waitForTimeout(2000);
  ok((await tabs()).includes('Acteurs'), 'l’assistante a maintenant les acteurs dans son menu');
  await as.screenshot({ path: path.join(OUT, 'assistante-avec-casting.jpg'), type: 'jpeg', quality: 80 });

  // 5. La popup « Nouveau projet » ne défile pas à l'horizontale (ordinateur et téléphone)
  for (const [dev, label] of [[DESK, 'ordinateur'], [PHONE, 'téléphone']]) {
    const q = await open(dev, prod);
    await q.goto(BASE + '/projects'); await q.waitForTimeout(1500);
    await q.getByRole('button', { name: 'Nouveau projet' }).first().click(); await q.waitForTimeout(300);
    await q.locator('.new-choice button', { hasText: 'Film, série ou autre' }).click(); await q.waitForTimeout(600);
    await q.fill('#p-start', '17/11/2026'); await q.fill('#p-end', '30/11/2026'); await q.waitForTimeout(300);
    const w = await q.locator('app-project-form .panel').evaluate(e => [e.scrollWidth, e.clientWidth]);
    ok(w[0] <= w[1], `popup « Nouveau projet » sans défilement horizontal (${label} : ${w[0]} ≤ ${w[1]})`);
    if (label === 'téléphone') await q.screenshot({ path: path.join(OUT, 'popup-nouveau-projet.jpg'), type: 'jpeg', quality: 80 });
    q.errs.length && console.log('erreurs', q.errs);
  }

  const errs = [...p.errs, ...m.errs, ...as.errs];
  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
