// Crée le compte de démo « assistante de production » par le vrai parcours : le producer de démo l'invite,
// puis le lien est accepté. Le mot de passe est généré, écrit dans .comptes-demo.txt (ignoré par git), jamais affiché.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const API = process.env.API || 'http://localhost:8080/api';
const file = path.join(__dirname, '.comptes-demo.txt');
const txt = fs.readFileSync(file, 'utf8');
const EMAIL = 'demo.assistante@aicasting-demo.tn';
if (txt.includes(EMAIL)) { console.log('Le compte assistante existe déjà dans le fichier.'); process.exit(0); }
const block = txt.split('Boîte de production')[1];
const prodEmail = block.match(/e-mail : (\S+)/)[1], prodPw = block.match(/mot de passe : (\S+)/)[1];

async function call(method, url, token, body) {
  const r = await fetch(API + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(method + ' ' + url + ' → ' + r.status + ' ' + t.slice(0, 200));
  return t ? JSON.parse(t) : null;
}

(async () => {
  const login = await call('POST', '/auth/login', null, { email: prodEmail, password: prodPw });
  const inv = await call('POST', '/production/assistantes', login.accessToken,
    { email: EMAIL, perms: ['PROJETS', 'INVITATIONS', 'EQUIPE', 'ROOM'] });
  const pw = 'Demo-' + crypto.randomBytes(6).toString('base64url') + '9';
  const acc = await call('POST', '/public/invitations-pro/' + inv.token + '/accept', null,
    { firstName: 'Sarra', lastName: 'Assistante', password: pw, acceptTerms: true });
  fs.appendFileSync(file, `\nAssistante de production (rattachée à Démo Production ; autorisations : créer les projets, inviter marque et agence,\nréalisateur et attentes, diriger la room — le casting s'ouvre depuis « Mon équipe » du producer)\n  e-mail : ${EMAIL}\n  mot de passe : ${pw}\n`);
  console.log('Compte créé :', EMAIL, '· rôle', acc.role, '· autorisations', acc.perms.join(', '));
})().catch(e => { console.error(e.message); process.exit(1); });
