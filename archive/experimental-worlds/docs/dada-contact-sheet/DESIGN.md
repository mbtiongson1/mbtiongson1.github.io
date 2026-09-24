---
name: Dada Contact Sheet
description: A movable typeset index into real interface work.
colors:
  newsprint: "#e2d8c9"
  ticket-stock: "#eee8de"
  ink: "#121a1c"
  muted: "#514d47"
  rule: "#777067"
  scarlet: "#d5221f"
  scarlet-ink: "#a91b18"
  cobalt: "#0d4c9c"
  paper-white: "#f5f1e9"
  print-white: "#ffffff"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(3.2rem, 7.72vw, 119px)"
    fontWeight: 800
    lineHeight: 0.8
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
    lineHeight: 1.4
    letterSpacing: "0.08em"
spacing:
  tap-min: "2.75rem"
  index-row: "3.65rem"
components:
  world-navigation-link:
    textColor: "{colors.ink}"
    height: "2.75rem"
  project-scrap:
    backgroundColor: "{colors.ticket-stock}"
    textColor: "{colors.ink}"
    height: "3.65rem"
    padding: "0.48rem 0.25rem 0.48rem 0"
  selected-artifact-mount:
    backgroundColor: "{colors.newsprint}"
    padding: "clamp(0.25rem, 0.55vw, 0.55rem)"
  artifact-disclosure:
    backgroundColor: "{colors.scarlet}"
    textColor: "{colors.print-white}"
    padding: "0.68rem clamp(0.8rem, 1.4vw, 1.3rem)"
  artifact-open:
    backgroundColor: "transparent"
    textColor: "{colors.paper-white}"
    height: "2.75rem"
    padding: "0.52rem 0.7rem"
  archive-artifact-open:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    height: "2.75rem"
    padding: "0.52rem 0.7rem"
---

# Design System: Dada Contact Sheet

## Overview

**Creative North Star: “The movable typeset plate.”** The archive behaves like an arranged contact sheet: a visitor picks a clearly named scrap and brings its complete project into a steady reading position. The visual language is a controlled Merz collage—measured type, ruled paper, printer-color fragments, and crisp registration—not a thumbnail grid or a photographed paper desk.

The published scene is built from CSS/HTML geometry and the project's self-hosted Barlow files. Project images and demos come only from the shared reviewed catalog and keep their own context and disclosure. The featured People, compiled record is the actual restricted HTML prototype, not the dashboard pixels depicted in the development comp.

**Key Characteristics:**
- Newsprint, ticket stock, charcoal, scarlet, and cobalt create distinct paper and ink roles.
- One selected project sits beside a real named index; selecting an entry preserves the full artifact, its caption, and its publication boundary.
- The index and featured plate reflow into a vertical, non-overlapping reading order on narrow screens.

## Colors

A full print palette assigns paper grounds, ink, registration color, and high-contrast publication notes; color never encodes fictional measurements.

### Primary
- **Registration Scarlet** (`scarlet`) marks the largest paper cuts, selected index numerals, and the high-contrast artifact-disclosure strip.
- **Registration Cobalt** (`cobalt`) balances scarlet in the portfolio descriptor, alternating index numerals, focus treatment, and link states.

### Secondary
- **Deep Scarlet Ink** (`scarlet-ink`) is the accessible text tint for scarlet wayfinding on light paper.

### Neutral
- **Newsprint** (`newsprint`) is the page ground and the clear surround around project artifacts.
- **Ticket Stock** (`ticket-stock`) is the lighter inset and caption ground.
- **Charcoal Ink** (`ink`) carries the main cutout geometry, dark title bands, and footer.
- **Paper White** (`paper-white`) provides soft, legible type on charcoal.
- **Print White** (`print-white`) preserves strong text contrast on scarlet disclosures and action states.
- **Supporting Ink / Rule** (`muted`, `rule`) handle explanatory context and fine registration lines.

**The Ink Contrast Rule.** Large scarlet marks may keep the bright registration ink; small scarlet text on paper uses the deeper scarlet ink. White disclosure text stays on scarlet, and secondary copy must retain readable contrast on its actual ground.

## Typography

**Display Font:** self-hosted Barlow Condensed, weight 800 (with Arial Narrow and sans-serif fallbacks). **Body Font:** self-hosted Barlow, weights 400 and 600 (with Arial and sans-serif fallbacks).

The very large, tightly led display face carries the maker's full name and project titles. Barlow carries the complete project summaries, context, controls, and disclosures. Short uppercase labels use semibold Barlow; longer explanatory content remains sentence case. Font files and licenses already live under `assets/fonts/`; this route introduces no remote font dependency.

### Hierarchy
- **Display** (800, `clamp(3.2rem, 7.72vw, 119px)`, line-height `0.8`): the three-line owner identity; narrower breakpoints reduce it to fit the reflowed index.
- **Project title** (800, `clamp(1.85rem, 3.2vw, 3.1rem)`, line-height `0.95`): the currently selected archive record.
- **Body** (400, `1rem`, line-height `1.5`): summaries, provenance context, and closing explanation.
- **Label** (600, `0.72rem`, line-height `1.4`, tracking `0.08em`): short world-navigation, record-kind, and index labels.

**The Named Work Rule.** The shared project title and kind remain visible in the contact sheet, and a selected project keeps its own catalog copy rather than receiving invented case-study language.

## Layout

At desktop widths the paper index occupies the measured left 30% and the selected artifact the right 70%. The index uses a generous left inset and contains the full six-record list; the featured viewer begins below the masthead and leaves a narrow right-side paper edge. The title, index, and selected project are real semantic HTML, not positioned text inside a comp image.

At 1160px and below the index column widens for the available text measure. At 820px the page becomes a single-column stage with the identity and index sharing the first band; at 620px they become a calm vertical sequence above the selected artifact. Navigation scrolls horizontally rather than compressing six world links. The 320px minimum viewport remains usable, project images keep their natural aspect ratio, and the compiled HTML preview retains a readable viewport height.

Without JavaScript, `{{PROJECT_INDEX}}` renders named anchors to the full server-rendered project sections and `{{PROJECT_REST}}` keeps every project, artifact, caption, and disclosure available. When JavaScript is available, the same catalog supplies selectable scrap buttons; the selected project is addressable by fragment, Back/Forward restore selection, and Arrow keys plus Home/End move through the list.

## Elevation & Depth

The route is flat: it uses no drop shadows or glow. Overlapping solid-color cut-paper fields, a square ruled mount, dark title bands, and explicit borders establish depth. The embedded prototype remains its original restricted HTML artifact and is never restyled by the portfolio.

## Shapes

The contact sheet uses square, unrounded edges. Small four-point CSS polygons make abstract paper cuts; they do not approximate the contour of project imagery. Registration marks are simple, small inline line-and-circle SVGs. Project screenshots are never clipped, lettered over, or turned into decorative paper.

## Components

### Project index and scrap selector
Each project begins as a shared-build anchor to its actual archive section. JavaScript enhances those entries to labeled buttons with a printed ordinal, project title, kind, and a clear `aria-pressed` state. Every anchor and button has an opaque ticket-stock backing so index text stays legible over the charcoal cutout. Hover moves to paper white; the selected row uses newsprint and a scarlet title underline; keyboard focus keeps its cobalt outline. Each row remains at least 44px high, and selection announcements use a polite status region. Keyboard arrows, Home, and End are shortcuts; normal tab/Enter/Space behavior remains available.

### Selected artifact mount
A square-edged newsprint surround frames one selected record. The People, compiled demo is shown in its original local HTML with `sandbox="allow-scripts allow-downloads"`; its fictional-data boundary is adjacent. Image records use their catalog `alt`, full natural proportions, a caption, and a direct full-size link. Gaia Research has no local image or embed: its local-preview note is honest and its verified live URL is the only destination.

**The Intact Plate Rule.** A catalog screenshot stays whole and legible, with its exact alt text, caption, disclosure, and original-artifact link; no collage edge may remove pixels from the work.

### Disclosure and artifact actions
The disclosure sits immediately before its own artifact on a high-contrast scarlet strip. Local prototype, full-size image, and external-site links remain separate actions with a 44px minimum height, a clear underline, and a visible keyboard focus treatment. New tabs announce themselves to assistive technology.

### World navigation
The six route links appear in a ruled masthead and again in the footer. The current world uses a scarlet underline and a darker accessible ink tint; at compact widths all links remain available in a horizontal scroll region.

### Motion and focus
The route uses short color transitions for hover/selection and no entrance animation. `prefers-reduced-motion` removes transitions and smooth scrolling. The skip link targets a `tabindex="-1"` main landmark; both that destination and interactive links expose a 3px cobalt focus outline.

## Do's and Don'ts

### Do
- **Do** use `data/projects.json` as the sole source for project titles, summaries, paths, alt text, captions, and disclosures.
- **Do** keep each source screenshot intact and keep its disclosure immediately adjacent to the artifact.
- **Do** keep the no-JavaScript named archive, focusable skip destination, visible focus, 44px targets, and reduced-motion behavior.
- **Do** use the existing self-hosted font files and the CSS/HTML paper geometry; route-specific raster assets are not needed.

### Don't
- **Don't** copy, crop, or trace pixels from the generated direction comp into published files.
- **Don't** reproduce the comp's invented “Connect Field” labels or dashboard values as portfolio evidence.
- **Don't** add remote fonts or external-site embeds.
- **Don't** invent a local preview for a record whose catalog has no media or demo.
- **Don't** let paper cuts, lettering, or index decoration overlap the source artifacts.
