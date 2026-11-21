// Nouveau départ du cycle : le producer crée le projet de publicité et invite la marque (et l'agence) par leur e-mail.
// Comptes déjà inscrits : rattachés tout de suite. Renvoie l'identifiant du projet.
module.exports = async function projet(j, { prodTk, title, brand, agency }) {
  const c = await j('/demandes', { method: 'POST', body: JSON.stringify({ title }) }, prodTk);
  if (c.s !== 201) throw new Error('création du projet ' + c.s + ' ' + JSON.stringify(c.b));
  for (const [email, kind] of [[brand, 'MARQUE'], [agency, 'AGENCE_MARKETING']]) if (email) {
    const r = await j(`/demandes/${c.b.id}/invitations`, { method: 'POST', body: JSON.stringify({ email, kind }) }, prodTk);
    if (r.s !== 200) throw new Error('invitation ' + kind + ' ' + r.s + ' ' + JSON.stringify(r.b));
  }
  return c.b.id;
};
