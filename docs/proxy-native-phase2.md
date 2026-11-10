# Proxy Workshop Phase 2 — implementation and release criteria

## Scope

This is an extension of the existing local-first Quick Print, not a new application. Branch: `feature/proxy-native-import-phase2`. Production stays on `main` until verified. The legacy 63 × 88 mm / 62 × 87 mm sheets, Letter / Tabloid capacities, watermark, cutting guides, calibration rule, manual slots, per-image bulk imports, automatic pagination and browser PDF print are retained.

## Architecture

- `public/proxy-workshop.html`: original Quick Print; a small `window.__proxyQueue` bridge accepts verified card artwork and exposes non-destructive quantity, ordering and printing updates.
- `public/proxy-import.mjs`: optional card/deck browser; loads the existing embedded master catalogue from `card-db.html` exactly as Deck Builder does. It uses the same browser-local TEMP and Deck Builder storage keys; it never writes to those stores.
- `public/proxy-import-core.mjs`: pure catalogue filtering, subtype classification, decklist/JSON parsing and selection logic, reusing `deck-core.mjs` conventions.
- `public/card-art-resolver.mjs` and `public/data/card-art-manifest.json`: verified same-origin exact-printing artwork when available. Other source URLs are retained only as fallbacks. Image decode is verified before queue insertion, and unsuccessful prints are blocked.
- The print queue remains the original array of slot artwork URLs. All sources add to that queue. Repeated artwork URLs coalesce in the queue editor; card count is the sum of copies, not the number of search results.

## Supported imports

Card search: name, set/number, category, stage/ex, trainer subtype, Basic/Special Energy, Pokémon type; exact printing selection and quantities 1–999.

Saved Deck Builder library / draft on the same origin; TCG Lab `tcg-lab-deck-v1` JSON, library JSON backups and Pokémon decklist text. Scope all, Pokémon, Trainer, Energy or checked rows; quantities and printings can be adjusted before transfer. Imports **never mutate the saved deck**.

## Limitations

- Downloading this HTML file alone provides manual offline Quick Print, not a bundled offline Card DB. Native importing requires hosted same-origin modules and catalogue files.
- Legacy printing URLs for which we do not have locally verified art depend on their host being reachable and allowing browser image rendering; the importer shows errors and prevents incomplete printing.
- Queue groups are keyed by actual artwork URL, so two separately sourced records with identical art URLs appear as one group and their quantities combine. Manual uploads remain identifiable by unique browser blob URLs.
- No persistent reusable print queue, direct PDF library, or integration with simulator. Browser-local card/deck data does not sync across devices/origins.

## QA and release gate

1. `node --check` on importer files; Node regression on 141 English DLR printings, Rayquaza DLR #84/#138/#141, Buddy-Buddy Poffin, set/printing filters, TEMP migration, JSON/text/backup imports and Phase 1 hooks.
2. Deck Builder regression: `node scripts/test-deck-builder.mjs`.
3. Chromium smoke test: manual file upload, quantities, Letter ↔ Tabloid reflow, overlay/cutting guides, native DLR printing selection, queue editing, deck JSON import, multi-page PDF output.
4. Compare full diff and verify unrelated files unchanged. Only then merge the PR.
5. After merge, verify the existing Cloudflare Worker deployment in a live browser, including manual upload and print and native card search.

No step is marked complete until its actual test or production verification succeeds.
