# TCG Lab Toolbelt

Launcher for the Pokémon TCG Toolbelt. **Source of truth:** `public/index.html` (Toolbelt v0.2).

## Linked tools

- [Prerelease Lab](https://prerelease-lab.pages.dev/) — prerelease boxes, free deck editing, transfer to simulator.
- [TCG Lab Simulator](https://prerelease-lab.pages.dev/simulator.html) — Quick Solo, Full Tabletop, Deck Stats, Deep Lab.
- [Card Explorer + Tagger](https://taggerv1.pages.dev/) — card browser and tagging.

Additional cards in the launcher (Match Clock, full Deck Builder, Training Lab, Card DB + Release Tracker) are currently roadmap placeholders, not deployed tools.

## Deploy to the existing Cloudflare Worker

This repository is configured for the **existing** Cloudflare Worker:
https://mute-dust-0d50.forcoin99.workers.dev/

The root `wrangler.jsonc` deliberately names this existing Worker:

```json
{
  "name": "mute-dust-0d50",
  "compatibility_date": "2026-10-26",
  "workers_dev": true,
  "assets": { "directory": "./public" }
}
```

Cloudflare's static assets support serves `public/index.html` at `/`. No separate build step, package install, compiled Worker script, or API key is required.

### One-time Git connection

1. Go to **Cloudflare → Workers & Pages → mute-dust-0d50 → Settings → Builds → Connect**.
2. **Git account:** MckTCG
3. **Repository:** `MckTCG/toolbelt` (not `prerelease-lab`)
4. **Production branch:** `main`
5. **Disable builds:** Off
6. **Build command:** Leave blank
7. **Deploy command:** `npx wrangler deploy`
8. Select **Connect**.
9. If the Worker doesn't immediately redeploy from the initial connection, trigger a subsequent commit on `main` or manually retry the build in Cloudflare.

After successful deployment, future commits to `main` update the existing Toolbelt Worker automatically. Open the Worker URL and confirm the **TCG Lab Simulator** card appears under Linked. The Cloudflare dashboard displays build status or errors.

### Editing

Edit **`public/index.html`**, commit to `main`, then check the Cloudflare deployment. Links customized using "Manage tool links" are stored per browser and can override defaults; use an incognito tab to verify new defaults.

Do **not** connect the existing Toolbelt Worker to `prerelease-lab`; that repository is separately deployed.

This project includes only public-facing launcher content, not private deck data or credentials.

### Cloudflare Git deployment trigger

The first GitHub-connected Cloudflare build is initiated by a new commit after linking the repository. This documentation-only commit intentionally starts that build; future edits to `public/index.html` will deploy through the same connection.
