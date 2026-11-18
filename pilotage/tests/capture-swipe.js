// Filme un glissement de fiche sur la vitrine (lancer rapide puis retour avec rebond) : pilotage/nav/swipe/NNN.png
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const dir = 'C:\\Users\\AhmedBannour\\ai-casting-platform\\pilotage\\nav\\swipe';
(async () => {
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1100, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:4200/'); await p.waitForSelector('app-splash .skip'); await p.keyboard.press('Escape'); await p.waitForTimeout(2600);
  const card = p.locator('.deck .card.top'); await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox(); const clip = { x: Math.max(0, box.x - 260), y: Math.max(0, box.y - 60), width: Math.min(1100, box.width + 520), height: Math.min(720, box.height + 160) };
  let n = 0; const shot = () => p.screenshot({ path: path.join(dir, String(n++).padStart(3, '0') + '.png'), clip });
  const cx = box.x + box.width / 2, cy = box.y + box.height * 0.3;
  // 1. Glisser lentement vers la gauche puis relâcher trop tôt : retour avec rebond
  await p.mouse.move(cx, cy); await p.mouse.down();
  for (let i = 1; i <= 6; i++) { await p.mouse.move(cx - i * 13, cy + i * 2); await shot(); }
  await p.mouse.up(); for (let i = 0; i < 5; i++) { await p.waitForTimeout(70); await shot(); }
  // 2. Lancer rapide vers la droite : la fiche part, la suivante prend sa place
  await p.mouse.move(cx, cy); await p.mouse.down();
  for (let i = 1; i <= 4; i++) { await p.mouse.move(cx + i * 22, cy - i * 3, { steps: 1 }); }
  await shot(); await p.mouse.up();
  for (let i = 0; i < 7; i++) { await p.waitForTimeout(55); await shot(); }
  const apres = await p.locator('.deck-ctrl').innerText().catch(() => '');
  await b.close(); console.log(JSON.stringify({ images: n, compteur: apres.replace(/\s+/g, ' ').slice(0, 40), errs }));
})().catch(e => { console.error(e.message); process.exit(1); });
