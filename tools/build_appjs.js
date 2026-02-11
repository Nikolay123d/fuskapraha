// tools/build_appjs.js
// Concats assets/js/modules/*.js into assets/js/app.js (keeps GitHub Pages simple: no bundler).
// Run: node tools/build_appjs.js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const modDir = path.join(root, 'assets', 'js', 'modules');
const outFile = path.join(root, 'assets', 'js', 'app.js');

const order = [
  '00_prelude.js',
  '10_auth.js',
  '20_chat.js',
  '30_dm.js',
  '40_friends.js',
  '50_members.js',
  '60_rent.js',
  '70_map_and_tail.js',
];

let out = `/* AUTO-BUILT: assets/js/app.js (concat of assets/js/modules/*.js)
   Single Source of Truth: roles/<uid>/admin
   Generated at: ${new Date().toISOString()}
*/\n\n`;

for (const f of order) {
  const p = path.join(modDir, f);
  if (!fs.existsSync(p)) throw new Error('Missing module: '+p);
  out += `\n/* ===== ${f} ===== */\n` + fs.readFileSync(p, 'utf8') + '\n';
}

fs.writeFileSync(outFile, out, 'utf8');
console.log('Wrote', outFile);
