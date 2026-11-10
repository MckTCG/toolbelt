# TCG Lab Toolbelt — Card DB Phase 3: JP-first TEMP and rapid rechecks

**Work in progress / code review:** \`feature/card-intake-temp-bridge-20261110\` / PR #25. Do **not** merge before the user approves. Assisted Play remains frozen. Proxy Workshop and Manual Simulator source code are unchanged.

## Design decision

A Japanese-only card can be accepted to TEMP and used immediately for **manual** play. English card text, an official English set code, and any release date are not prerequisites.

TEMP means *research/playtest record*, not tournament legality or official English verification.

### One card, three separate questions
- **Can it be represented on a manual tabletop?** Yes if a recognizable name and valid card category exist. The card image and its original JP text can be used; the simulator does not need executable effects or English wording.
- **Can a proxy be printed?** Yes if the original card image has a usable HTTPS URL. This is a *source reference*, not a claim the artwork is locally stored or high-resolution enough for good printing.
- **Can it be published to the verified English Master DB?** Only after existing Phase 1 approval gates: confirmed English gameplay information, set/printing, exact artwork, release date and human review.

## User-facing workflow

1. Open \`/card-intake.html\`, fetch recent reveals, and select an individual card.
2. Fill in **name (Japanese allowed)** and **category**. Enter or preserve the original Japanese artwork URL when available.
3. Optionally add a Japanese name, a provisional translation and its source, Japanese/English release dates, or choose an existing TEMP set. No source URL/translation/release metadata is invented.
4. Click **Accept to TEMP**. The browser writes the record to \`tcg-lab-card-db-v0.1\` (the *existing* Card Explorer TEMP overlay), and keeps its linked \`temp_entity_id\` on the intake record.
5. Click **Add to Deck Builder** to add the exact TEMP printing to your current draft, then build a valid 40/60-card practice deck and transfer it to the **Manual Simulator**. The simulator accepts image-only JP cards in its existing deck handoff; its automation and rules remain untouched.
6. Or click **Open Proxy Workshop**, choose **Import cards/decks**, and search for the accepted TEMP record. This workflow only depends on the source image.
7. **Approve for export** remains the independent path to the reviewed English Master DB, not a prerequisite for TEMP use.

The TEMP overlay, intake queue, draft decks and personal tags are **browser-local under this Worker origin**. Export JSON backups before switching browsers/devices. A standalone app on a different origin does not automatically share these local keys; use the Deck Builder handoff and exported decks to move cards into other tools.

### Duplicate and historical record safety

- Records preserve their original stable \`temp:\` gameplay ID, card tags, reviewer notes and research status.
- Sources with several cards remain separate: source URL alone never establishes identity.
- Matches are made against explicit discovery ID, or existing TEMP set plus collector number, with a same-set name check. The existing **Aura Seeker / Flowing Fists** alias is retained to avoid duplicating the seeded M7 TEMP set.
- An existing record is **not overwritten** when a discovery suggests new text/artwork/HP. Card Intake first presents field-by-field changes and requires explicit confirmation before updating.
- Changes are saved in \`revisionHistory\`; translation changes are separately preserved in \`translationHistory\` with the source link. Existing personal tags and rejected-tag decisions remain untouched.
- If legacy browser TEMP JSON is corrupt, ordinary intake and discovery still work; TEMP acceptance refuses to overwrite unreadable data.
- The default Card DB tag seeds are retained on first-run initialization. No Master catalogue records are modified.

## Translation lifecycle

\`jp-only\` → \`unofficial\` → \`official\` is **translation metadata**, not a mandatory order or evidence of release. The user controls those labels; discovery never marks source or artwork verified. A corrected unofficial translation creates a new revision rather than changing gameplay identity.

The browser's **Check new reveals** button now compares incoming discovery candidates to accepted TEMP records and indicates possible changes. **Review latest suggested fields** loads the new values into the unsaved intake form, preserving the stored TEMP version until the user accepts the update.

### Faster rechecks

The independent GitHub staging workflow now runs **at 00:15, 04:15, 08:15, 12:15, 16:15 and 20:15 UTC** (every four hours), i.e. **20:15, 00:15, 04:15, 08:15, 12:15 and 16:15 Santo Domingo**. Your existing 03:55 daily ChatGPT reminder is **not modified**.

On each run, the bot checks recent card news and revisits previously discovered PokéBeach articles published within the last 72 hours. The 08:15 UTC pass additionally revisits older articles for the first month, articles near a **known** release date (within ±30 days), and a limited weekly sample of older articles. The requests are capped (8 newest RSS articles, up to 8 rechecks, 30 image references, polite spacing), and only the isolated \`automation/card-discovery-feed\` branch receives candidate JSON.

**Important limitations:** the server does not see private browser-local TEMP records. It can only recheck discoveries represented in the published feed. If you manually create a TEMP card whose source was never staged, it will not be rechecked automatically until a matching discovery enters the feed. This is not a browser notification service, nor is it a guarantee that translations appear within hours; it is a polling/review pipeline subject to provider publication, availability and GitHub schedule delays. No automatic text replacements or Master DB merges take place.

## Automated QA

- \`node scripts/test-temp-intake.mjs\` — JP-only acceptance, stable identity, non-overwriting updates, Aura alias, no English gating, first-run tag seeds, downstream native TEMP/Deck Builder payload compatibility.
- \`node scripts/test-temp-intake-browser.mjs\` — real Card Intake → same-origin Deck Builder handoff; release/date/text not required for TEMP; Master publication blocked; explicit translation review and persistent history.
- \`python3 scripts/test-card-discovery.py\` — new 72-hour and near-release recheck coverage, unchanged article parsing fixtures.
- Existing Card Intake Chromium, Proxy Workshop, Tagger and discovery tests remain regression gates. Production deployment and user playtesting are separate and require merge approval.

## Release caveats

1. The first online accepted TEMP card still relies on the selected source artwork URL. Local artwork download/verification remains an independent project.
2. Manual Simulator transfer requires a practice deck that satisfies the Deck Builder's deck-size constraints. This release does not create a one-card automated battle.
3. No edits to \`MckTCG/sim\`, the experimental Assisted Play branch, or \`public/proxy-workshop.html\`.
4. Daily GitHub Actions frequency increases from one to six runs; review Actions usage if minutes/credits matter.
5. Phase 3 does **not** automatically promote TEMP records into the official English catalogue. Promotion still uses a reviewed pull request, with canonical identity reconciliation.
