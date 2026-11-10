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


## Delta Reign (English DLR) — master catalogue integrated (November 2026)

English **Delta Reign (DLR)**, released 6 November 2026, is now an ordinary set inside the existing master Card DB: **141 numbered printings** grouped into **107 gameplay entities**; **all 141 English card scans** are committed under `public/assets/card-art/DLR/` and indexed by unique printing ID in `public/data/card-art-manifest.json`.

- Source: [Limitless DLR](https://limitlesstcg.com/cards/DLR), individually reconciled by card number, gameplay text, rarity and image filename. Official Pokémon release information confirms the set. See `docs/dlr-master-import-audit.json` for the programmatic QA report.
- The preexisting **2,036 catalogue entities were preserved**. Card DB and Deck Builder prefer locally hosted artwork; source URLs remain in printing metadata for provenance/fallback.
- The old provisional Japanese M6 import, seed and hosted files have been removed from the repository. On browsers where M6 TEMP records were previously imported, set code `TMPDELTAREIGN` is **archived from active browsing** without deleting any local data, tags or saved deck references. Backups still include those records.
- English DLR entries do **not** require the user to visit an importer or write to browser localStorage; the published set is part of the master catalogue for every visitor after deployment.
- Source extraction and basic structure/asset checks passed. End-to-end browser-level printing and live Cloudflare deployment remain separate verification steps. Proxy Workshop Phase 2 remains unchanged.



## Proxy Workshop — Phase 2 native import (feature branch)

Proxy Workshop extends existing Quick Print without changing the primary workflow. **Import cards / decks** is an optional, collapsible panel; manual image upload and browser Print / Save PDF work as before, including offline when the separate JavaScript module or Card DB is unavailable.

- Search the existing Standard + browser-local TEMP catalogue by name, set, category, Pokémon type and subtype; select exact set/printing and quantities (including 1–4 quick-add).
- Select saved Deck Builder decks from the shared browser origin, or preview Deck Builder JSON, deck backups and text decklists. Choose a scope (entire deck, Pokémon, Trainers, Energy or checked cards) and change printings and quantities before adding to sheets. Source decks are never modified.
- All sources feed into the **existing** multi-page Letter/Tabloid queue; adjust group quantities, remove cards, move groups, or change an exact printing. No second master catalogue or new browser storage keys are introduced.
- Artwork loads from the verified same-origin image manifest where available, with existing source URLs and conservative fallback candidates. Missing art is reported rather than silently substituted, and printing is blocked if an image cannot decode.
- Card browsing needs the hosted Card DB HTML, Deck Core module, manifest and new importer module; a downloaded single HTML file remains a **manual Quick Print-only** offline tool, not an offline copy of the whole Standard dataset.

**QA:** Node regression and Deck Builder tests; browser-level (Chromium/Playwright) test for Quick Print, native importing and PDF generation. See the project workflow file. Never promote without actual test results and a production print smoke test.

See [Phase 2 design and release checks](docs/proxy-native-phase2.md).


## Card DB Intake v1 — reviewed reveal queue (merged in PR #21)

- **Workspace:** \`public/card-intake.html\` (Toolbelt → **New Cards · Review Intake**). It reads the same Master Card DB catalogue as Card Explorer, Deck Builder and Proxy Workshop; no second authoritative database.
- Stage HTTPS reveal URLs, import JSON/CSV batches, fill/verify card details, detect existing printings and ambiguous gameplay identities, approve individual English cards, and export an approved JSON batch. The draft queue stays in browser \`localStorage\` under \`tcg-lab-card-intake-v1\`, isolated from all existing tag and deck storage.
- **Safe publishing:** \`node scripts/publish-card-intake.mjs --batch reviewed.json\` previews changes, then \`--apply\` updates a local Git checkout after validations. Review and commit on a feature branch; no browser-side GitHub credentials, automatic merge or silent production update.
- URL imports do **not** automatically scrape PokéBeach/Proxies pages; Limitless EN/JP card links prefill set and collector number only. The existing scheduled reveal reminder is **not yet connected**. Automatic discovery is the next phase.
- Confirmed English printing imagery currently remains an HTTPS source reference in newly published records; the next controlled artwork milestone will verify and host assets locally. Delta Reign's existing local artwork remains intact.
- Regression: \`node scripts/test-card-intake.mjs\`; browser QA: \`node scripts/test-card-intake-browser.mjs\` (requires Playwright). See \`docs/card-db-intake-v1.md\`.

**Do not confuse review approval with publication.** Publication requires a reviewed GitHub PR and deployed-app verification. Assisted Play and Proxy Workshop are unchanged.


## Card DB Discovery Phase 2 — daily staged reveals (proposed)

- **Existing intake UI:** \`public/card-intake.html\` adds one **Check new reveals** button. It reads the separate, public, unverified staging feed and lets you review multiple cards from a single article without overwriting existing tags or decisions.
- **Sources:** PokéBeach news via a third-party RSS relay plus its original structured card blocks; Pokémon Proxies hashed image references (unofficial translation/artwork only); individual Limitless EN/JP card pages when supplied. No source automatically certifies exact English text or legality.
- **Extraction:** \`python3 scripts/discover-card-reveals.py --out /tmp/card-discovery.json\`; the conservative HTTP/HTML/XML parsers use only the Python standard library, do not execute source JS, and include allowlisted hosts, size caps and timeouts.
- **Review boundary:** \`node scripts/verify-card-discovery-feed.mjs /tmp/card-discovery.json\` prevents approved flags, duplicate IDs, known Master DB printings, and untrusted source hosts from being staged.
- **Staging architecture:** After user-approved merge, a new GitHub Actions workflow runs at 04:15 Santo Domingo, separate from the user's original 03:55 card watch. It publishes **only** \`public/data/card-discoveries-v1.json\` to \`automation/card-discovery-feed\` (never \`main\` or the authoritative Card DB). If GitHub push permission is unavailable, an Actions artifact is kept for manual import.
- **No automatic artwork storage:** third-party images are references pending exact-printing and permission verification. Existing locally stored Delta Reign artwork is untouched.
- **QA:** \`python3 scripts/test-card-discovery.py\`, \`node scripts/test-card-discovery-browser.mjs\` (requires Playwright), full live-adapter smoke tests, and existing database regressions. See \`docs/card-db-discovery-phase2.md\`.

Assisted Play and Proxy Workshop are outside Phase 2. No automatic card approval, database modifications, reminder changes, or merge/deployment are authorized by the discovery pipeline itself.
