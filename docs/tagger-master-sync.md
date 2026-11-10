# Tagger V1 → Toolbelt Master Card DB synchronization

## Root cause
The standalone Cloudflare Pages Tagger at https://taggerv1.pages.dev/ was deployed from an October 2026 ZIP containing an embedded August 31, 2026 `tcg-lab-catalog-v2` snapshot (2,036 gameplay records; 3,345 printings). It did not fetch the Toolbelt Master DB; therefore Delta Reign never appeared there.

## Authority and transport
The authoritative catalogue continues to be the `<script id="catalog" type="application/json">` element in `public/card-db.html` on the existing Toolbelt Worker. Both the Deck Builder and the updated standalone Tagger retrieve this exact data source. No additional card-set import or competing catalogue is necessary.

Tagger requests:
`https://mute-dust-0d50.forcoin99.workers.dev/card-db.html`

The new `public/_headers` allows read-only cross-origin requests. It does not enable cross-site access to personal tags; those stay in Tagger's localStorage under its unchanged key `tcg-lab-pbl-tagger-v1`.

## Tagger direct-upload package (distributed separately)
- `index.html`: existing Tagger UI with minimal changes; the old embedded snapshot remains as first-visit offline fallback.
- `catalog-sync.js`: validates and installs the latest Master DB catalogue, updates all indexes and filters, uses version checking, and stores the latest good catalogue in IndexedDB for offline reuse.
- `README.txt`: backup and release steps.

### Deploy in this order
1. Back up Tagger tags using **Data & Backups → Export complete backup** on the *current* `taggerv1.pages.dev` site. Keep the JSON.
2. Merge/deploy this Toolbelt CORS change to the Worker. Verify `Access-Control-Allow-Origin: *` on the **live** `/card-db.html` response. Note that GitHub merge is not itself proof of Worker deployment.
3. Upload the provided Tagger ZIP as a new deployment to the **same Cloudflare Pages project and hostname**. Do not create a second Pages project.
4. Open Tagger, verify the status says **Master DB synced · DLR 141/141**, select expansion **Delta Reign (DLR)**, toggle **All printings**, and confirm **141 printings**.
5. Search **Mega Rayquaza ex** and select DLR #84 / #138 / #141. Confirm three distinct artworks and no broken images.
6. Check pre-existing tags and review decisions. If missing, import the saved JSON backup and recheck.
7. For offline validation, visit once while online, then disconnect and reload Tagger: status should indicate the cached Master DB and retain DLR.
8. If anything fails, roll back to the previous Cloudflare Pages deployment and/or re-import the tag backup.

### Automated checks
`node scripts/test-tagger-master-access.mjs` verifies all 141 numbered DLR printings, unique IDs, all 141 local artwork files and the CORS response configuration. This runs in GitHub Actions during pull requests.

### Limitations
- Before first online sync, the embedded fallback is the older August snapshot; **Delta Reign will not appear until the first successful Master DB sync**.
- Master DB sync does **not** synchronize users' private tag edits across browsers or domains; those remain local.
- Offline cache is stored in IndexedDB, not localStorage, to avoid a multi-megabyte catalogue exhausting the same quota as user tags.
- The Tagger package depends on the current Worker hostname; update the constant `MASTER_DB_URL` if that endpoint changes.
- This work verifies integration and local artwork mappings. It is not a new independent card-by-card text/artwork correctness audit.
