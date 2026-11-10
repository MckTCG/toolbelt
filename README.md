# TCG Lab Toolbelt

Launcher for the Pokémon TCG Toolbelt. **Source of truth:** `public/index.html` (Toolbelt v0.2).

## Linked tools

- [Prerelease Lab](https://prerelease-lab.pages.dev/) — prerelease boxes, free deck editing, transfer to simulator.
- [TCG Lab Simulator](https://prerelease-lab.pages.dev/simulator.html) — Quick Solo, Full Tabletop, Deck Stats, Deep Lab.
- [Card Explorer + Tagger](https://taggerv1.pages.dev/) — card browser and tagging.
- [Match Clock (Web)](https://mute-dust-0d50.forcoin99.workers.dev/clock.html) — browser clock with regulation and overtime countdowns, two player clocks, pause, pass and undo.
- **Proxy Workshop** (`public/proxy-workshop.html`) — offline-capable Quick Print sticker proxy builder. Paper selection: **Letter (8.5×11, 9 upright slots)** or **Tabloid (11×17, 18 sideways slots)**. Features click-to-upload/replace, bulk image import with per-import copy count, unlimited automatically paginated sheets, remove/reflow, **63×88 mm full-size or centered 62×87 mm adhesive overlays**, adjustable PROXY watermark, optional exterior crop marks and 50 mm calibration line, and a paper-specific browser Print / Save PDF reminder. Switching paper sizes reflows every queued card without losing images. This page has no card database connection in Phase 1 (planned later).

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


## Proxy Workshop — Phase 1 (feature branch only)

Source: `public/proxy-workshop.html`. Launcher: `public/index.html`, with a **Proxy Workshop** card linking to `./proxy-workshop.html` so preview deployments can use their own origin.

This is the existing standalone Quick Print v1.1, not the planned Advanced Print workflow. Preserved functions:

- Click any of the 18 slots to choose or replace a card image; or bulk-add images with a single copies-per-image setting.
- Each card is physically 63 × 88 mm, rotated to fit three columns by six rows on an 11 × 17-inch sheet.
- Apply the legible PROXY corner label; the white background opacity adjusts from 0% to 100% (default 55%), while lettering stays opaque.
- Print / Save PDF through the browser print dialog with 11 × 17 paper, 100% scale, zero margins, and no header/footer.
- Self-contained/offline HTML, no external image requests or server upload.

**Not yet supported**: letter/A4 size selection, individual quantities per card, multiple pages, native PDF export, decklist import, card database search, Pokémon/Trainer/Energy filters, or reusable print queues. These are later phases, deliberately not introduced in Phase 1.

### Testing and release

The original standalone builder was smoke-tested locally with a sample image: 18 slots, bulk upload with three copies, per-slot replacement, background-opacity change, and one 792 × 1224 pt (11 × 17 in) PDF output. Test the feature branch's hosted path after a preview deployment; local tests do not constitute production deployment. The production Worker builds from `main`; nothing on this branch should publish until intentionally merged/deployed.

For physical printing, confirm the shop's printable area and print at 100%/actual size. Print the first sheet and measure it with a ruler before committing to a batch.

## Proxy Workshop — Phase 1 printing workflow

1. Open `/proxy-workshop.html`, choose Letter (9 per page) or Tabloid (18 per page).
2. Click a slot for a single image, or choose multiple images and a copy count; additional pages appear automatically.
3. For sticker-on-existing-card proxies, optionally use the centered 62 × 87 mm adhesive overlay; enable crop marks for precise trimming. The 50 mm calibration line can verify scale after printing.
4. Click **Print / Save PDF**. In Chrome select **Save as PDF**, matching **Letter** or **Tabloid** size, **1 page per sheet**, **no margins**, **100% scale**, **headers and footers off**, **background graphics on**. Check the preview page count and never use Fit to page.
5. Print a test page and verify the 50 mm line with a ruler before printing many sheets. It is a practice-only proxy maker, not a sanctioned-tournament card-production tool.

Phase 1 intentionally uses the browser's print dialog rather than bundling PDF-generation libraries. Card-DB/decklist import and card-type filters remain deferred.


## Delta Reign provisional TEMP migration (November 2026)

A reviewed, deterministic 113-card M6 provisional seed is included at `public/data/delta-reign-temp-seed.json`.
The browser-local one-time importer is `public/delta-reign-import.html`, accessible under the same Worker origin as Card DB and Deck Builder.

- Source: `MckTCG/prerelease-lab`, embedded `Delta Reign` data: 76 base M6 printings (001–076) plus 37 alternate printings (077–113). All 113 have preliminary text summaries, provisional English image URLs and source provenance. None is represented as official English wording.
- The 22 supplementary prerelease-deck cards are **not imported**, because their names already match records in the Card DB's catalog. Exact artwork selection is still the user's responsibility.
- The importer reads/writes the existing browser-local `tcg-lab-card-db-v0.1` TEMP set/card schema, preserving the existing `tags`, `rejected`, unrelated `tempSets`, and unrelated `tempCards` fields. It downloads a pre-import backup, chooses an existing Delta Reign TEMP collection when present, and uses stable IDs plus set-number/name matching to avoid repeat duplicates.
- If Card DB has never been opened, the importer initializes its store from `card-db.html`'s existing `reviewed_seed`, rather than losing existing baseline tags.
- After importing, refresh `/card-db.html` or `/deck-builder.html` to see Delta Reign under TEMP. The migration is **per browser**: another device needs the importer or a normal Card DB TEMP backup/restore.
- **Other TEMP cards** already belong to the TEMP collection; no unrelated card is moved, deleted, reclassified or overwritten. An unrecognized orphan is left untouched rather than guessing where it belongs.
- No simulator code is changed. No new card database is created; this populates Card DB's existing TEMP fields.
- Unverified artwork links can fail or lead to nonprintable scans. Confirm loaded images and printed artwork manually before use.

Integrity validation: 113 unique IDs, complete M6 number sequence, valid TEMP IDs/set code and image URL format, second-run idempotency, and preservation of unrelated TEMP cards and tags. These are data-structure tests, not proof of live image availability or completed browser-device migration.
