// Sonde T-164 : explications des propositions rattachées à l'intention du réalisateur (projet « Recette … » supprimé ensuite).
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api';
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const intention = 'Une mère chaleureuse et pressée, qui garde son humour au petit-déjeuner. On doit sentir la complicité avec ses enfants.';
  const prj = (await j('/projects', { method: 'POST', body: JSON.stringify({ title: 'Recette sonde intention', type: 'PUBLICITE' }) }, adm)).b;
  const role = (await j(`/projects/${prj.id}/roles`, { method: 'POST', body: JSON.stringify({ name: 'La mère', gender: 'Femme', minAge: 30, maxAge: 45, intention }) }, adm)).b;
  const s = (await j('/ai/search', { method: 'POST', body: JSON.stringify({ query: role.intentionQuery, page: 0, size: 5, roleId: role.id }) }, adm)).b;
  const ids = s.results.map(r => r.id);
  const t0 = Date.now();
  const e = await j('/ai/explain', { method: 'POST', body: JSON.stringify({ query: role.intentionQuery, actorIds: ids, roleId: role.id }) }, adm);
  const out = Object.values(e.b || {});
  const cites = out.map(x => (x.match(/« (.+?) »/) || [])[1]).filter(Boolean);
  console.log(JSON.stringify({ http: e.s, secondes: (Date.now() - t0) / 1000, explications: out, toutesLesCitationsSontDansLIntention: cites.every(c => intention.toLowerCase().includes(c.toLowerCase())), citations: cites.length }, null, 1));
  await j('/projects/' + prj.id, { method: 'DELETE' }, adm);
})().catch(e => { console.error(e.stack); process.exit(1); });
