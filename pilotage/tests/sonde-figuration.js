// Sonde T-165 : recherche avec un rôle de figuration sur le serveur en marche (données « Recette … » supprimées ensuite).
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api';
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const st = Date.now(), L = String(st).slice(-6).split('').map(c => 'abcdefghij'[+c]).join('');
  const cr = await j('/actors', { method: 'POST', body: JSON.stringify({ firstName: 'Recette Figurant', lastName: 'Sonde' + L }) }, adm); console.log('create', cr.s, JSON.stringify(cr.b).slice(0, 300)); const a = cr.b;
  const up = await j('/actors/' + a.id, { method: 'PUT', body: JSON.stringify({ figuration: ['SILHOUETTE'] }) }, adm);
  const det = (await j('/actors/' + a.id, {}, adm)).b;
  const prj = (await j('/projects', { method: 'POST', body: JSON.stringify({ title: 'Recette sonde ' + st, type: 'PUBLICITE' }) }, adm)).b;
  const role = (await j(`/projects/${prj.id}/roles`, { method: 'POST', body: JSON.stringify({ name: 'Passants', importance: 'FIGURATION', figurationType: 'SILHOUETTE' }) }, adm)).b;
  const s = await j('/ai/search', { method: 'POST', body: JSON.stringify({ query: role.intentionQuery || 'une personne', page: 0, size: 10, roleId: role.id }) }, adm);
  console.log(JSON.stringify({ put: up.s, putBody: up.b, figuration: det.figuration, visibility: det.visibility, intentionQuery: role.intentionQuery, http: s.s, total: s.b.totalResults, noms: (s.b.results || []).map(r => r.firstName + ' ' + r.lastName) }, null, 1));
  await j('/projects/' + prj.id, { method: 'DELETE' }, adm); await j('/actors/' + a.id, { method: 'DELETE' }, adm);
})().catch(e => { console.error(e.stack); process.exit(1); });
