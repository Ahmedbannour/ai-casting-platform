// Vérifie que chaque compte de .comptes-demo.txt se connecte et arrive avec le bon rôle (n'affiche aucun mot de passe).
const fs = require('fs'), path = require('path');
const txt = fs.readFileSync(path.join(__dirname, '.comptes-demo.txt'), 'utf8');
const re = /^(.+)\n  e-mail : (.+)\n  mot de passe : (.+)$/gm; let m; const out = [];
(async () => {
  while ((m = re.exec(txt))) {
    const r = await fetch('http://localhost:8080/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: m[2], password: m[3] }) });
    const b = await r.json().catch(() => ({}));
    out.push(`${m[1]} : ${r.status === 200 ? 'connexion OK, rôle ' + b.role : 'ÉCHEC ' + r.status}`);
  }
  console.log(out.join('\n'));
})();
