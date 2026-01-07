# Praha Fušky — compact repo layout

## Served files (Firebase Hosting / static hosting)
- `public/` — deploy this folder (HTML + compiled CSS/JS + assets)

## Source files (for editing)
- `src/` — your working copies of JS/CSS (mirrored into `public/`)

## Firebase
- `firebase/database.rules.json` — RTDB rules (copy/paste into Firebase console)

### Notes
If you use Firebase Hosting, set `public` as your hosting directory.
