---
version: 1
slug: "src-pages-worlds-arcade-marquee-html"
primary_target: "src/pages/worlds/arcade-marquee.html"
related_targets: []
---

# Arcade Marquee

## Scope
- Primary target: `src/pages/worlds/arcade-marquee.html`; route: `/worlds/arcade-marquee/`.
- Visitor mode: Experience. Visitors are design-focused hiring managers, collaborators, and peers looking for real work to inspect.
- Job: browse the shared archive through a cabinet-like focus, preview the selected artifact, then open the real local artifact, image, or verified public site.
- Proof and constraints: use the shared `data/projects.json` archive, preserve each catalog disclosure next to its artifact, and keep all six named projects findable without JavaScript. No fabricated project facts, scores, clients, live connections, or embedded external sites.
- Unresolved decisions: none; the supplied approved comp and assignment pin the world and first-view structure.

## Direction contract

THESIS: The archive is a row of named cabinets in a dark aisle; each selected work gets one lit, inspectable screen. Reject the generic thumbnail grid and decorative arcade without usable artifacts.

OWN-WORLD: A near-black aisle holds physically framed marquees in cyan, magenta, and amber. Barlow Condensed carries the large sign lettering; Barlow keeps the catalog and disclosures readable. Thin enamel rules, square bezels, discrete lamp points, and restrained depth make the arcade feel built rather than glowy.

STORY: Visitors see real work, choose a named cabinet from the archive, inspect its true preview or media, read the adjacent publication boundary, and follow the project’s genuine opening path. Attract rotation yields to user choice, pointer/focus, offscreen state, and reduced-motion preference.

FIRST VIEWPORT: A maker/world masthead and six-world navigation sit above one broad, backlit marquee. Below it, a narrow semantic project selector occupies the left rail; one dominant cabinet occupies the rest, with the `People, compiled` HTML visible as its real sandboxed preview and its fictional-data boundary beside it. On mobile the stage stacks, shows one cabinet, and retains the full named list.

FORM: Shared archive source is `data/projects.json`, exposed through `{{PROJECT_INDEX}}`, `{{PROJECT_LEAD}}`, `{{PROJECT_REST}}`, and `{{WORLD_NAV}}`; no parallel project data. The user-approved comp is `.impeccable/mocks/decision/challenger-arcade.webp`, with `.prompt.txt` beside it. Pinned direction key: `challenger-arcade` (approved comp identifier; no new concept-seed round because this assignment pins the direction). Treat invented or inaccurate comp-screen details as non-evidence and substitute the actual published artifact.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Finish review and self-review verdict

- **Review authority:** No hidden subagent or Impeccable finish-reviewer was invoked. The one authorized Sol-medium invocation was already consumed. The orchestrator owns the visible PR review; this self-review records evidence and limitations, not an independent visual approval.
- **Build-phase record:** `.impeccable/build/state.json` reports `spec` closed (14 regions, 0 plates, 9 text regions measured) and `plates` closed (no plates owed). `hero` remains **open**; `sections`, `motion`, `responsive`, and `review` remain pending; `finish` is null. This implementation does not force or claim those gates closed.
- **Approved-comp limitation:** `.impeccable/mocks/decision/challenger-arcade.webp` is a development-only generated comp. It contains invented project names (including “The Connect Field,” “Interface Systems,” and “Prototype Studies”) and dashboard labels/values that are not evidence. The route intentionally uses the real six-record catalog and the actual compiled `People, compiled` HTML instead. Therefore, its content pixels cannot honestly match that part of the comp. No local rendered screenshot or screenshot-based fidelity verdict was produced; the visible orchestrator review must assess the implementation without treating the comp’s invented content as a requirement. The hero visual gate remains unpassed/open.
- **Self-review:** The server-built page retains a semantic named index and all six records without JavaScript. The only iframe is the existing local prototype, with `sandbox="allow-scripts allow-downloads"` and its fictional-data disclosure adjacent; public destinations remain links. The selected project moves into one cabinet, fragments and Back/Forward select records, and manual choices announce to assistive technology. Attract mode pauses on selection, pointer entry, focus, hidden-page state, offscreen state, and reduced motion; mobile CSS stacks the stage and retains the full named list.
- **Automated evidence:** `npm run build`, `npm run check`, and `node --check src/scripts/arcade-marquee.js` pass. The build reports 7 routes and 6 shared project records. Route assertions verified unique catalog-backed sections and index links, adjacent disclosures, the restricted local iframe, link-only public research, and motion/accessibility hooks. A DOM event harness exercised project selection, disclosure behavior, attract-mode pause/resume conditions, reduced motion, offscreen state, and history state. Computed text contrast was 16.35:1 (ink/aisle), 10.99:1 (muted/aisle), 13.11:1 (cyan/aisle), 6.67:1 (magenta/aisle), 9.66:1 (amber/aisle), and 9.16:1 (disclosure text/amber).
- **Detector self-review:** One Impeccable detector run flagged the mobile maker-role text below 11px and its all-caps sentence-case copy; the role was enlarged and normalized. It also flagged 1px borders combined with broad shadows; those shadows were removed. Remaining design-system color/type advisories reflect the route’s deliberately independent palette and sizes being compared with the shared Field Atlas `DESIGN.md`; this route-local `docs/worlds/arcade-marquee/DESIGN.md` and `design.json` now record its own actual tokens. Shared design files remain untouched. No second detector pass or hidden review was run.
- **Visual-review limit:** Source and generated HTML/CSS were reviewed, and behavior was tested in the DOM harness, but desktop/mobile pixels, real-browser layout, and actual assistive-technology output have not been visually confirmed here. Request that the orchestrator’s visible PR review inspect the route at desktop and mobile sizes before calling the visual gate complete.
- **Raster/provenance:** No new raster asset ships with this route. The generated comp stays under development-only `.impeccable/mocks/`; the local demo and existing catalog assets remain the source artifacts. No comp image or invented dashboard data is published.
- **Verdict:** **Implementation and automated checks complete; visual review and hero gate open.** Do not describe the route as comp-validated or visually approved until the orchestrator completes the visible review.
