# Portfolio worlds: active and retained

The public portfolio has one visual experience: **Screening Room**. It is built at `/` from `src/pages/worlds/screening-room.html`; the filename preserves the route seam from the earlier six-world project. There is no public `/worlds/<slug>/` switcher.

`data/worlds.json` retains the six decisions. `screening-room` has status `home`; the other five have status `disabled`. Disabled HTML, CSS, JavaScript, Impeccable briefs, and documentation remain in the repository for future reuse, but the builder does not link them, copy their styles/scripts, or emit their routes. Hiding is not deletion.

| Retained direction | Source page | Status in build |
| --- | --- | --- |
| Screening Room | `src/pages/worlds/screening-room.html` | `home` → `/` |
| Field Atlas | `src/pages/field-atlas.html` | disabled; source retained |
| Arcade Marquee | `src/pages/worlds/arcade-marquee.html` | disabled; source retained |
| Dada Contact Sheet | `src/pages/worlds/dada-contact-sheet.html` | disabled; source retained |
| VU Meter Bridge | `src/pages/worlds/vu-meter-bridge.html` | disabled; source retained |
| Classic Index | `src/pages/worlds/classic-index.html` | disabled; source retained |

The project reel is data-driven from `data/projects.json`; it is not another world selector. `scripts/build.mjs` emits static semantic content at the root, copies only active Screening Room and case-study code, and writes the dedicated `/work/gaia-skill-tree/` flagship route. The client script enhances server-rendered project records into a keyboard-operable filmstrip. It does not fetch remote product data.

For project additions and publication requirements, see [add-a-project.md](add-a-project.md).
