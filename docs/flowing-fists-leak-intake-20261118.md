# Flowing Fists leak intake — 18 November 2026

## Current scope
Seven **source-reported, not officially confirmed** English printings are staged in `public/data/flowing-fists-leak-intake-20261118.json`. This is an intake queue, **not** the verified English Master DB and **not** a centrally published TEMP set.

| Reported card | Collector number | Intake status | Proxy status |
|---|---|---|---|
| Mega Lucario Z ex SIR | 111/080 | Provisional | Blocked: no verified card-sized artwork |
| Mega Garchomp Z ex SIR | reportedly 112/080 | Provisional; number needs confirmation | Blocked |
| Blastoise IR | 083/080 | Provisional | Blocked |
| Kubfu | Unknown | Reported early pack pull | Blocked |
| Hattrem | Unknown | Reported early pack pull | Blocked |
| Wartortle | Unknown | Reported early pack pull | Blocked |
| Weepinbell | Unknown | Reported early pack pull | Blocked |

Sources:
- https://blog.pokepursuittcg.com/articles/flowing-fists-leaks/
- https://darkdex.app/blog/flowing-fists-leak-mega-lucario-z-garchomp-z-secret-rares
- https://www.videospokemongo.com/856791/new-pokemon-tcg-lucario-set-leaks-in-stores-months-before-official-release/

## Image audit
A GitHub-hosted source audit successfully fetched all three article pages and inspected image dimensions:
- PokePursuit article OG hero: **1200 × 630** PNG; **not an isolated card image**
- DarkDex Lucario/Garchomp composite: **1000 × 470** WEBP; **two cards in one image**
- DarkDex Blastoise article composite: **1000 × 470** WEBP; **not an isolated card image**
- Other article illustrations: landscape editorial images

These are **not print-ready individual card scans**. Do not substitute the regular Japanese/English printings for the leaked alternate arts and label them as those printings. Do not treat an article image or a low-resolution composite as a validated proxy asset.

## How to use
On the feature-branch preview, click **Load Flowing Fists leaks (7)** in Card Intake. It stages the seven candidates into the browser's queue, deduping by discovery ID; it does not auto-accept. You may inspect and select them using checkboxes. Since the images are missing, accepting into local TEMP would make them **manual playtesting drafts only**, not printable proxies.

After independent artwork verification, update each candidate's `image_url`, set `artwork_verified` only following actual image QA, and prefer controlled local artwork. Then accept reviewed records into TEMP, export the central TEMP proposal, publish via reviewed PR, and confirm each card's exact art/size in Proxy Workshop.

## Out of scope until evidence is stronger
Uncorroborated claims about Ninetales, Hawlucha, Regigigas and alternate Mega Absol/Glimmora rarities are not automatically inserted as distinct Flowing Fists printings. Official Japanese Aura Seeker printings are a different set and should retain their own set/printing IDs.
