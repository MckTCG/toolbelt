# TCG Lab Toolbelt — Phase 3: JP-only TEMP + central catalogue

**Branch / pull request:** \`feature/card-intake-temp-bridge-20261110\` / PR #25. **Review before merge.** The existing English Master DB, Tagger, Assisted Play automation, and original Proxy Workshop UI remain separate.

## Architecture decision: centrally published TEMP, local drafts

The shared TEMP catalogue is now **\`public/data/temp-catalog-v1.json\`** with schema \`tcg-lab-central-temp-v1\`. It is a versioned, public repository file deployed as part of Toolbelt. It stores only reviewed provisional card/set details, including original Japanese names and artwork references, optional unofficial translations, provenance, and revision history.

The browser-local \`tcg-lab-card-db-v0.1\` store remains for **playtest drafts, personal tags, private notes, old TEMP cards, and offline working copies**. It is NOT the authority for centrally shared TEMP cards. No existing local data is deleted or silently uploaded.

**Important limitation:** Toolbelt currently runs as static Cloudflare assets, without an authenticated server-side write API. Therefore clicking **Accept TEMP draft** creates a playable local draft immediately; it **does not upload** the card centrally. To share a card across devices, the user exports a central TEMP proposal, runs a reviewed GitHub publication, and merges/deploys that PR. Calling the local action “centrally published” would be misleading. Fully authenticated one-click publication would require a separately reviewed backend/Auth implementation later.

## JP-only playability and three independent gates

- **Manual Simulator:** a valid TEMP name and category are sufficient to represent a card manually, even when every rule is in Japanese. The Deck Builder can transfer the card's image and a 40/60-card practice deck into the unchanged standalone Manual Simulator. Assisted Play is not involved.
- **Proxy Workshop:** a name and HTTPS source artwork allow selection and print-queue integration. The existing printing interface is untouched; image quality and rights are not certified by TEMP acceptance.
- **English verified Master DB:** publishing requires the existing stricter English, source, printing, and approval checks. TEMP never confers tournament legality.

## Browser workflow

1. Open Card Intake, click **Check new reveals** and select a card. Enter a name (Japanese is fine) and category; keep its original artwork if available.
2. Click **Accept TEMP draft**. The record enters the existing local TEMP overlay and can immediately be selected in the Deck Builder, Manual Simulator handoff, and Proxy Workshop *in this browser*. The UI explicitly labels it “not yet published.”
3. Once reviewed for shared use, click **Export central TEMP proposal**. This creates \`TCG_Lab_Central_TEMP_Proposal.json\` containing accepted TEMP metadata and revision history, **not personal tags, rejected-tag decisions, personal notes, or deck drafts**.
4. In a Git checkout of \`MckTCG/toolbelt\`, create a new branch and run:

   \`\`\`bash
   node scripts/publish-central-temp.mjs --proposal TCG_Lab_Central_TEMP_Proposal.json
   # inspect dry-run changes and rejected conflicts
   node scripts/publish-central-temp.mjs --proposal TCG_Lab_Central_TEMP_Proposal.json --apply
   git diff -- public/data/temp-catalog-v1.json
   \`\`\`

5. Open a GitHub PR and merge after explicit user approval. Once Cloudflare deploys the file, the same centrally published TEMP card becomes available across devices and tools.

To publish corrections to an **existing** central TEMP ID, the CLI must be given \`--allow-updates\` after human review. Without it, conflicting updates are rejected and nothing is written.

## Tools that read the central file

- **Card Explorer:** reads the central catalogue after initial load, registers published TEMP cards into its in-memory explorer, and leaves browser \`localStorage\` untouched.
- **Deck Builder:** merges the central published collection with personal local draft cards, using central identities as authoritative. The Manual Simulator deck payload keeps original image and stable TEMP identity; no English wording is required.
- **Proxy Workshop:** the existing importer reads the same shared and local records without changing the print layout or controls.
- **Card Intake:** distinguishes “Shared TEMP published” from “TEMP draft saved locally,” and lets the user review incoming source revisions before accepting anything.

If the central file cannot be fetched, existing local drafts and manual functionality remain accessible where possible; the UI should not suggest central publication succeeded.

## Data and safety boundaries

- The public central catalogue contains **no authentication token, browser-local tags, private notes or personal deck data**.
- A proposal cannot be published from an unauthenticated browser action; a reviewed GitHub PR is the publication gate. The publisher uses **dry-run by default**, validates schema, set references, unique stable IDs, duplicate printings, and HTTPS sources, and applies a proposal **atomically** only if all records pass.
- Language status is separate from official legality. \`jp-only\`, \`unofficial\`, and \`official\` indicate translation provenance, not eligibility.
- Existing TMP M6 archive is explicitly excluded. Existing locally managed M7/Aura Seeker records are **not silently imported centrally**. They can be migrated through reviewed proposals while preserving stable IDs, with set-code collision review.
- A card's first local acceptance may happen within minutes of a reveal, but **cross-device sharing begins only after the reviewed publication deploys**.
- Controlled *local artwork storage* is a future step. The currently stored HTTPS artwork references are not guaranteed printable and do not imply permission to republish.

## Source rechecking

The source-discovery GitHub Actions workflow is proposed to run **six times daily, every four hours**, with deeper passes once daily. It follows recent (first 72 hours) PokéBeach sources and revisits older articles with upcoming releases when known. The workflow also reads **centrally published TEMP sources** from the repository to refresh its watchlist.

Updates are staged as unverified discoveries, never applied automatically to central TEMP or English Master records. The browser's Card Intake detects potential differences and requires the user to confirm them. Local-only drafts not represented in the discovery feed still cannot be monitored by a server with no access to private browser data.

The existing 3:55 AM ChatGPT Pokémon TCG reveal reminder is unchanged.

## QA and release gates

- \`node scripts/test-temp-intake.mjs\` — local JP-only acceptance and existing handoffs.
- \`node scripts/test-central-temp.mjs\` — safe public proposals, no private data, dry-run and reviewed update publisher, duplicate rejection.
- \`node scripts/test-central-temp-browser.mjs\` — shared JP-only card visible on a fresh browser across Card Explorer, Deck Builder, Proxy importer and Card Intake, without altering private storage.
- \`node scripts/test-temp-intake-browser.mjs\` — local draft accepted/updated with explicit translation approval.
- \`python3 scripts/test-card-discovery.py\` — article parsing and follow-up schedule regression.
- Existing Card DB, Tagger, Proxy Workshop and Discovery CI remain required.

**Do not merge PR #25 until all checks pass and the user approves.** After merge, verify the actual Cloudflare central JSON deployment; a CI success alone does not prove a record was published.
