# PRÁCE CZ CHAT — v3 (roles, DM, map, bots, toasts, spam notices)

## Quick start
1. Serve as a static site (VS Code Live Server or any host).
2. In Firebase Console:
   - Realtime Database → **Rules** → paste `database.rules.json` → Publish.
   - Authentication → Enable **Email/Password**. Add your domain to **Authorized domains** (e.g. `localhost`, `127.0.0.1`, `github.io`).
   - Storage → Enable. If you don't want to use it, set `USE_STORAGE=false` in `config.js` (images will be stored as dataURL).
3. Change `ADMIN_EMAIL` in `config.js` if needed.

## Folders
- `img/default-avatar.svg` — default profile image.
- `database.rules.json` — DB rules (includes: roles/mods, bans, likes, reports, help, announce, map, settings, payments).
- `storage.rules` — storage rules (public read, authenticated writes per-user under `/uploads/{uid}/…`).

## Features
- Chats (city-based), Rent, DM with images, Map with admin/mod POIs (avatar + photo), Help, Announcements.
- Admin tools: make/remove moderator, ban/unban 30 min, clean chat, background per-city via URL or photo.
- Likes/Dislikes, Reports to moderators.
- Simple auth prompts (sign-in/register + **email verify** notice and **reset password** with **SPAM** warnings).
- Bots: admin no limits; others ≥15 min interval.

## Notes
- If you see `permission_denied`, publish the rules or sign-in as admin.
- For mobile: input area is sticky at the bottom; no horizontal scrolling.