// Room : équipe rangée par côté, niveaux d'accès en un geste (Chef de room, Collaborateur, Votant, Spectateur), réglage fin.
// Agenda : relié à Google Agenda et Outlook (abonnement au flux, adresse personnelle régénérable).
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api', BASE = 'http://localhost:4200', OUT = path.join(__dirname, '..', 'nav');
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
const ok = (c, m) => { if (!c) throw new Error('ÉCHEC : ' + m); console.log('OK  ' + m); };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const st = Date.now(), today = new Date().toISOString().slice(0, 10), acc = {};
  for (const [k, role, kind, first] of [['p', 'BOITE_PROD', 'BOITE_PROD', 'Hédi'], ['m', 'MARQUE', 'MARQUE', 'Sana'], ['r', 'REALISATEUR', null, 'Nadia']]) {
    const o = kind ? (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette Equipe ${k} ${st}`, contractStart: today, kind }) }, adm)).b.id : null;
    const email = `recette.eq.${k}.${st}@exemple.tn`, pw = 'Rec3tte-' + Math.random().toString(36).slice(2, 10) + '!';
    await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: first, lastName: 'Recette', role, ...(o ? { agencyId: o } : {}), password: pw }) }, adm);
    acc[k] = { email, pw, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  const pid = (await j('/projects', { method: 'POST', body: JSON.stringify({ title: 'Recette Équipe ' + st, type: 'PUBLICITE' }) }, acc.p.tk)).b.id;
  for (const k of ['m', 'r']) await j(`/rooms/${pid}/invitations`, { method: 'POST', body: JSON.stringify({ email: acc[k].email }) }, acc.p.tk);
  const b = await chromium.launch({ channel: 'msedge', headless: !process.env.HEADED });
  const p = await (await b.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: 'dark' })).newPage();
  p.setDefaultTimeout(15000); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/auth/login'); await p.fill('#email', acc.p.email); await p.fill('#password', acc.p.pw); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'));
  if (p.url().includes('/consentement')) { await p.getByRole('radio', { name: /18 ans ou plus/i }).click(); await p.locator('.check input').check(); await p.getByRole('button', { name: /^Continuer/ }).click(); await p.waitForURL(u => !u.pathname.startsWith('/consentement')); }

  // Room : équipe
  await p.goto(BASE + '/rooms/' + pid + '?tab=swipe'); await p.waitForTimeout(1500);
  await p.locator('button', { hasText: 'Équipe' }).first().click(); await p.waitForTimeout(500);
  const groups = (await p.locator('.grp h3').allInnerTexts()).map(t => t.replace(/\s*\d+$/, '').trim());
  ok(groups.join('|') === 'Production|Réalisation|Marque', 'équipe rangée par côté : ' + groups.join(', '));
  const sana = p.locator('.mem', { hasText: 'Sana Recette' });
  ok((await sana.locator('.access').innerText()).includes('Votant'), 'la marque arrive en « Votant » (vote et résultats)');
  await sana.locator('button.access').click(); await p.waitForTimeout(300);
  ok(await sana.locator('.pcard').count() === 4 && await sana.locator('.switch').count() === 4, 'fiche dépliée : 4 niveaux d’accès et le réglage fin');
  await p.screenshot({ path: path.join(OUT, 'room-equipe.jpg'), type: 'jpeg', quality: 78 });
  await sana.locator('.pcard', { hasText: 'Spectateur' }).click(); await p.waitForTimeout(800);
  ok((await sana.locator('.access').innerText()).includes('Spectateur'), 'un geste : la marque devient « Spectateur »');
  await sana.locator('.switch').nth(2).click(); await p.waitForTimeout(800);   // Documents
  ok((await sana.locator('.access').innerText()).includes('Sur mesure'), 'réglage fin : l’accès devient « Sur mesure »');
  const room = (await j('/rooms/' + pid, {}, acc.m.tk)).b;
  ok(room.me.docs === true && room.me.swipe === false, 'le serveur applique bien les droits (documents oui, vote non)');
  const nadia = p.locator('.mem', { hasText: 'Nadia Recette' });
  await nadia.locator('button.access').click(); await nadia.locator('.pcard', { hasText: 'Collaborateur' }).click(); await p.waitForTimeout(800);
  ok((await nadia.locator('.access').innerText()).includes('Collaborateur'), 'le réalisateur passe « Collaborateur »');

  // Agenda relié à Google et Outlook
  await p.goto(BASE + '/agenda'); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: 'Relier à Google ou Outlook' }).click(); await p.waitForTimeout(1000);
  const url = await p.locator('.copyrow input').inputValue();
  ok(/\/api\/public\/agenda\/[0-9a-f]{48}\.ics$/.test(url), 'adresse d’agenda personnelle prête');
  const hrefs = await p.locator('.prov').evaluateAll(a => a.map(x => x.getAttribute('href')));
  ok(hrefs[0].startsWith('https://calendar.google.com/') && hrefs[0].includes(encodeURIComponent('webcal:')), 'Google Agenda : abonnement en un clic');
  ok(hrefs[1].startsWith('https://outlook.live.com/calendar/0/addfromweb?url=') && hrefs[2].startsWith('https://outlook.office.com/'), 'Outlook.com et Microsoft 365 : abonnement en un clic');
  const feed = await fetch(url);
  const txt = await feed.text();
  ok(feed.status === 200 && (feed.headers.get('content-type') || '').includes('text/calendar') && txt.startsWith('BEGIN:VCALENDAR'), 'le flux se lit depuis l’adresse du site (text/calendar)');
  await p.screenshot({ path: path.join(OUT, 'agenda-relier.jpg'), type: 'jpeg', quality: 78 });
  await p.locator('.fine .lnk').click(); await p.waitForTimeout(800);
  ok((await p.locator('.copyrow input').inputValue()) !== url && (await fetch(url)).status === 404, 'nouvelle adresse : l’ancienne ne fonctionne plus');
  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
})().catch(e => { console.error(e.stack || e.message); process.exit(1); });
