# Marco Tiongson — portfolio

Source for `https://mbtiongson1.github.io/`: one page, written in first person, around the three systems I'm building now.

1. **Favor Home** — Favor Church's staff homepage on Rock RMS, the front door into the operating system.
2. **Favor Dashboards** — the executive suite as one product: truth, legibility, action, proof.
3. **Gaia** — Research → Registry (Gaia Skill Tree) → Runtime (Skill Heaven).

Earlier work, experiments and small tools sit in a quiet index near the bottom.

## Local preview

Node 22+ builds it; nothing needs installing.

```sh
npm run build              # dist/
npm run check              # hierarchy, voice, links, provenance, publication boundary
npm run check -- --release # adds size budgets and no-provisional-copy gates
npm test                   # focused tests for the page script
python3 -m http.server 8000 --directory dist
```

## Structure

- `src/pages/index.html` — the page, authored directly. `src/pages/404.html` — not-found page.
- `src/styles/site.css`, `src/scripts/site.js` — one stylesheet, one progressive-enhancement script (lens switch, reading-position cues). Everything works without JavaScript.
- `assets/media/{favor,gaia,archive}/` — every raster ships with a `.webp.json` provenance sidecar naming its source and treatment.
- `archive/experimental-worlds/` — the earlier six-world explorations, kept for history and never built.

## Publication boundary

- Favor interfaces appear only as captures of their own fictional-data workbenches, a sanitized homepage capture (every figure invented, personal details removed), or drawn schematics. No production data, real people, credentials, or internal hosts.
- Favor repositories are private, so their PRs are cited as text, not links. Gaia repositories are public and linked.
- `npm run check` enforces these rules; see `scripts/check.mjs`.

## Deployment

`.github/workflows/pages.yml` builds, checks and tests every pull request and push to `main`. It never publishes on push: an operator runs the workflow manually on `main`, which requires `npm run check -- --release` before deploying `dist/` to GitHub Pages.

The GitHub profile README (`mbtiongson1/mbtiongson1`) is a separate doorway that links here.
