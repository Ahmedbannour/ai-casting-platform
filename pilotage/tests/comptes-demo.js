// Crée un compte de démonstration par rôle (cahier v2) pour un test manuel du cycle complet.
// Les identifiants sont écrits dans pilotage/tests/.comptes-demo.txt (ignoré par git), jamais dans le dépôt.
// Option --supprimer-projet "Titre" : supprime d'abord ce projet par l'API (après sauvegarde de la base).
const fs = require('fs'), path = require('path');
const QA = JSON.parse(fs.readFileSync(path.join(__dirname, '.recette-admin.json'), 'utf8'));
const API = 'http://localhost:8080/api';
const j = async (url, opt = {}, tk) => { const r = await fetch(API + url, { ...opt, headers: { 'Content-Type': 'application/json', ...(tk ? { Authorization: 'Bearer ' + tk } : {}) } }); const t = await r.text(); try { return { s: r.status, b: JSON.parse(t) }; } catch { return { s: r.status, b: t }; } };
const pw = () => 'Demo-' + Math.random().toString(36).slice(2, 7) + Math.random().toString(36).slice(2, 5).toUpperCase() + '!';
(async () => {
  const adm = (await j('/auth/login', { method: 'POST', body: JSON.stringify({ email: QA.email, password: QA.password }) })).b.accessToken;
  const iProj = process.argv.indexOf('--supprimer-projet');
  if (iProj > 0) {
    const titre = process.argv[iProj + 1];
    const l = (await j('/projects?size=200', {}, adm)).b; const list = Array.isArray(l) ? l : (l.content || []);
    for (const p of list.filter(x => x.title === titre)) console.log('projet supprimé :', titre, (await j('/projects/' + p.id, { method: 'DELETE' }, adm)).s);
  }
  const today = new Date().toISOString().slice(0, 10);
  const org = {};
  for (const [kind, name] of [['MARQUE', 'Démo Marque'], ['AGENCE_MARKETING', 'Démo Agence'], ['BOITE_PROD', 'Démo Production']]) {
    const r = await j('/admin/agencies', { method: 'POST', body: JSON.stringify({ name, city: 'Tunis', contractStart: today, kind }) }, adm);
    org[kind] = r.b.id; if (r.s >= 300) throw new Error('organisation ' + name + ' ' + r.s + ' ' + JSON.stringify(r.b));
  }
  const comptes = [
    ['Administrateur', 'ADMIN', null, 'demo.admin', 'Amira', 'Admin'],
    ['Marque (client)', 'MARQUE', org.MARQUE, 'demo.marque', 'Sana', 'Marque'],
    ['Agence marketing', 'AGENCE_MARKETING', org.AGENCE_MARKETING, 'demo.agence', 'Karim', 'Agence'],
    ['Boîte de production', 'BOITE_PROD', org.BOITE_PROD, 'demo.production', 'Hédi', 'Production'],
    ['Réalisateur', 'REALISATEUR', null, 'demo.realisateur', 'Nadia', 'Réalisatrice'],
    ['1er AD (assistant réalisateur)', 'REALISATEUR', null, 'demo.premier-ad', 'Omar', 'Assistant']
  ];
  const lignes = [];
  for (const [label, role, agencyId, local, first, last] of comptes) {
    const email = `${local}@aicasting-demo.tn`, mdp = pw();
    const r = await j('/admin/agents', { method: 'POST', body: JSON.stringify({ email, firstName: first, lastName: last, role, agencyId, password: mdp }) }, adm);
    if (r.s >= 300) throw new Error(label + ' ' + r.s + ' ' + JSON.stringify(r.b));
    lignes.push([label, email, mdp]);
  }
  const email = 'demo.acteur@aicasting-demo.tn', mdp = pw();
  const a = await j('/auth/register', { method: 'POST', body: JSON.stringify({ email, password: mdp, firstName: 'Leila', lastName: 'Actrice', acceptTerms: true, age: 'MAJEUR', figuration: ['EXTRA', 'SILHOUETTE'] }) });
  if (a.s >= 300) throw new Error('acteur ' + a.s + ' ' + JSON.stringify(a.b));
  lignes.push(['Acteur', email, mdp]);
  const txt = 'Comptes de démonstration AI Casting (créés le ' + today + ')\n\n' + lignes.map(([l, e, p]) => `${l}\n  e-mail : ${e}\n  mot de passe : ${p}\n`).join('\n')
    + '\nOrganisations : Démo Marque, Démo Agence, Démo Production (Tunis).\n';
  fs.writeFileSync(path.join(__dirname, '.comptes-demo.txt'), txt);
  console.log('comptes créés : ' + lignes.map(l => l[0]).join(', '));
})().catch(e => { console.error(e.message); process.exit(1); });
