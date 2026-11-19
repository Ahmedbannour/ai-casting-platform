// Sonde T-160 : la V0 est-elle analysée par l'IA locale sur le serveur en marche ? Données « Recette … », effacées ensuite.
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api';
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const st = Date.now(), today = new Date().toISOString().slice(0, 10), acc = {};
  for (const kind of ['MARQUE', 'AGENCE_MARKETING']) {
    const o = (await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name: `Recette Sonde ${kind} ${st}`, contractStart: today, kind }) }, adm)).b.id;
    const email = `recette.sonde.${kind.toLowerCase()}.${st}@exemple.tn`, pw = 'Rec3tte-' + st + '!';
    await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: 'Sonde', lastName: kind, role: kind, agencyId: o, password: pw }) }, adm);
    acc[kind] = { o, tk: (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) })).b.accessToken };
  }
  const id = (await j('/demandes', { method: 'POST', body: JSON.stringify({ title: 'Recette sonde huile', product: 'Huile d’olive', objective: 'Faire connaître la marque' }) }, acc.MARQUE.tk)).b.id;
  await j(`/demandes/${id}/v0`, { method: 'PUT', body: JSON.stringify({ body: 'Un grand-père récolte les olives avec sa petite-fille au lever du soleil, dans les collines du Sahel. Ton chaleureux, musique douce, on finit sur la bouteille posée sur une table familiale.' }) }, acc.MARQUE.tk);
  await j(`/demandes/${id}/envoyer`, { method: 'POST', body: JSON.stringify({ agencyId: acc.AGENCE_MARKETING.o }) }, acc.MARQUE.tk);
  const t0 = Date.now(); const a = await j(`/demandes/${id}/analyse`, { method: 'POST' }, acc.AGENCE_MARKETING.tk);
  console.log(JSON.stringify({ http: a.s, secondes: (Date.now() - t0) / 1000, analyse: a.b.analysis || a.b }, null, 1));
})().catch(e => { console.error(e.stack); process.exit(1); });
