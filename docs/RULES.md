
# Rules Notes

See `database.rules.json`.
Principles:
- Reads are scoped: privateMembers gate privateMessages.
- Writes for moderation are role-based (admin/moderator).
- Send paths must not do extra reads: rely on `MK_ACCESS` snapshot and rules to enforce.
