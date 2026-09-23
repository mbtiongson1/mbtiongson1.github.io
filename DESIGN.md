---
name: Marcus Portfolio — Field Atlas foundation
description: A neutral six-world lobby and a separately authored chart-informed Field Atlas.
colors:
  atlas-sea: "#092b33"
  atlas-deep: "#06232b"
  atlas-ink: "#f4f2e9"
  atlas-muted: "#c1d6d0"
  atlas-rule: "#537d7e"
  atlas-current: "#cafa53"
  atlas-cyan: "#62d4e7"
  lobby-paper: "#e6e7df"
  lobby-ink: "#18232b"
  lobby-signal: "#b23a27"
typography:
  display:
    fontFamily: "Barlow Condensed, sans-serif"
    fontWeight: 800
    lineHeight: 0.88
  body:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow, Arial, sans-serif"
    fontWeight: 600
components:
  atlas-artifact-link:
    backgroundColor: "{colors.atlas-deep}"
    textColor: "{colors.atlas-ink}"
    padding: "0.6rem 0.8rem"
  atlas-disclosure:
    backgroundColor: "{colors.atlas-current}"
    textColor: "{colors.atlas-deep}"
    padding: "0.5rem 0.8rem"
  lobby-enter:
    backgroundColor: "{colors.atlas-current}"
    textColor: "{colors.atlas-deep}"
    padding: "1rem 1.2rem"
---

# Design System: Marcus Portfolio — Field Atlas foundation

## Overview

**Creative North Star: "The navigable survey sheet"**

This document records the **implemented** foundation, not a common skin for all six worlds. The root lobby uses its own paper, ink, signal-red and departure-board typography to choose a route. Field Atlas changes physical scene: a visitor studies a fictional-data interactive interface against a dark blue-green chart field, with contour linework and a direct project index. The real artifact and its disclosure stay legible. The other five routes own their own systems when their separate PRs arrive; their temporary placeholders inherit the lobby only because they are not finished worlds.

**Key Characteristics:**
- The lobby is a typographic selector, not six equal cards.
- Field Atlas has one dominant artifact frame, a named index, restrained contour linework, and honest media captions.
- Content/provenance are shared; palettes and component systems are not.

## Colors

### Primary
- **Atlas Sea** (`atlas-sea`): the chart ground, spanning the Field Atlas page behind the work.
- **Atlas Deep** (`atlas-deep`): artifact framing and the darker closing region.
- **Atlas Current** (`atlas-current`): active wayfinding pin, primary artifact disclosure, and route emphasis. Its strong contrast carries publication boundaries rather than fake measurements.

### Secondary
- **Atlas Cyan** (`atlas-cyan`): sparse route trace and project-kind emphasis, never a data encoding.
- **Lobby Signal** (`lobby-signal`): the root selector's second-line emphasis and focus cue; not a Field Atlas accent.

### Neutral
- **Atlas Ink / Muted / Rule**: bright heading, supporting copy and thin survey rules respectively; use the muted ink only on the dark chart field.
- **Lobby Paper / Ink**: the lobby's light field and dark typographic voice.

**The Boundary Rule.** A fictional-data label is adjacent to the artifact and contrasts with its own ground; it is not a quiet footnote.

## Typography

**Display Font:** Self-hosted Barlow Condensed at weight 800 (with sans-serif fallback). **Body Font:** Self-hosted Barlow at weights 400 and 600. Both have OFL notices in `assets/fonts/`.

**Character:** Wide typographic scale makes the lobby an entry decision; condensed uppercase lettering makes Field Atlas read like an expedition poster without turning body copy into a map prop.

### Hierarchy
- **Display:** Field Atlas title uses a fluid clamp capped below 6rem, tight but legible line-height; the lobby title is larger because its route choice is the whole first screen.
- **Project title:** condensed heavy caps identify an artifact before its explanatory copy.
- **Body:** Barlow regular at 1rem with 1.5 line-height; explanatory lines stay around 65–70 characters where space permits.
- **Label:** Barlow semibold; small uppercase is reserved for short functional labels, while longer descriptions remain sentence case.

**The Artifact Name Rule.** Project titles are content, not anonymous card headings; every world gets the same title from the shared record.

## Layout

The lobby opens with a large split headline, then one featured route and a ruled list of other routes. Field Atlas uses a desktop chart-sheet grid: title and named index on the left, interactive artifact on the right, with a reviewed terrain crop entering the lower left. The index also includes reviewed public-site entries: a static Gaia Skill Tree Open Graph visual with its live link, and a Gaia Research live link without unverified-metric artwork. At narrow widths the DOM order is title, artifact, project index, terrain; a direct jump link reaches the index. The index is real anchors and sections in generated HTML, independent of JavaScript. All six public routes and project URLs are built from `data/worlds.json` and `data/projects.json` into static `dist/` pages by `scripts/build.mjs`.

## Elevation & Depth

Field Atlas is flat except for a soft, downward artifact-frame shadow; borders and field value establish layering. The lobby uses tonal blocks, not floating cards. The compiled demo retains its own paper texture and typography within its sandboxed frame; the portfolio does not restyle that owner artifact.

## Shapes

Square-edged ruled frames, straight separators, a small rotated survey pin and a single thin route trace. Contour curves are authored chart material rather than project coordinates. No rounded-card system is shared with future worlds.

## Components

### Field Atlas project index
- Named anchors jump to server-rendered project sections. A pin fills for the active project when JavaScript is available; the links work without it. Focus is a high-contrast outline, not hover alone.

### Artifact frame and disclosure
- The interactive compiled page lives in an iframe with only `allow-scripts allow-downloads`, a visible fictional-data band, and a separate full-page launch. Static images open at full size and retain adjacent disclosures; link-only entries show an explicit no-local-image note. The dashboard's own runtime and files remain untouched.

### Lobby selector
- The featured route is a large dark field with a real WIP image and a disclosure. Remaining routes are typographic rows. The five placeholder pages are temporary source seams and are not a shared visual identity for those worlds.

## Do's and Don'ts

### Do:
- **Do** let source artifacts determine the visual center and preserve their source names and publication caveats.
- **Do** route every world through the same project catalog while letting its own page, stylesheet, and optional script define its experience.
- **Do** keep a direct named list and clear keyboard focus alongside the chart metaphor.

### Don't:
- **Don't** infer geography, rankings, live connections, actual people data, or client outcomes from the chart or prototype screenshots.
- **Don't** ship the generated decision comps or the private Rock harness and live variants.
- **Don't** turn upcoming independently art-directed worlds into palette swaps of Field Atlas or the lobby.
