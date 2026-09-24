---
version: 1
slug: "src-pages-worlds-dada-contact-sheet-html"
primary_target: "src/pages/worlds/dada-contact-sheet.html"
related_targets: []
---

# Dada Contact Sheet

Scope: `/worlds/dada-contact-sheet/` — a complete, responsive portfolio experience over the shared reviewed project archive. Mode: Experience.

Audience: design-focused hiring managers, collaborators, and peers. Job: quickly recognize the work, then inspect a real artifact without mistaking a prototype or static capture for a live system. Primary action: choose a named project and open its real artifact or verified public site. Proof: records from `data/projects.json`, including the compiled fictional-data dashboard, WIP and sample-data watershed imagery, static AutoMerge capture, reviewed Gaia Skill Tree artwork, and Gaia Research as a link only. Constraints: keep each artifact intact and legible; retain adjacent catalog disclosures; never invent metrics, evidence, or previews; preserve named links without JavaScript; repack the composition on mobile.

## Direction contract

THESIS: A contact sheet is an index you can handle: selecting one paper scrap promotes a complete, readable project into a stable reading position. Refuse a generic screenshot grid and collage that damages the work.

OWN-WORLD: A controlled Merz collage built from clean newsprint, ticket-stock labels, scarlet and cobalt registration ink, hard black, and exact printer rules. Draw all paper cuts and registration geometry with CSS/HTML. Use only self-hosted repository fonts and catalog/provenance-backed project media; never add remote fonts or copy, crop, or trace comp pixels into published files.

STORY: The visitor scans a clearly named archive, selects a scrap, inspects its full artifact with its real alt text, caption, disclosure, and opening link, then returns to choose another. External-only records stay honest link-only entries.

FIRST VIEWPORT: Match the supplied landscape comp's decisive diagonal: large identity and numbered work index occupy the left paper strip; one dominant, square-edged, intact artifact occupies the center/right; small registration marks and concise side labels anchor the perimeter. Keep index, featured title, disclosure, and artifact-opening action visible at the first view. At narrow widths, reflow into a calm vertical contact sheet and reading plate without scaling or overlap.

FORM: Dada / Merz contact sheet, pinned by the task-specific direction and already approved comp; FORM position 1 by assignment, no new decision board or roll. Catalog source: `data/projects.json`, with `{{PROJECT_INDEX}}`, `{{PROJECT_LEAD}}`, `{{PROJECT_REST}}`, and `{{WORLD_NAV}}` as useful static fallbacks. Approved first-viewport contract: `.impeccable/mocks/decision/challenger-collage.webp` and adjacent prompt sidecar. No seed key was issued because the brief pins the direction and explicitly prohibits a second board.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish record

Implemented the route from the actual shared catalog. The visible selector enhances server-rendered project anchors into named scrap controls; selection updates the intact artifact, disclosure, caption, direct link, URL fragment, Back/Forward state, and `aria-pressed` state. The genuine People, compiled HTML is kept in its restricted sandbox; media records retain natural proportions; Gaia Research remains link-only. All added collage material is CSS/HTML geometry and all fonts resolve to repository-owned self-hosted files. No new raster assets were made or shipped. The comp grid and font-match proof are ignored development-only files under `.impeccable/review/`; no region crop or comp-derived plate was created.

Self-review and evidence:
- `npm run build`, `npm run check`, `node --check src/scripts/dada-contact-sheet.js`, `git diff --check`, `/tmp/dada-contact-sheet-history-test.mjs`, and `impeccable embed-prompt --scan assets/media assets/demos` pass (7 rasters, 0 missing provenance).
- The local harness verifies missing/invalid-fragment fallback, Back/Forward selection, matching `aria-pressed`, server-rendered no-JavaScript archive links, no generated-comp copy or remote font URLs, a focusable `main#main` skip destination, visible focus, 44px target token, and reduced-motion overrides. Key contrast pairs pass: scarlet-ink/newsprint 5.22:1, cobalt/newsprint 5.89:1, print-white/scarlet 5.15:1, and paper-white/ink 15.66:1; bright scarlet on paper is reserved for large type (3.65:1).
- The generated route and its CSS/JS return HTTP 200 at `http://127.0.0.1:8000/worlds/dada-contact-sheet/`.
- Route-local `docs/worlds/dada-contact-sheet/DESIGN.md` and `design.json` document the built system.

Gate limitation: the approved comp's featured “Connect Field” dashboard pixels and labels do not match owner-approved catalog evidence. The real `People, compiled` project is an interactive HTML document, not a source screenshot plate. The measured spec phase is closed (24 regions); the plates phase is intentionally left open and hero/visual fidelity is not claimed. No comp pixel was copied, cropped, traced, or used to generate a shipping asset. Shared project media remains governed by its existing provenance sidecars.

Desktop/mobile visual review is deferred to the orchestrator after merge; no separate Ego Browser TaskSpace was created or taken over. Unresolved product decisions: none; the evidence conflict and open build gate are documented above.
