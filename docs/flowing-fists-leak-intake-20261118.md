# Flowing Fists — provisional leak intake and readable test proxies

**Updated:** 18 November 2026 · **Status:** PR review pending, unconfirmed leaked artwork.

## Deliverables

Eight source-reported Pokémon TCG Flowing Fists card printings are in the one-click Card Intake batch. Four now have individually cropped, locally retained, readable photo images for **low-fidelity test proxies**:

| Leaked printing | Number | Cropped source pixels | Proxy status |
|---|---|---:|---|
| Mega Lucario Z ex SIR | 111/080 | 303 × 426 | Readable photo proxy |
| Mega Garchomp Z ex SIR | reportedly 112/080 | 303 × 426 | Readable photo proxy; number unconfirmed |
| Blastoise IR | 083/080 | 302 × 426 | Readable photo proxy |
| Ninetales IR | 082/080 | 729 × 1018 | Readable photo proxy |
| Kubfu | unknown | — | Intake-only; image missing |
| Hattrem | unknown | — | Intake-only; image missing |
| Wartortle | unknown | — | Intake-only; image missing |
| Weepinbell | unknown | — | Intake-only; image missing |

The four usable images are available as `public/assets/flowing-fists-leaks/cards/*.jpg` and catalogued in `public/assets/flowing-fists-leaks/manifest-v1.json`.

All four are linked into `public/data/temp-catalog-v1.json` as **central TEMP** records in set `TMPFLO`. They are not accepted into the verified English Master DB, do not establish tournament legality, and **do not claim to be official scans**. The `unofficial` text status is a provisional flag, not a claim that these English leaks are fan translations.

## Artwork provenance

- Mega Lucario Z ex 111/080, Mega Garchomp Z ex 112/080: individual crops of the two-card leak photo at <https://darkdex.app/blog/flowing-fists-leak-mega-lucario-z-garchomp-z-secret-rares>.
- Blastoise 083/080: individual crop from the separate Blastoise photograph at that DarkDex article.
- Ninetales 082/080: crop from the Ninetales leaked photograph hosted at <https://www.kantopost.com/pokemon-tcg/flowing-fists-ninetales-leak/> and cross-checked against a Reddit original photo, <https://www.reddit.com/r/PokemonTCG/comments/1xysvit/more_flowing_fists_leaks/>.

Original sources remain in `public/assets/flowing-fists-leaks/source-audit/` with SHA-256 hashes and source URLs. Re-run `python scripts/build-flowing-fists-proxies.py` to rebuild crops. This uses standard Pillow raster scaling only. Output files are 744 × 1040 pixels, corresponding to 63 × 88 mm at approximately 300 pixels per inch, but **intrinsic source detail remains much lower** for the first three.

## User workflow once PR is merged and deployed

1. Go to Card Intake and click **Load Flowing Fists leaks (8)** to inspect the eight staged records. The four proxy-ready entries link to their centrally published TEMP identities.
2. Open **Proxy Workshop → Import cards / decks**; filter to set **TEMP — Flowing Fists** or search by exact card name.
3. Select a printing and quantity 1–4; add to the print queue, then choose Letter (9 per sheet) or Tabloid (18 per sheet).
4. Print at 100% scale, following the Workshop's existing printer settings. The proxy watermark remains available.

If the browser shows a broken image before the branch has been deployed, this is expected: the URLs intentionally point to the production Worker domain and become available only after PR merge and deployment.

## QA gates

- `node scripts/test-flowing-fists-intake.mjs` checks queue import, deduping, count and TEMP links.
- `node scripts/test-flowing-fists-proxy-browser.mjs` checks exact cropped asset identity/dimensions and live browser import/queue behavior using the local asset copies.
- Existing Card Intake, Central TEMP, Proxy Workshop and Tagger CI tests must remain green.

No unverified images are silently substituted for different printings. Additional leaks can be appended as their exact artwork becomes available.

## Original reports

- <https://blog.pokepursuittcg.com/articles/flowing-fists-leaks/>
- <https://darkdex.app/blog/flowing-fists-leak-mega-lucario-z-garchomp-z-secret-rares>
- <https://www.kantopost.com/pokemon-tcg/flowing-fists-ninetales-leak/>
- <https://www.reddit.com/r/PokeCollectors/comments/1xyqj8u/more_flowing_fists_leaks_mega_lucario_z_ex_mega/>
