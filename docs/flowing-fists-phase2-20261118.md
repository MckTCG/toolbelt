# Flowing Fists leaks — Phase 2 provisional photo integration (2026-11-18)

This is a continuation of PR #27, **not** a new database. It builds on central TEMP set \`TMPFLO\` and keeps the four already published printings and their stable IDs untouched.

## Records & scope

**18 photographed provisional printings** in central TEMP after Phase 2: the four originals plus fourteen additional image-backed printings. Each distinct photographed collector number has its own TEMP printing identity so artwork can be replaced later without changing its ID.

| New Phase 2 printing | Number as shown/reported | Artwork source | Native cropped resolution |
|---|---|---|---|
| Hawlucha IR | 087/080 | Pika-collect standalone leak | 728 × 1011 |
| Mega Lucario Z ex UR | 097/080 | Pika-collect standalone leak | 723 × 1018 |
| Regigigas IR | 091/080 | Reddit six-card group | 374 × 546 |
| Mega Absol Z ex UR | 094/080 | Reddit leaked-card overview | 187 × 262 |
| Mega Absol Z ex SIR | 110/080 | Reddit leaked-card overview (very blurry) | 189 × 263 |
| Korrina's Seriousness UR | 103/080 | Reddit leaked-card overview | 190 × 263 |
| Korrina's Seriousness SIR | 113/080 | Reddit leaked-card overview (very blurry) | 201 × 266 |
| Mega Glimmora ex | 055/080 | Reddit leaked-card overview | 184 × 264 |
| Mega Tatsugiri ex | 022/080 | Reddit leaked-card overview; authenticity uncertain | 190 × 263 |
| Sigilyph ex | 032/080 | Reddit leaked-card overview | 191 × 265 |
| Riolu | 045/080 | Reddit leaked-card overview | 187 × 264 |
| Mega Lucario Z ex regular | 058/080 | Reddit leaked-card overview | 186 × 265 |
| Togedemaru ex | 060/080 | Reddit leaked-card overview | 188 × 266 |
| Mega Lucario Z ex gold (language uncertain) | 115/080 | Reddit leaked-card overview | 199 × 261 |

**Important:** These are *unverified community photographs*, not official card previews. The collector numbers and names are provisional interpretations of the photographed cards, and all may be corrected later. The gold Lucario appears to use non-English text and is marked \`other\` language. Apparent Mega Tatsugiri ex and other unusual cards must not be treated as genuine until independently confirmed. Some images may be fan-made or mockups. Every record has \`status=provisional\`, \`reviewState=accepted-temp\` and empty unverified English gameplay text.

The separate additional source reports for **Buizel IR, Glimmet IR, Persian, Hatterene and Tatsugiri** remain in *Card Intake only*: no exact usable photo was recovered in this pass. Do not confuse an old Buizel Pokémon TCG Pocket illustration with the reported Flowing Fists printing. Existing Kubfu, Wartortle, Hattrem and Weepinbell reports remain intake-only too.

## Asset provenance & replacement

- Existing images: \`public/assets/flowing-fists-leaks/cards/\` (original four unchanged).
- New source photographs: \`public/assets/flowing-fists-leaks/phase2-source/\` with source URLs, dimensions and SHA-256 hashes in \`audit.json\`.
- Reproducible new crops: \`scripts/build-flowing-fists-phase2.py\`.
- Manifest: \`public/assets/flowing-fists-leaks/manifest-v1.json\`, with each crop's own digest, parent source, crop rectangle, source pixel dimensions and quality warning.
- Output is 744×1040 px; enlarging a 190×263 image does not produce readable new detail. The photos are accepted only for low-fidelity tests.
- To replace a low-quality photo, keep the TEMP \`id\` and set/number identification stable; update the image file, its manifest and source provenance, and run tests. Do not silently replace with a different printing.

No personal tags, drafts or deck data are copied. Standard Master DB and Assisted Play remain untouched.

## User-facing use

Once merged and deployed:

1. **Card Explorer / Deck Builder**: set \`TEMP — Flowing Fists\`, select the card's exact number/printing.
2. **Manual Simulator**: use Deck Builder's existing handoff with selected TEMP images. No effects have been automated.
3. **Proxy Workshop**: Import cards → set \`TEMP — Flowing Fists\` → choose printing by its number → add copies to the existing print queue → select Letter (9 per sheet) or Tabloid (18 per sheet). Preserve PROXY watermark and print calibration.
4. **Card Intake**: \`Load Flowing Fists leaks (27)\` stages all candidates (18 already linked to TEMP + 9 image-free reports) without overwriting verified entries.

## QA

- \`node scripts/test-central-temp.mjs\`: preserves schema, uniqueness, central/private storage separation and safe publishing.
- \`node scripts/test-flowing-fists-intake.mjs\`: checks complete intake, multi-select and no duplicates.
- \`node scripts/test-flowing-fists-proxy-browser.mjs\`: checks actual local image dimensions, SHA-256, exact printing identity, mixed variants and print pagination in Chromium.
- Existing Card DB, Deck Builder, Tagger, and Proxy Workshop CI must remain green.
- Verify Cloudflare production only *after* a successful PR merge; passing CI is not a deployment check.

## Sources to revisit

- https://pika-collect.fr/actualites/leak-me07-flowing-fists-mega-lucario-z-ex
- https://www.reddit.com/r/PokeInvesting/comments/1xz307a/leaked_cards_from_flowing_fists/
- https://www.reddit.com/r/PokemonTCG/comments/1xz9fgy/flowing_fists_leaked_cards_so_far/
- https://www.reddit.com/r/PokemonTCG/comments/1xysvit/more_flowing_fists_leaks/
- https://www.pokebeach.com/
- https://pokemonproxies.com/

**Do not modify the existing 3:55 AM ChatGPT reminder as part of this PR.**
