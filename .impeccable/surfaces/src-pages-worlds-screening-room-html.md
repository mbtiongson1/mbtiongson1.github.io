---
version: 1
slug: "src-pages-worlds-screening-room-html"
primary_target: "src/pages/worlds/screening-room.html"
related_targets: ["src/pages/work/gaia-skill-tree.html"]
---

# Screening Room portfolio

Scope: the complete public portfolio at `/`, built from `src/pages/worlds/screening-room.html`, plus the `/work/gaia-skill-tree/` flagship case study. Mode: **Experience**. Audience: collaborators, hiring teams, researchers, and peers arriving from the public profile. Job: understand what Marcus built, inspect the flagship and local interactive artifacts, and follow public product/source links. The owner-pinned visual direction is the existing Screening Room; the other five worlds stay disabled but their source remains in the repository.

Content and constraints: Gaia Skill Tree leads; the project reel also covers Gaia Research, Skill Heaven, Connect Health, Rock MCP, macdash, Fuel ABEMIS, and secondary interface/visual studies. Use the owner-authored Gaia origin statement and the role credited in the public source README. Dashboard demos use only local fictional data, load local fonts, and visibly say they are not connected to Rock. Never embed external Gaia sites or connect to production systems. Keep every sample/WIP/static boundary adjacent; do not invent metrics or claim sole authorship for collaborative projects. Keyboard, mobile, reduced-motion, and no-JavaScript paths remain usable.

## Direction contract

**THESIS:** Screening Room is the portfolio itself, not one of six browsing skins. The selected artifact, what Marcus built, and why it exists lead; the work is the reason to enter the room.

**OWN-WORLD:** Keep the chosen electric-midnight Screening Room system: Barlow and Barlow Condensed, off-white display fields, coral/mint/sunflower signals, square ruled frames, and a calm scanline of project labels. Dashboard artifacts retain their own Favor fonts and visual grammar inside a visibly fictional, sandboxed frame.

**STORY:** A visitor first meets the Gaia Skill Tree flagship, then can inspect a real local Connect Health prototype, Gaia Research, Skill Heaven, and other work. The founder statement gives the attribution principle; interactive explainers select Gaia Research's two public labs and show how the agent runtime, MCP request path, and terminal sample behave. Each real product opens at its own public URL; no frame claims to be a live remote system.

**FIRST VIEWPORT:** The `mbtiongson1` wordmark and page-section links sit above a two-part Screening Room grid. The left rail identifies Marcus Rafael B. Tiongson and holds a named project reel. The broad right frame opens on Gaia Skill Tree's owner-provided Open Graph artwork, explicitly captioned as static identity art rather than a live screenshot, with direct live-site, source, and full-case-study links. On phones, identity and a horizontal keyboard-scrollable reel precede the full-width stage.

**FORM:** Owner-pinned existing Screening Room / browser-inspection bay; preserve its world rather than reseeding. The signature interaction is the named project filmstrip, with a same-document View Transition when supported and allowed; immediate selection is the fallback for unsupported browsers and reduced motion. No direction-seed key applies because this is the previously decided visual world, not a new direction round.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish record — implementation / visual QA pending

- `npm run build`, `npm run check`, and `npm run check -- --release` pass. The generated build contains only `/` and `/work/gaia-skill-tree/`; five disabled world routes return 404, with their source retained.
- Node/JSDOM checks verify the 11-project reel, Gaia profile link, Connect Health sandbox/disclosure, Fuel ABEMIS chart, Skill Heaven rung control, Gaia Research lab selector, Rock MCP request-mode explanation, macdash sample replay, Gaia case-study chapter state/keyboard movement, and focusable skip target.
- Local HTTP checks return 200 for root, case study, local demo, media, and assets. The fictional Connect demo passes zero-network/identifier scans; eight shipping rasters have adjacent provenance (0 missing).
- The Impeccable detector ran once on the page/CSS targets. Its color/font advisories came from the previously stale global design record; DESIGN.md now documents the chosen Screening Room system. Short tracked metadata, display line-height, and remaining tool findings have not received visual disposition.
- **No browser visual review or finish verdict is claimed.** The authorized Ego TaskSpace 16 no longer appears in `listTaskSpaces()`; I did not create another space or launch headless Chrome. Keep the PR unmerged and Pages undeployed until the operator restores/authorizes the browser space and desktop/mobile review is performed.
