---
name: Arcade Marquee
description: A project archive staged as one selected cabinet in a dark arcade aisle.
colors:
  aisle: "#0c141a"
  aisle-shadow: "#080e13"
  cabinet: "#111b24"
  screen-well: "#0a1117"
  ink: "#f5f0e6"
  muted: "#bdc9d0"
  rule: "#455560"
  aisle-rule: "#253640"
  cyan: "#2feff8"
  magenta: "#e774b2"
  amber: "#f8ab4c"
  amber-ink: "#21170b"
  demo-paper: "#f2eee5"
  demo-screen: "#e3e4dd"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontSize: "clamp(2.5rem, 8vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "0.72rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.07em"
components:
  marquee-sign:
    backgroundColor: "{colors.cabinet}"
    textColor: "{colors.ink}"
    borderColor: "{colors.rule}"
    padding: "clamp(1.2rem, 2.1vw, 2rem) clamp(1.1rem, 2.8vw, 2.8rem)"
  project-index:
    backgroundColor: "{colors.aisle}"
    textColor: "{colors.ink}"
    borderColor: "{colors.aisle-rule}"
    padding: "0.52rem 0.3rem"
  cabinet-frame:
    backgroundColor: "{colors.cabinet}"
    textColor: "{colors.ink}"
    borderColor: "{colors.rule}"
    padding: "0.75rem"
  disclosure:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.amber-ink}"
    padding: "0.55rem 0.75rem"
  artifact-open:
    backgroundColor: "transparent"
    textColor: "{colors.amber}"
    borderColor: "{colors.amber}"
    padding: "0.62rem 0.8rem"
  attract-toggle:
    backgroundColor: "{colors.screen-well}"
    textColor: "{colors.ink}"
    borderColor: "{colors.rule}"
    padding: "0.4rem 0.7rem"
---

# Design System: Arcade Marquee

## Overview

**Creative North Star: “One selected cabinet, six ways in.”** The archive reads as a dark aisle of physical project cabinets, not a thumbnail grid. A visitor chooses a real project, sees its source artifact or media in the lit cabinet, reads the adjacent publication boundary, then follows its genuine opening path.

**Key characteristics:**
- The large marquee and square ruled cabinet establish an arcade material without neon glows or decorative game UI.
- One semantic, named project index chooses the cabinet; archive content comes from the shared project catalog.
- Project copy, artifact, and disclosure travel together. A public site is a direct link, never an invented embedded preview.

## Colors

### Primary
- **Cyan** (`cyan`) marks the active project, key accents, and keyboard focus.

### Secondary
- **Magenta** (`magenta`) is the quiet archive pin and secondary wayfinding mark; it is not a data encoding.

### Tertiary
- **Amber** (`amber`) identifies the attract control, disclosure boundary, and artifact-opening action. Its paired dark text is `amber-ink`.

### Neutral
- **Aisle / Aisle Shadow** (`aisle`, `aisle-shadow`) set the low-light field and masthead.
- **Cabinet / Screen Well** (`cabinet`, `screen-well`) separate the hardware frame from the screen interior.
- **Ink / Muted** (`ink`, `muted`) provide high-contrast primary and supporting copy.
- **Rule / Aisle Rule** (`rule`, `aisle-rule`) form hardware edges and restrained list separators.
- **Demo Paper / Demo Screen** (`demo-paper`, `demo-screen`) are neutral loader grounds around the real local prototype, not a claim about its content.

**The Aisle Contrast Rule.** Cyan means selected, magenta means archive wayfinding, and amber means action or publication boundary. None of these colors encode fictional metrics.

## Typography

**Display:** self-hosted Barlow Condensed, weight 800. **Body:** self-hosted Barlow, weights 400 and 600; the face and its notices live in `assets/fonts/`.

The title is broad, condensed, uppercase lettering with a tight line-height. Project names reuse that display voice; summaries, labels, and disclosures stay in Barlow. Body copy uses a 1rem base and 1.5 line-height. Functional labels stay at or above 0.72rem (11.52 CSS pixels); uppercase is reserved for short labels and headings, not longer explanatory copy.

**The Named Work Rule.** Catalog titles remain source content; every project is findable by name in the semantic selector and keeps its own summary, context, artifact, and disclosure.

## Layout

At wide widths, the masthead and six-world navigation sit above the marquee. The stage uses a narrow project rail beside a dominant cabinet. The archive index is an ordered list of real anchors. A selected record’s heading and reading copy move into the rail while its actual artifact and disclosure occupy the cabinet.

At 760px and below, the stage stacks into a project selector and one cabinet at a time. The index remains a native `<details>` disclosure with the complete list. At 390px and below, the marquee becomes a two-column sign and the archive list becomes one column. Without JavaScript, the server-built index, selected record, and all remaining project sections stay visible and usable; the attract control is absent.

The selected project is addressable by fragment. Selection updates browser history, supports Back/Forward, and announces manual changes to assistive technology. Shared records and routes remain generated from `data/projects.json` and `data/worlds.json` by the project build.

## Elevation & Depth

No diffuse shadows or glowing halos. Tonal blocks, double sign rules, small fasteners, cabinet borders, and a dark screen well provide all depth. The actual compiled demo remains an owner artifact inside a sandboxed iframe; its own styling is not redesigned here.

## Shapes

Cabinet and sign edges are square and ruled. The only rounded form is the small circular sign fastener; a rotated diamond pin marks archive entries. Light points are discrete, not a continuous neon effect.

## Components

### Marquee sign
The sign labels the world and communicates the real-work premise. A double enamel rule and small fasteners carry the physical metaphor; the three accent lights remain discrete. On mobile the headline and side labels reflow without hiding the world name.

### Project index
A real ordered list provides every project name and kind, with an anchor to the corresponding record. The active item receives cyan text and a filled pin. `:focus-visible` remains explicit and stronger than hover. On mobile the list is collapsed with native details only after JavaScript enhancement; without it, the list is open.

### Cabinet and artifact boundary
The cabinet is a square, ruled frame with one selected record visible. The `People, compiled` page is the only local HTML preview and uses the existing restricted sandbox. Every catalog disclosure remains directly beside its media or preview. Image artifacts link to their original local file; projects with no verified local media use an explicit link-only note.

### Artifact-opening link
A bordered amber link opens the actual local artifact or verified public destination. This action is separate from the sandboxed preview.

### Attract control
Attract mode advances every 8.5 seconds only while enabled, in view, and not under reduced motion. It pauses for pointer hover, keyboard focus, manual project selection, a hidden document, offscreen state, and `prefers-reduced-motion`. Selecting a project turns attraction off; a visible button lets the visitor choose whether to restart it.

## Do's and Don'ts

### Do
- **Do** use the shared archive as the sole source of project names, copy, artifact paths, and disclosures.
- **Do** keep the true prototype or media at the center of each cabinet and provide a direct opening path.
- **Do** preserve static HTML access, semantic list structure, visible keyboard focus, and reduced-motion behavior.
- **Do** treat the generated decision image as a development reference only; it is not an artifact, source of project facts, or shippable raster.

### Don't
- **Don't** reproduce the comp's invented project labels, dashboard values, or visualized facts.
- **Don't** present fictional prototype data as real people, live system output, customer evidence, or a connected service.
- **Don't** embed external public sites or claim an unverified image belongs to them.
- **Don't** reuse this palette as a template for other independently art-directed portfolio worlds.
