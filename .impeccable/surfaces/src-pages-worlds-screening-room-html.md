---
version: 1
slug: "src-pages-worlds-screening-room-html"
primary_target: "src/pages/worlds/screening-room.html"
related_targets: []
---

# Screening Room

Scope: the complete `/worlds/screening-room/` portfolio experience. Mode: **Experience**. Audience: design-focused hiring managers, peers, and collaborators. Job: inspect real archived interfaces, understand their status, and move between them without losing provenance. The working People prototype leads; the actual shared `data/projects.json` archive remains the source of truth. Constraints: preserve the shared shell/catalog, never embed external Gaia sites, keep disclosures beside artifacts, label synthetic/WIP material, support keyboard and mobile use, and offer a semantic no-JavaScript path.

## Direction contract

**THESIS:** A screening room treats each portfolio item as a work-in-progress projection under inspection, not as a case-study card. The working interface—not a laptop mockup or introductory hero—owns the first viewport.

**OWN-WORLD:** Electric midnight holds a crisp off-white display field, with coral, mint, and sunflower registration ticks used as wayfinding rather than metrics. Square, ruled frames and compact Barlow labels make a browser-testing bay; each captured site's own identity remains intact inside the viewing frame.

**STORY:** Visitors can identify the current artifact and its status, inspect the real People dashboard first, then switch among the shared six-project archive. Local demos open safely, stills disclose what they show, and Gaia entries use verified live links without external embeds.

**FIRST VIEWPORT:** At desktop widths, a slim named filmstrip and oversized three-line identity lockup—Marcus / Rafael / B. Tiongson—sit left of a live People interface filling the broad screening bay. The screen's actual project title, local-interactive status, fictional-data disclosure, and open-project action remain legible at the frame edge. On phones, the filmstrip becomes a horizontal, keyboard-scrollable index above a full-width artifact; no desktop canvas is scaled down. At 380px and below, the adjacent descriptor moves under the lockup so “B. Tiongson” retains its deliberate full-width line.

**FORM:** Interface critique room / browser-testing bay, pinned by this assignment. The approved first-viewport reference is `.impeccable/mocks/decision/model-pick.webp`; use its structure and material only, replacing any unverified or invented screen content with the authentic local artifact. Catalog facts and status come from `data/projects.json`. No direction roll was needed; seed key: not applicable to this brief-pinned direction.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish record — self-review (2026-09-24)

**Implementation verdict:** Route implementation, route-local design documentation, and code-level checks are ready for the orchestrator's visible PR review. No visual pass is claimed.

**Impeccable build evidence:** The approved development reference `.impeccable/mocks/decision/model-pick.webp` was measured at 1536×1024. The spec gate closed with 18 regions, 7 text regions, and 0 plates; the plates gate closed with no plates owed. The hero phase remains open, subsequent sections/motion/responsive/review phases remain pending, and no finish verdict is recorded. The supplied comp depicts a generated fictional church-management dashboard with `301 / 301`, `9 UNLED GROUPS`, and `THE CONNECT FIELD` labels/figures absent from the authentic local People demo, plus a Gaia Research thumbnail absent from the catalog; those pixels are not accepted as portfolio evidence. This route uses the authentic local People, compiled dashboard and keeps Gaia Research link-only, as required by the catalog and provenance. No screenshot, plate, or gate was fabricated or forced. The shared Ego Browser TaskSpace is reserved for the orchestrator's visible review, so desktop/mobile screenshot review remains outstanding.

**Self-review evidence:** `npm run build`, `npm run check`, `node --check src/scripts/screening-room.js`, and `git diff --check` pass. Corrected focused assertions pass for the exact visible owner name `Marcus Rafael B. Tiongson`, all six server-rendered catalog sections and anchor links, the sandboxed People demo, external-link-only Gaia Research state, route-local v2 design sidecar, visible `:focus-visible`, reduced-motion CSS, and 44px-minimum actions. A DOM harness passes catalog count, button selection, ArrowRight/Home/End keyboard movement and focus, Gaia link-only behavior, and Gaia Skill Tree static-media/live-link behavior. Manual WCAG contrast calculations pass at 4.5:1 or better for primary text on dark panels, accent labels and the focus ring on midnight, and dark text on the coral/sunflower bands. Local static-server requests for the route, CSS, JS, shared catalog, and People demo return HTTP 200 at `http://127.0.0.1:55415/worlds/screening-room/`. No new raster was shipped; project media remains catalog/provenance-backed.

**Review limitation for orchestrator:** Capture and inspect desktop and phone views, confirm the live People iframe and mobile filmstrip visually, then record the visible review verdict. The build-phase hero and later gates are intentionally not represented as closed.
