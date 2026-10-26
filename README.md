# TCG Lab Toolbelt

Launcher for the Pokémon TCG Toolbelt. **Source of truth:** `public/index.html` (Toolbelt v0.2).

## Linked tools

- [Prerelease Lab](https://prerelease-lab.pages.dev/) — prerelease boxes, free deck editing, transfer to simulator.
- [TCG Lab Simulator](https://prerelease-lab.pages.dev/simulator.html) — Quick Solo, Full Tabletop, Deck Stats, Deep Lab.
- [Card Explorer + Tagger](https://taggerv1.pages.dev/) — card browser and tagging.
- [Match Clock (Web)](https://mute-dust-0d50.forcoin99.workers.dev/clock.html) — browser clock with regulation and overtime countdowns, two player clocks, pause, pass and undo.

The standalone native Match Clock with Bo1/Bo3 and history is a separate workstream; the browser clock linked here is the simpler existing v3 web edition. The [Card DB v0.1](https://mute-dust-0d50.forcoin99.workers.dev/card-db.html) is now linked and provides manual TEMP-set creation and card intake on a copy of the original Standard Explorer. Automatic reveal ingestion and full Deck Builder integration are not yet implemented. Additional launcher cards (full Deck Builder and Training Lab) remain roadmap placeholders.

## Deploy to the existing Cloudflare Worker

This repository is configured for the **existing** Cloudflare Worker:
https://mute-dust-0d50.forcoin99.workers.dev/

The root `wrangler.jsonc` deliberately names this existing Worker:

```json
{
  "name": "mute-dust-0d50",
  "compatibility_date": "2026-10-26",
  "workers_dev": true,
  "assets": { "directory": "./public" }
}
```

Cloudflare's static assets support serves `public/index.html` at `/`. No separate build step, package install, compiled Worker script, or API key is required.

### One-time Git connection

1. Go to **Cloudflare → Workers & Pages → mute-dust-0d50 → Settings → Builds → Connect**.
2. **Git account:** MckTCG
3. **Repository:** `MckTCG/toolbelt` (not `prerelease-lab`)
4. **Production branch:** `main`
5. **Disable builds:** Off
6. **Build command:** Leave blank
7. **Deploy command:** `npx wrangler deploy`
8. Select **Connect**.
9. If the Worker doesn't immediately redeploy from the initial connection, trigger a subsequent commit on `main` or manually retry the build in Cloudflare.

After successful deployment, future commits to `main` update the existing Toolbelt Worker automatically. Open the Worker URL and confirm the **TCG Lab Simulator** card appears under Linked. The Cloudflare dashboard displays build status or errors.

### Editing

Edit **`public/index.html`**, commit to `main`, then check the Cloudflare deployment. Links customized using "Manage tool links" are stored per browser and can override defaults; use an incognito tab to verify new defaults.

Do **not** connect the existing Toolbelt Worker to `prerelease-lab`; that repository is separately deployed.

This project includes only public-facing launcher content, not private deck data or credentials.

### Cloudflare Git deployment trigger

The first GitHub-connected Cloudflare build is initiated by a new commit after linking the repository. This documentation-only commit intentionally starts that build; future edits to `public/index.html` will deploy through the same connection.

## Card DB v0.1 — TEMP intake

- Page: `public/card-db.html` (based directly on the Tagger v2 Explorer's immutable August 31 Standard snapshot).
- Supports named Japanese TEMP sets, stable card IDs independent of set/printing, original card image URLs, English text, translation reliability, watch/testing status, notes, and inherited tagging controls.
- Browser-local storage key: `tcg-lab-card-db-v0.1`.
- **Export complete backup** and **Export TEMP data** are portable JSON formats; **Choose JSON backup / tags** restores TEMP sets/cards and their associated tags.
- The original Tagger remains separately hosted at `taggerv1.pages.dev`. Browser storage does **not** sync across those two origins. Import a JSON Tagger backup into Card DB to migrate approved tags.
- This is **manual intake**, not an automated card-reveal importer or finished Deck Builder. The TEMP data export is the future Deck Builder's input contract.
- There is no guarantee of continuous cross-device sync; download regular backups. Never interpret preliminary notes as official English card text.

## Deck Builder v0.1

- Page: `public/deck-builder.html`. Reads the Standard catalogue directly from Card DB's embedded JSON and TEMP cards/approved tags from the same-origin Card DB browser store; no duplicated Standard dataset.
- Draft: `tcg-lab-deck-builder-draft-v1`. Saved library: `tcg-lab-decks-v1`. Saving never writes to Card DB or Tagger storage.
- Supports 40/60-card decks, printing selection, provisional TEMP cards, explicit save/copy, draft recovery, undo/redo, text and portable JSON imports/exports, full library backup/restore, and 63 × 88 mm print sheets.
- Simulator transfer uses the existing `tcg-lab-deck-v1` UTF-8 URL-fragment contract, carrying stable card/printing IDs, image URLs, English text and Basic/evolution metadata. Quick Solo starts immediately; Full Tabletop opens configuration and can use the imported deck for either player.
- Deck checks are a practice guide, not a live legality checker. Text exports cannot carry custom images or translation text; use JSON or Simulator transfer for proxies.
- Run core checks: `node scripts/test-deck-builder.mjs /path/to/simulator.html`. The simulator argument is optional.
