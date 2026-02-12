
# Makáme.cz Architecture (v12)

## Goals
- One Source of Truth: `mk_state`
- Strict boot order: Firebase init -> auth state -> access snapshot -> restore -> lazy load -> hide preloader
- No race conditions, no double overlays, mobile-safe.

## Key paths
- Chat: `messages/<city>/<mid>` { by, ts, text?, img? }
- DM: room=`uid_uid` (sorted)
  - Members: `privateMembers/<room>/<uid>=true`
  - Messages: `privateMessages/<room>/<mid>` { by, ts, text?, img?, bot? }
  - Threads: `inboxMeta/<uid>/<room>` { peer, lastTs, lastText, unread }
- Notifications: `notifications/<uid>/<nid>` { ts, type, text, room?, read }
- Presence: `presence/<uid>/ts` heartbeat
- Premium: `payments/requests/<uid>/<rid>` status pending|approved|rejected
