# Marcus Rafael B. Tiongson — Portfolio

A web-design-focused portfolio at `https://mbtiongson1.github.io/`: six independently art-directed ways into one growing, reviewed project archive. This branch builds the root world-selection lobby and the complete Field Atlas route; the other five routes currently use honest fallback pages in this PR and are supplied by separate PRs before the site is published.

## Local preview

Requires Node 22+ for the build and Python 3 for the optional local server. No npm install, backend, secret, or external service is needed.

```sh
npm run build
npm run check
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`, `http://localhost:8000/worlds/field-atlas/`, and the compiled artifact at `http://localhost:8000/assets/demos/people-compiled/favor-people-compiled.html`. If port 8000 is occupied, choose another port. The project index and all project sections are generated in the HTML, so they still work with JavaScript disabled. Portfolio JavaScript only updates the active chart/index state. In the compiled demo, the chart-view cycler changes the selected mode and URL; campus links only rewrite the URL and **do not filter the embedded dataset**. No CSV-export behavior is claimed here because it was not verified. The demo makes no remote data requests.

## Structure

- `data/projects.json` — one record per reviewed project; `data/asset-provenance.json` names each original source file.
- `data/worlds.json` — six final live route slugs and display names. The five other routes have temporary, honest source placeholders in this PR, replaced in their own world PRs before deployment. `docs/worlds.md` maps each route to its isolated page/CSS/JS seam.
- `src/pages/`, `src/styles/`, `src/scripts/` — page templates and independent visual treatments. `scripts/build.mjs` renders static `dist/` from those sources and copies `assets/`; incoming world agents edit their own source files without modifying it.
- `assets/demos/people-compiled/` — **only** the owner-provided compiled fictional-data HTML, CSS, four local fonts, and two textures. This is an interactive prototype, not a live Rock connection.
- `assets/media/` — optimized, disclosed visual samples, including the owner-provided, metric-free Gaia Skill Tree Open Graph illustration. Image provenance sidecars stay beside WebP files; Gaia Research remains link-only because its hero image has unverified metrics.
- `docs/add-a-project.md` — record schema, safety review, media rules, and integration contract for every world.

## Deployment and publication

`.github/workflows/pages.yml` builds and checks on pull requests and pushes to `main`; it does **not** publish on push. After the five other world PRs replace their fallback routes and the central desktop/mobile review is complete, an operator can manually run the workflow on `main`. That run requires `npm run check -- --release` to pass (no placeholder routes) before uploading and deploying `dist/` through GitHub Pages Actions. Set the repository Pages source to **GitHub Actions**. The GitHub personal-profile README is a separate repository, outside this branch's write boundary; after the Pages deployment is verified, link `https://mbtiongson1.github.io/` from that profile.

## Publishing safeguards

Every visible prototype is clearly identified at the point of viewing. Never copy the gitignored `out/evidence` harness, live Rock variants, source/app code, production data, `.blend` files, or private contact material. The static AutoMerge capture is **not** evidence of a live connection; the Steward-adjacent sample image is **not** its control-plane UI. No client outcomes, metrics, or connected behavior are claimed by this portfolio. The development-only `.impeccable/mocks/decision/` comps are not shipped.
