// T-131 · Recherche « actrice à Tunis qui parle anglais » : score et critères affichés sur la carte.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
(async () => {
  const api = 'http://localhost:8080/api';
  const tk = (await (await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: QA.email, password: QA.password }) })).json()).accessToken;
  const r = await (await fetch(api + '/ai/search', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }, body: JSON.stringify({ query: 'Actrice à Tunis qui parle anglais', page: 0, size: 8 }) })).json();
  const out = { interpretation: r.interpretation, total: r.totalResults, top: r.results.slice(0, 6).map(a => `${a.firstName} ${a.lastName} · ${a.city} · ${Math.round(a.score * 100)} % · ${(a.checks || []).map(c => (c.ok ? '✓' : '✗') + c.label).join(' | ')}`) };
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 820 }, colorScheme: 'dark' })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4200/auth/login'); await p.fill('#email', QA.email); await p.fill('#password', QA.password); await p.click('button.submit-btn');
  await p.waitForURL(u => !u.pathname.startsWith('/auth'), { timeout: 20000 }); await p.goto('http://localhost:4200/chat'); await p.waitForTimeout(1500);
  await p.addStyleTag({ content: 'app-email-banner{display:none!important} img[src*="/api/"]{filter:blur(14px)}' });
  await p.fill('textarea', 'Actrice à Tunis qui parle anglais'); await p.keyboard.press('Enter'); await p.waitForTimeout(4000);
  await p.screenshot({ path: 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage\\nav\\t131-score-bureau.jpg', type: 'jpeg', quality: 80 });
  out.pastilles = await p.locator('.checks li').count(); out.erreurs = errs;
  await b.close(); console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e.message); process.exit(1); });
