# Toolbelt Card DB · Phase 2 Discovery & Provisional Intake

**Status:** proposed implementation on \`feature/card-db-discovery-phase2-20261110\`; PR approval required for merge and deployment. The daily **Pokémon TCG Card Reveal Watch** (3:55 AM) is unchanged.

## What this changes

Extends Phase 1 without redesigning Card Explorer or requiring a new Master DB. A new **Check new reveals** button in \`public/card-intake.html\` imports an unverified staging feed. Multiple cards from one article are separate candidates; repeated checks do not duplicate existing review records, and the browser's old tag storage is untouched.

The authority for published English card records remains **\`public/card-db.html\` / \`tcg-lab-catalog-v2\`**. The staging feed is NOT part of that authoritative database.

## Sources and evidence

1. **PokéBeach**: discovered via a *community-maintained* front-page RSS relay at \`https://kaprestridge.github.io/pokebeach-news-feed/feed.xml\`. The bot fetches the original article URL on \`www.pokebeach.com\` and reads structured HTML \`card-spoiler\` elements. These can contain multiple independent cards in the same news article. Extracted fields may include names, collector numbers, set hints, HP, Pokémon type, evolution, Abilities, attacks, weaknesses, retreat costs and artwork references. Never assume an unofficial English translation is the final English card wording.
2. **Pokémon Proxies**: a JavaScript-rendered site; the HTML itself contains no usable card list. The bot fetches its referenced static JS bundle and locates hashed artwork asset filenames for the current newest prefix. Extracts artwork URLs and *filename hints only*. Set codes, translations and gameplay text are **not inferred from filename patterns**. Images are third-party references, not downloaded, certified or stored locally.
3. **Limitless**: individual supported URLs such as \`https://limitlesstcg.com/cards/en/DLR/84\` and \`https://limitlesstcg.com/cards/jp/M6/58\` expose structural card metadata. \`--card-url\` allows targeted extraction when a concrete card URL is known. The bot does not crawl entire Limitless sets or infer English eligibility from Japanese records.

All source endpoints may change. Extraction errors are reported in the feed; failures are never silently counted as successful publication.

## Actual observed pilot

The November 10, 2026 GitHub Actions live pilot scanned 5 recent PokéBeach RSS articles, extracted 22 individually structured card records, identified 20 Pokémon Proxies artwork references, and parsed one Limitless card. All requests completed with no extraction errors. The action tests classification against the **current** Master DB; existing printings are not staged as new candidate records.

GitHub Actions run: \`42780033749\`.

These are **machine-discovered records**, not verified card data. In particular, some site translations are unofficial, and artwork filenames alone cannot establish gameplay effects.

## Architecture and safety boundary

\`\`\`
PokéBeach community RSS → original article structured card blocks ─┐
Pokémon Proxies → bundle image references only                    ├─ read-only extractor
Limitless → targeted individual EN/JP card URLs                   ┘
        ↓
Master DB printing-key exclusion + stable discovery IDs
        ↓
GitHub Actions evidence JSON (unverified only)
        ↓
automation/card-discovery-feed  [isolated public branch; NEVER main]
        ↓
Card Intake → Check new reveals → browser-local review queue
        ↓
Explicit user review → approved intake JSON → dry-run publisher → reviewed PR
        ↓
Master Card DB on main → deployed Card Explorer / Tagger / Deck Builder
\`\`\`

No source-supplied candidate can contain \`approved\`, \`source_verified:true\`, \`artwork_verified:true\`, an authorized gameplay identity link, or other claims of verification when staged. \`importDiscoveryFeed\` forcibly clears those fields on the client too. Source HTML never executes, and an allowlist limits outgoing site fetches to known HTTPS domains. There is no browser GitHub token, no public write endpoint, and no automated database publication.

## Isolated staging feed and schedule

The new GitHub Actions workflow \`.github/workflows/card-discovery-daily.yml\` is configured for \`08:15 UTC\` (04:15 Santo Domingo). This does not alter the pre-existing 03:55 reminder; it is a **separate scheduled repository job** and only starts after the workflow is merged to the default branch.

On each run, the workflow:
- Reads the last staged discovery JSON, if any.
- Fetches recent sources with capped page count, response size, timeouts and inter-article delay.
- Excludes known Master DB set/collector-number keys.
- Deduplicates by stable discovery ID and retains previously staged candidates.
- Validates the output using \`scripts/verify-card-discovery-feed.mjs\`.
- Uploads a GitHub Actions artifact for recovery.
- Pushes **only** \`public/data/card-discoveries-v1.json\` to the isolated \`automation/card-discovery-feed\` branch.

The branch and its JSON are public, containing only third-party card news and references, not personal tags. The production browser reads:

\`\`\`
https://raw.githubusercontent.com/MckTCG/toolbelt/automation/card-discovery-feed/public/data/card-discoveries-v1.json
\`\`\`

If repository policy prevents \`GITHUB_TOKEN\` from pushing to the staging branch, the Actions artifact remains available for manual import. **No permission escalation or automated merge is attempted.**

Do not claim scheduled discovery is live until the workflow has been merged, executed, the isolated branch exists, and the browser has fetched and displayed real candidates.

## Running a controlled discovery now

\`\`\`bash
python3 scripts/test-card-discovery.py
python3 scripts/discover-card-reveals.py \
  --max-articles 5 --max-proxies 20 \
  --card-url https://limitlesstcg.com/cards/jp/M6/58 \
  --out /tmp/card-discovery-preview.json
node scripts/verify-card-discovery-feed.mjs /tmp/card-discovery-preview.json
\`\`\`

The script needs no third-party dependencies. Use a monitored, conservative rate. Pass \`--prior old-feed.json\` to preserve already staged candidates. The \`--fixture-dir\` option supports offline tests without contacting providers.

## User acceptance workflow

1. After an approved merge/deployment, open \`/card-intake.html\`.
2. Click **Check new reveals**.
3. Review provisional candidates (including independent cards in the same PokéBeach article).
4. Check the source link, confirm language, actual set and collector number, complete attacks/Abilities, and exact printing image. Amend errors manually.
5. Change English/verification fields only when **officially confirmed**. Export approved JSON.
6. Publish through the existing \`scripts/publish-card-intake.mjs\` workflow on a new feature branch and submit a separate user-approved PR.
7. After Cloudflare deployment, verify all consuming tools; never assume GitHub merge proves live deployment.

If the discovery feed is unavailable, the UI displays an error and leaves local review items untouched.

## Artwork and identity limitations

This release stores **source image references only**. No new artwork is automatically copied into Toolbelt's asset store or \`card-art-manifest.json\`, and nothing is labeled locally verified. A subsequent controlled artwork QA step must check image identity, resolution, licensing/permissions and SHA256 before copying approved assets locally. Existing Delta Reign local artwork remains intact.

Card names and translated descriptions alone do **not** prove functional identity; no English Standard-legal classification is granted automatically. Provisional Japanese/translated cards cannot pass the Phase 1 English-only publication gate until independently confirmed.

The nightly process does not automatically scrape every possible new card from every provider; PokeBeach articles without structured \`card-spoiler\` markup are staged as source-only review references. Limitless set-wide discovery remains an optional future adapter. Rate limits, source changes, full catalogue completeness and official errata still require oversight.

## QA gates

- Python unit fixtures: \`scripts/test-card-discovery.py\`.
- Actual third-party source extraction: \`.github/workflows/card-discovery-qa.yml\`, live-adapter-smoke.
- Staging feed integrity: \`scripts/verify-card-discovery-feed.mjs\`, including comparison to the Master DB.
- Chromium: \`scripts/test-card-discovery-browser.mjs\`, including same-article records, fake approved flags from untrusted feed, repeated imports, localStorage safety.
- Existing intake, Deck Builder, Tagger CI and Master DB guards must continue to pass.
- Production validation after deployment is separate and must be explicitly confirmed.

**Out of scope:** Assisted Play, Proxy Workshop, Master DB record rewrite, historical reprint audit, user reminder modification, and automatic card approval/merge.
