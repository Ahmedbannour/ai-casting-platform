// Démo / tunnel : sert la version compilée de Cercle (rapide, compressée) et relaie /api vers le serveur Spring.
// node scripts/serveur-demo.js [port=4200]   — compiler avant : cd frontend/ai-casting-frontend && npx ng build
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const PORT = +(process.argv[2] || 4200);
const ROOT = path.join(__dirname, '..', 'frontend', 'ai-casting-frontend', 'dist', 'ai-casting-frontend', 'browser');
const PROXY = [['/api', 8080], ['/casting-media', 9000]];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.map': 'application/json', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.pbf': 'application/x-protobuf', '.ttf': 'font/ttf', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm' };
// Cherché à chaque demande : une compilation vide puis réécrit le dossier.
const index = () => ['index.csr.html', 'index.html'].map(f => path.join(ROOT, f)).find(f => fs.existsSync(f));
const cache = new Map();   // fichiers compressés en mémoire

function relay(req, res, port) {
  const p = http.request({ host: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, r => {
    res.writeHead(r.statusCode, r.headers); r.pipe(res);
  });
  p.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json' }); res.end('{"message":"Serveur indisponible"}'); });
  req.pipe(p);
}

function send(req, res, file, immutable) {
  const ext = path.extname(file).toLowerCase(), type = TYPES[ext] || 'application/octet-stream';
  const gz = /gzip/.test(req.headers['accept-encoding'] || '') && /text|javascript|json|svg|manifest|wasm/.test(type);
  const key = file + (gz ? '.gz' : '');
  let body = cache.get(key);
  if (!body) { body = fs.readFileSync(file); if (gz) body = zlib.gzipSync(body, { level: 9 }); if (immutable) cache.set(key, body); }
  const h = { 'Content-Type': type, 'Content-Length': body.length, 'X-Content-Type-Options': 'nosniff',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' };
  if (gz) h['Content-Encoding'] = 'gzip';
  if (ext === '.html') { h['X-Frame-Options'] = 'DENY'; h['Referrer-Policy'] = 'strict-origin-when-cross-origin'; }
  res.writeHead(200, h); res.end(req.method === 'HEAD' ? undefined : body);
}

// Une erreur (fichier effacé pendant une compilation…) ne doit jamais arrêter le serveur.
process.on('uncaughtException', e => console.error('Erreur ignorée :', e.message));

http.createServer((req, res) => { try {
  for (const [prefix, port] of PROXY) if (req.url === prefix || req.url.startsWith(prefix + '/')) return relay(req, res, port);
  let rel; try { rel = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end(); }
  const file = path.normalize(path.join(ROOT, rel));
  if (file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return send(req, res, file, /[-.][A-Z0-9]{8,}\.(js|css)$/i.test(file) || /\/media\//.test(rel));
  }
  if (path.extname(rel)) { res.writeHead(404); return res.end(); }
  const idx = index();
  if (!idx) { res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5' }); return res.end('Compilation en cours, réessayez dans quelques secondes.'); }
  send(req, res, idx, false);   // application à page unique : toute route renvoie l'index
} catch (e) { if (!res.headersSent) res.writeHead(503, { 'Retry-After': '5' }); res.end(); } }).listen(PORT, () => console.log(`Cercle (version compilée) sur http://localhost:${PORT}`));
