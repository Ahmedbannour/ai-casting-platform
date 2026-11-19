// Démo locale T-160 : une marque envoie une V0 (texte + PDF) à une agence ; l'agence l'analyse. Données « Recette … », effacées ensuite.
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api';
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { ...(opt.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const st = Date.now(), today = new Date().toISOString().slice(0, 10), acc = {};
  for (const [kind, nom] of [['MARQUE', 'Marque Huile du Sahel'], ['AGENCE_MARKETING', 'Agence Lumière']]) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette ${nom}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.demo.${kind.toLowerCase()}.${st}@exemple.tn`, pw = 'Demo-' + Math.random().toString(36).slice(2, 10) + '!';
    await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: kind === 'MARQUE' ? 'Sana' : 'Karim', lastName: 'Démo', role: kind, agencyId: o, password: pw }) }, adm);
    acc[kind] = { o, email, pw, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  const M = acc.MARQUE.tk;
  const id = (await j('/demandes', { method: 'POST', body: JSON.stringify({ title: 'Lancement Huile du Sahel', product: 'Huile d’olive vierge extra', objective: 'Faire connaître la nouvelle marque' }) }, M)).b.id;
  await j(`/demandes/${id}/v0`, { method: 'PUT', body: JSON.stringify({ body: 'Un grand-père récolte les olives avec sa petite-fille au lever du soleil, dans les collines du Sahel.' }) }, M);
  const f = new FormData(); f.append('file', new Blob([fs.readFileSync(path.join(__dirname, 'v0-recette.pdf'))], { type: 'application/pdf' }), 'V0-huile-du-sahel.pdf');
  await j(`/demandes/${id}/v0/fichier`, { method: 'POST', body: f }, M);
  await j(`/demandes/${id}/envoyer`, { method: 'POST', body: JSON.stringify({ agencyId: acc.AGENCE_MARKETING.o }) }, M);
  const a = await j(`/demandes/${id}/analyse`, { method: 'POST' }, acc.AGENCE_MARKETING.tk);
  fs.writeFileSync(path.join(__dirname, '.demo-agence.json'), JSON.stringify({ email: acc.AGENCE_MARKETING.email, pw: acc.AGENCE_MARKETING.pw, id }));
  console.log(JSON.stringify({ id, analyse: a.b.analysis && a.b.analysis.source }));
})().catch(e => { console.error(e.stack); process.exit(1); });
