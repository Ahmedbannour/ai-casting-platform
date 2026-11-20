// Supprime les projets « Recette … » laissés par un parcours interrompu (ils appartiennent au compte admin de recette).
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api';
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const l = (await j('/projects?size=200', {}, adm)).b; const list = Array.isArray(l) ? l : (l.content || []);
  const rec = list.filter(p => /^Recette /.test(p.title));
  for (const p of rec) await j('/projects/' + p.id, { method: 'DELETE' }, adm);
  console.log('projets recette supprimés : ' + rec.length);
})().catch(e => { console.error(e.message); process.exit(1); });
