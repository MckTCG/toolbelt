# Local Card Artwork Library — architecture and migration gate

## Decision

TCG Lab will store **reviewed card artwork bytes on the Toolbelt-controlled origin**, under `public/assets/card-art/`, and resolve artwork by **printing identifier**. Production Proxy Workshop and Card DB must not require a third-party image host at print time.

"Local" here means the app's own deployed static assets, not browser `localStorage`, which is per-device, too small for a whole card-image catalogue, and cannot act as a shared source of truth.

## Evidence: Delta Reign browser audit (2026-11-09)

A supplied audit covers 113 M6 records:
- Primary URL loaded in user's browser: **15**.
- Primary URL failed: **98**.
- Distinct Japanese fallback loaded after primary failure: **17**.
- At least one image candidate loaded: **32**.
- No candidate loaded: **81**.

A successful load proves only transport and decodability, **not that the image is the correct printing**. The previous browser-local repair replaced 17 failing source links with working JP artwork; it did not mirror image bytes to Toolbelt.

## Path and manifest contract

- Assets: `public/assets/card-art/<set-code>/<printing-number>.<ext>` (e.g. `public/assets/card-art/TMPDELTAREIGN/002.jpg`). Exact casing and names are recorded in a manifest, never inferred at rendering time.
- Registry: `public/data/card-art-manifest.json` with `schema`, entries of `entityId`, `printingId`, `setCode`, `number`, `path`, `sha256`, `mimeType`, `width`, `height`, `language`, `status`, and `sourceAttribution`.
- Record IDs/printing IDs remain stable even when a candidate image changes. Standard vs TEMP classification is metadata, not a filename convention.
- Only entries marked `verified` with a matching committed image are eligible for the preferred same-origin artwork resolution.
- Unverified, missing, or wrong-print images render an explicit unavailable state in print flows; they are **never** silently replaced by another printing or a same-name card.
- Retain legacy source links as optional discovery/provenance metadata, not as a hard dependency for generating a printable sheet.
- Printing UX must warn about low source resolution and failed image decoding before generating a PDF.

## Ingestion QA

1. Acquire artwork by lawful, permitted means; keep attribution, URL and capture date.
2. Verify actual set and card number, name, visual printing/variant and language against the record.
3. Decode image and check MIME type, dimensions, size, corruption and hash; reject mismatches.
4. Copy image to `public/assets/card-art`; update manifest and test that the same-origin URL loads.
5. Validate every manifest entry against its committed file; verify no duplicates/collisions.
6. Browser-test Card DB, Deck Builder and Proxy Workshop including print-to-PDF, offline/manual-upload behavior and fallback states.
7. Only then merge asset promotion and deploy. A source URL that happens to return HTTP 200 is not automatically a verified card image.

## Migration rules

- Existing `tcg-lab-card-db-v0.1` TEMP cards, saved decks and tags must not be overwritten.
- Prefer verified same-origin artwork at display/print time by **printing** key. This should work with existing browser-local cards without reimporting the 113 records.
- Keep original uploaded/manual artwork and custom overrides when explicitly selected by a user.
- No new independent card catalogue. The manifest is an **asset index**, not another card database.
- Test on multiple devices and verify same-origin image loading before advertising the migration as complete.

## Current status

**Infrastructure implemented; image migration incomplete.** A 113-record placeholder registry now exists at `public/data/card-art-manifest.json` (all entries deliberately `missing`). `public/card-art-resolver.mjs` accepts only explicit `verified` artwork entries with known paths and hashes; Deck Builder prefers those same-origin assets when they exist, without overwriting TEMP metadata. A manually launchable GitHub Actions workflow stages source candidates as downloadable artifacts, generates an image contact sheet and hash/dimension report, and **does not automatically publish any image**. Candidate acquisition/review and production files are still pending; do not claim the set is complete.

## Scope

This workstream implements preparatory artwork ingestion infrastructure and optional Deck Builder lookup, but does **not** begin Proxy Workshop Phase 2, alter the simulator, or modify browser storage. Existing remote images continue as a legacy fallback until reviewed local binaries are promoted.
