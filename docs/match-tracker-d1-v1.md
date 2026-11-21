# Toolbelt Match Tracker — Cloudflare D1 (staged v1)

**Status:** implementation branch only. The UI is not connected to online storage until the Cloudflare database, binding and secret are provisioned. **Do not merge/deploy blindly.** Existing production Wrangler config remains static-assets-only deliberately.

## Files

- public/match-tracker.html and .mjs: record games; inspect PTCGL logs; browse cloud history; download complete JSON, match CSV, text logs, and matchup statistics CSV; restore a JSON archive.
- public/match-tracker-core.mjs: conservative log extraction (no invented winner), CSV generation with spreadsheet formula safeguards.
- worker/match-tracker.mjs: same-origin single-owner API, Bearer-secret authentication, D1 queries, duplicate checks.
- migrations/0001_match_tracker.sql: SQLite tables and indices.
- wrangler.match-tracker.example.jsonc: deployment example, not active.

## Create Cloudflare D1 and connect Worker (one-time owner action)

Cloudflare provisioning cannot be performed through this repository's GitHub connection. You must use your own Cloudflare account/CLI. **Do not send access tokens or secrets in chat or commit them to Git.**

1. On Windows with Node.js installed, open a terminal in the checked-out Toolbelt repository and run: npx wrangler login
2. Create the database with: npx wrangler d1 create toolbelt-matches. Copy the database_id UUID. This ID is not a password.
3. Update root wrangler.jsonc using the example settings, replace REPLACE_WITH_D1_DATABASE_UUID with the actual ID, and keep the Worker name mute-dust-0d50. The production build command remains npx wrangler deploy. **Do not put the bearer token in this configuration.**
4. Generate a long random secret in a trusted local terminal: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))". Store it in a password manager. Never publish it.
5. Run: npx wrangler secret put MATCH_TRACKER_TOKEN. Paste the secret when prompted. This stores it in Cloudflare, not GitHub.
6. Apply the migration to the remote database: npx wrangler d1 migrations apply toolbelt-matches --remote
7. Deploy: npx wrangler deploy. Verify https://mute-dust-0d50.forcoin99.workers.dev/api/match-tracker/health reports configured: true. This endpoint intentionally exposes no match records.
8. Open /match-tracker.html, enter your key and click Connect. Save a test game, refresh, retrieve the original log, export JSON and CSV, and verify restore deduplication.

**Git deployments:** Once root wrangler.jsonc has the D1 binding and main Worker entry point, Cloudflare Git deploys of main will use those settings. Review build settings before merging. Do not commit passwords, tokens or private logs.

**Security:** Match CRUD and statistics endpoints require a secret Bearer token over HTTPS. The browser does not persist the key in localStorage or a cookie. There is no permissive CORS. Anyone who learns the key can read or delete the archive; keep it private and rotate it if exposed. This is single-owner access, not multi-user login.

## V1 behavior and limitations

- **Original logs verbatim:** textarea content is persisted without normalization; only the duplicate-check SHA-256 hash normalizes CRLF. Reimporting the same log returns HTTP 409.
- Manual games may have no raw log. Games are individual records: a Bo3 series and tournament parent event are not modelled yet. Win percentage is wins / all games (ties included in denominator).
- Deck/version are typed labels, not yet foreign keys to the Deck Builder. The schema reserves a JSON deck snapshot.
- PTCGL logs vary by client build and language. The parser recognizes conservative opening-hand, first-player and winner phrases and reports uncertainty; the user confirms the outcome. It does not infer opponent archetypes from individual cards.
- Complete export downloads pages of up to 100 records sequentially to capture the whole archive. JSON includes original logs and fields; CSV contains match metadata; TXT includes only original battle logs; matchup CSV contains per-archetype totals.
- JSON backups restore without overwriting existing records; duplicate logs/IDs are skipped, and failed rows are counted.
- PDF via browser print-to-PDF from the stats page; native XLSX and ZIP archives not yet implemented. CSV opens in Excel / Sheets.
- Automated recurring backups not yet implemented. Download JSON backups regularly. D1 free tier currently limits each database to 500 MB.

## Verification

- node scripts/test-match-tracker.mjs
- python3 scripts/test-match-tracker-schema.py
- Cloudflare smoke test after provisioning with a real PTCGL log and exported record.
- Review the draft PR and its validation checks; do not merge until the owner completes one-time Cloudflare setup.
