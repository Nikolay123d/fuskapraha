
/**
 * Quick sanity check for module paths (run locally with node).
 * node tools/check_paths.js
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const must = [
  "assets/js/app.js",
  "assets/js/modules/boot/01_boot.js",
  "assets/js/modules/firebase/00_firebase.js",
  "assets/js/modules/features/auth/09_auth.js",
  "assets/css/style.css",
  "index.html",
  "database.rules.json",
];

let ok = true;
for(const p of must){
  const full = path.join(root, p);
  if(!fs.existsSync(full)){
    console.error("Missing:", p);
    ok = false;
  }
}
if(ok) console.log("OK: core paths exist.");
process.exit(ok?0:1);
