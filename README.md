# mbtiongson1 — Portfolio

A portfolio by Marcus Rafael B. Tiongson at **[mbtiongson1.github.io](https://mbtiongson1.github.io/)**. Screening Room is the single public experience: the Gaia Skill Tree flagship, Gaia Research, Skill Heaven, interactive dashboards, agent infrastructure, applied ML, and visual studies all live in one evidence-backed project reel.

The other five portfolio-world experiments remain in the repository as source, but are disabled from the published build. They are not alternate public destinations.

## Local preview

Requires Node 22+ and Python 3 for the optional static server. There are no install steps, backend, credentials, or live service connection.

```sh
npm run build
npm run check
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`, the full case study at `http://localhost:8000/work/gaia-skill-tree/`, and the local Connect Health demo at `http://localhost:8000/assets/demos/connect-health/`. The main project index and fallback project sections are server-rendered; they remain readable when JavaScript is disabled. The feature explainers run locally. External Gaia projects open at their public sites; they are not embedded.

## Structure

- `data/projects.json` — reviewed project records, contribution notes, public links, demos, media, and adjacent disclosures.
- `data/worlds.json` — one `home` experience and five disabled-but-retained visual directions.
- `src/pages/worlds/screening-room.html` — the public root page's source template.
- `src/pages/work/gaia-skill-tree.html` — full flagship case study.
- `src/styles/` and `src/scripts/` — Screening Room and case-study assets. Disabled world source files remain in the repository but are not copied into `dist/`.
- `assets/demos/connect-health/` — offline, interactive Connect Health prototype; fictional sample only, locally bundled fonts, no network requests or Rock URLs.
- `assets/demos/people-compiled/` — older, self-contained fictional-data prototype; intentionally secondary in the reel.
- `assets/media/` — disclosed images with adjacent provenance sidecars. The Gaia Skill Tree asset is Open Graph artwork, not a live interface screenshot.
- `docs/add-a-project.md` — project-record, evidence, disclosure, and publication rules.

## Checks and publishing

```sh
npm run build
npm run check
npm run check -- --release
```

The Pages workflow checks pull requests and main pushes but only deploys on manual `workflow_dispatch`. The release check requires the flagship case study, local interactive dashboard, complete project disclosures, preserved-but-disabled world sources, and a clean publication boundary before deployment.

## Publication boundaries

- Dashboard fixtures are local and fictional. The Connect Health demo never reads or writes Rock and never makes a network request.
- No Gaia site is embedded or proxied; links point to the actual public product or repository.
- AutoMerge is a static prototype capture. Watershed items are WIP/sample-data visuals, not geographic or operational evidence.
- No live system credentials, production data, private Rock variants, `.blend` files, generated decision comps, or unsupported claims are shipped.
