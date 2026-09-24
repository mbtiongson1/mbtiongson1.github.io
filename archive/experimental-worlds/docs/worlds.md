# World route seams

The URL `/worlds/<slug>/` is **generated output**, not the editable source directory. `npm run build` reads each source page below, replaces its `{{...}}` catalog/navigation tokens, copies `src/styles/` and `src/scripts/`, and writes `dist/worlds/<slug>/index.html`. Every route already has an honest, buildable placeholder file. A worker owns its page and may add its own CSS/JS files; **no change to the shared build script is required**.

| Public route | Edit this source page | Add own styling / optional enhancement |
| --- | --- | --- |
| `/worlds/field-atlas/` | `src/pages/field-atlas.html` | `src/styles/field-atlas.css`, `src/scripts/field-atlas.js` |
| `/worlds/screening-room/` | `src/pages/worlds/screening-room.html` | `src/styles/screening-room.css`, `src/scripts/screening-room.js` |
| `/worlds/arcade-marquee/` | `src/pages/worlds/arcade-marquee.html` | `src/styles/arcade-marquee.css`, `src/scripts/arcade-marquee.js` |
| `/worlds/dada-contact-sheet/` | `src/pages/worlds/dada-contact-sheet.html` | `src/styles/dada-contact-sheet.css`, `src/scripts/dada-contact-sheet.js` |
| `/worlds/vu-meter-bridge/` | `src/pages/worlds/vu-meter-bridge.html` | `src/styles/vu-meter-bridge.css`, `src/scripts/vu-meter-bridge.js` |
| `/worlds/classic-index/` | `src/pages/worlds/classic-index.html` | `src/styles/classic-index.css`, `src/scripts/classic-index.js` |

All six final slugs are marked live in `data/worlds.json` because the full release waits for the five independent world PRs; the placeholders are temporary on this foundation branch, not the published destination. `npm run check -- --release` rejects the remaining placeholder text, and the manual Pages deployment on `main` invokes this release gate. In a new page, link its own `/styles/<slug>.css` and optional `/scripts/<slug>.js` in the HTML. `scripts/build.mjs` copies the whole `src/styles` and `src/scripts` directories and picks up the page file by slug. It also injects `{{WORLD_NAV}}` as a six-way menu and shared project tokens documented in `docs/add-a-project.md`. Keep a no-JavaScript named path to every project; a world can use `{{PROJECT_INDEX}}` and `{{PROJECT_REST}}` as fallback semantic content while its JS creates its distinctive interactive layer from `/data/projects.json`. Never hardcode project copy or add visual tokens to another world's stylesheet.

The lobby source is `src/pages/hub.html` and its route is `/`; do not replace its typography or topology to make an incoming world. Each world owns its independent form, while `data/projects.json` owns the shared facts. Before a PR, run `npm run build && npm run check`; visit its generated route and verify the six-way links and disclosures.
