# Master Card DB · Card Intake v1

## Scope and decision
**Phase A, not Assisted Play.** This sprint introduces one reusable card-intake contract and a local-first review surface. It does not import any real new cards, rewrite the existing catalogue, edit Toolbelt's other tools, or change the scheduled Pokémon TCG Card Reveal Watch. Proxy Workshop stays untouched.

The authoritative English catalogue remains the \`<script id="catalog" type="application/json">\` within \`public/card-db.html\`, schema \`tcg-lab-catalog-v2\`. The new \`public/card-intake.html\` fetches this catalogue same-origin and checks candidate names/printing keys against it.

**Starting baseline (November 10, 2026):** 2,143 gameplay entities, 3,486 unique printing IDs, 111 sets, 141 Delta Reign printings / 107 gameplay entities. The existing 2,036 pre-Delta Reign gameplay IDs are preserved.

## Browser review workflow
1. Open Toolbelt → **New Cards · Review Intake**, or visit \`/card-intake.html\`.
2. Paste a source URL. HTTPS Limitless card pages in \`/cards/en/SET/NUMBER\` or \`/cards/jp/SET/NUMBER\` format prefill language and source identifiers. A PokéBeach or Pokémon Proxies article URL is stored as a source reference; this version does **not** automatically scrape arbitrary article content.
3. Fill the observed card fields and exact printing image URL; copy the complete published text. New Pokémon identities also require structured attacks and/or Abilities in JSON arrays.
4. Check the automatic classification:
   - \`duplicate-printing\`: same set and collector number already exists — cannot publish.
   - \`new-printing\`: a strict mechanical identity matches exactly.
   - \`needs-review\`: existing name but different/incomplete mechanics. Resolve with an explicitly linked gameplay ID and matching text, or independently review as a distinct gameplay identity.
   - \`new-gameplay\`: no matching identity.
5. Check **Source and text verified** and **Exact printing artwork verified** only after actually checking the evidence; confirm English language, regulation mark, release date, set, and exact printing. Provisional Japanese translations stay provisional.
6. Click **Approve for export**, then **Export approved**. Save a full queue backup periodically.

The queue is stored under \`tcg-lab-card-intake-v1\` in this browser only. It never reads/writes \`tcg-lab-card-db-v0.1\` (tags/TEMP) or any Deck Builder / Proxy Workshop storage. Exported approved JSON is *not* a published Master DB update.

**Usability note:** This is a new Card DB workspace linked from the Toolbelt launcher, not a replacement for Card Explorer or its tag review queue. It shares the Worker origin and Master catalogue. Retiring the older TEMP editor is out of scope.

## Batch schema and sources
\`tcg-lab-card-intake-v1\` with a \`cards\` array, maximum 500 candidates per batch. The browser can also import CSV with matching column names. Core contract: \`public/card-intake-core.mjs\`. Example:

\`\`\`json
{
  "schema": "tcg-lab-card-intake-v1",
  "cards": [
    {
      "source_url": "https://www.pokebeach.com/example-published-card",
      "language": "en",
      "set_code": "TST",
      "set_name": "Illustrative Set",
      "card_number": "1",
      "name": "Example Item",
      "category": "Trainer",
      "stage": "Item",
      "combined_text": "An example effect.",
      "rules_text": "An example effect.",
      "regulation_mark": "J",
      "release_date": "2026/11/10",
      "rarity": "Uncommon",
      "image_url": "https://example.org/example.png",
      "source_verified": true,
      "artwork_verified": true,
      "status": "approved"
    }
  ]
}
\`\`\`

This is **illustrative fixture data**, not a real card. Import only observed facts. Candidate fields \`abilities\` and \`attacks\` hold structured arrays for new Pokémon records; never synthesize effects from an image URL.

## Safe publication through GitHub
**No web-interface GitHub credentials or public write endpoint are introduced.** To publish a reviewed batch:
1. Commit/upload the approved batch JSON into a **review branch**, or provide the export to a connected GitHub development session.
2. In a Git checkout, run:
   \`\`\`sh
   node scripts/publish-card-intake.mjs --batch intake/approved.json --report intake/preview-report.json
   \`\`\`
3. Inspect the dry-run report. Rejected/ambiguous/duplicate candidates cause a nonzero exit and **no writes**.
4. Only after reviewing all accepted changes:
   \`\`\`sh
   node scripts/publish-card-intake.mjs --batch intake/approved.json --report intake/apply-report.json --apply
   \`\`\`
5. Review \`git diff -- public/card-db.html\`, run Card DB/Tagger/Deck Builder/Proxy Workshop tests, submit a PR, merge after approval, and verify the Cloudflare Worker + Tagger consume the new catalogue. Do not push straight to \`main\`.

The publisher is **atomic at batch level**: if any approved candidate is rejected, no catalogue file is changed. It creates new gameplay identities conservatively, preserves every preexisting ID and gameplay field, attaches verified alternative printings, validates ID uniqueness, and updates per-set printing counts. A set created through intake is explicitly marked as potentially incomplete.

## Known limitations (deliberate)
- **Card discovery is not yet automated.** The existing daily Pokémon TCG Card Reveal Watch continues to notify separately; it does not push candidates into this browser's private queue. Release 2 will introduce independently versioned server-side discovery and staging, retaining human approval.
- **Source URLs are references, not fully parsed card records.** General PokéBeach or Pokémon Proxies article pages may contain multiple reveals. Automatic site adapters will be added only after they have extraction and provenance tests. Limitless card URLs currently prefill set/number, not complete gameplay text.
- **Artwork:** v1 stores reviewer-approved HTTPS image references but **does not auto-download third-party artwork or claim local storage**. Existing DLR local artwork is unaffected. A controlled artwork-download/verification step is a subsequent milestone.
- **No automatic legality claims.** Regulation marks and release dates are stored as observed; the publisher labels legality as needing up-to-date tournament-rule verification. Historical reprint text equivalence and errata are NOT inferred automatically.
- Only verified English records may pass the publication gate. Provisional Japanese records remain in the intake queue or existing TEMP system.
- This is local-first, with no cross-device/private queue sync; back up the intake JSON.

## Regression gates
- \`node scripts/test-card-intake.mjs\` tests URL handling, CSV, classification, duplicate DLR printings, metadata verification, dry runs, atomic publication, and new-vs-printing grouping on an isolated copy of the Master DB.
- \`node scripts/test-card-intake-browser.mjs\` runs headless Chromium to test review UI, approval, download, page reload, DLR duplicate prevention and preservation of existing Card DB storage.
- Existing tests remain: \`node scripts/test-deck-builder.mjs\` and \`node scripts/test-tagger-master-access.mjs\`. Nothing here modifies Proxy Workshop or Assisted Play.
- A passing test does not prove live Cloudflare deployment, source-card correctness, or print image accuracy; those require separate acceptance.
