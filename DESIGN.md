---
name: Marco Tiongson Portfolio: Teal Field, Condensed Type, Ruled Receipts
description: Deep teal field, condensed uppercase type, ruled ledgers, and honest publication boundaries.
colors:
  sea: "#092b33"
  deep: "#06232b"
  abyss: "#041a20"
  ink: "#f4f2e9"
  muted: "#bdd2cc"
  quiet: "#8fb0aa"
  rule: "#24505a"
  rule-strong: "#537d7e"
  signal: "#cafa53"
  cyan: "#62d4e7"
  cream: "#fef1e8"
typography:
  display:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif"
    fontWeight: 800
    lineHeight: 0.84
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif"
    fontWeight: 800
    lineHeight: 0.86
    letterSpacing: "-0.012em"
  title:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.01em"
  body:
    fontFamily: "Barlow, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Barlow, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.74rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.14em"
rounded:
  none: "0px"
components:
  boundary-banner:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.deep}"
    padding: "0.6rem 1rem"
  lens-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "0 0.9rem"
    height: "38px"
  lens-button-active:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.deep}"
    padding: "0 0.9rem"
    height: "38px"
  stage-link:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.ink}"
    padding: "0 0.4rem"
    height: "40px"
  work-index-row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    padding: "0.85rem 0.2rem"
  work-index-row-hover:
    backgroundColor: "{colors.deep}"
    textColor: "{colors.signal}"
    padding: "0.85rem 0.2rem"
  receipt-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    padding: "0.7rem 0"
---

# Design System: Marco Tiongson Portfolio: Teal Field, Condensed Type, Ruled Receipts

## Overview

**Creative North Star: "The Builder's Working Sheet"**

This system structures Marco Tiongson's personal portfolio as a dense, honest technical sheet rather than a decorative showcase. The design establishes a deep teal foundation (`#092b33`) where work leads from the very first viewport. Three primary bodies of work—Favor Home, Favor Dashboards, and Gaia—are each framed as an authentic technical artifact supported by verified architectural decisions and ruled margin ledgers citing pull request numbers.

The aesthetic combines industrial density with editorial precision. Poster-scale condensed uppercase typography commands section entries, while high-contrast lime signals (`#cafa53`) delineate publication boundaries, active wayfinding, and focus states. Artifacts sit within recessed deep-ink frames (`#06232b`) and authentic cream backgrounds (`#fef1e8`), establishing clear boundaries between the portfolio canvas and the systems being examined.

**Key Characteristics:**
- A dark teal canvas (`#092b33`) recessed with deep-well frames (`#06232b`) and an abyss footer (`#041a20`).
- Heavy Barlow Condensed display headings at poster scale with ultra-tight line-height (0.84–0.86).
- Ruled margins, tabular receipts, and architectural schematics establishing empirical proof over assertion.
- High-visibility lime signal bands (`#cafa53`) explicitly declaring synthetic or fictional data boundaries adjacent to every artifact.
- Zero border radius across all containers, buttons, and frames; form language is strictly rectilinear.

## Colors

The palette grounds the interface in deep marine teal tones, balancing heavy bone typography with hairline structural rulings and a vivid lime signal reserved for truth and state boundaries.

### Primary
- **Deep Teal Ground** (`#092b33` / `--sea`): The foundational canvas spanning the entire document viewport behind all content.
- **Deep Well** (`#06232b` / `--deep`): Recessed containers, masthead background, artifact stage framing, and earlier work ground.
- **Signal Lime** (`#cafa53` / `--signal`): High-contrast accent reserved exclusively for publication boundary bars, active wayfinding underlines, selection backgrounds, and focus rings.

### Secondary
- **Receipt Cyan** (`#62d4e7` / `--cyan`): Sparse technical accent dedicated to verifiable pull request numbers, chapter step numbers, and beat titles.
- **Island Cream** (`#fef1e8` / `--cream`): Authentic warm cream surface used exclusively within the Favor, by People lens frame to preserve original widget fidelity.

### Neutral
- **Bone Ink** (`#f4f2e9` / `--ink`): Primary text color for body copy, strong headings, button labels, and code elements.
- **Muted Teal** (`#bdd2cc` / `--muted`): Secondary body copy, subtitle descriptions, and default navigation links.
- **Quiet Teal** (`#8fb0aa` / `--quiet`): Tertiary captions, schematic labels, and ledger metadata annotations.
- **Hairline Rule** (`#24505a` / `--rule`): Subtle divider lines between list items, table rows, and code borders.
- **Strong Rule** (`#537d7e` / `--rule-strong`): Primary architectural boundaries, section dividers, masthead borders, and stage frames.
- **Deep Abyss** (`#041a20` / `--abyss`): Ground for the closing site footer beneath a 2px lime rule.

### Named Rules
**The Publication Boundary Rule.** Every fictional-data artifact is framed by an adjacent high-contrast signal lime (`#cafa53`) boundary band with deep ink (`#06232b`) text. Synthetic or demo fixtures must never be disguised or relegated to footnotes.

**The Signal Rarity Rule.** Signal lime is applied to less than 5% of any viewport. Its power comes from restraint; it is reserved for truth boundaries, active navigation, and keyboard focus.

**The Receipt Cyan Rule.** Cyan (`#62d4e7`) is strictly an evidentiary accent. It identifies pull requests, ledger citations, and process step prefixes (`Research.`, `Registry.`, `Runtime.`), never generic body links.

## Typography

**Display Font:** Self-hosted Barlow Condensed (weight 800) with `'Arial Narrow', sans-serif` fallback.
**Body Font:** Self-hosted Barlow (weights 400 and 600) with `'Helvetica Neue', Arial, sans-serif` fallback.
**Monospace Font:** System monospace stack (`ui-monospace, SFMono-Regular, Menlo, monospace`) for inline code tags.

**Character:** The pairing of condensed, architectural uppercase display type with clean, legible grotesque body text provides an authoritative, technical atmosphere suited for complex systems engineering.

### Hierarchy
- **Display** (800 weight, `clamp(3.6rem, 6.6vw, 6rem)`, line-height 0.84, letter-spacing -0.015em): Hero name and primary viewport entry.
- **Headline** (800 weight, `clamp(3.2rem, 6vw, 6rem)`, line-height 0.86, letter-spacing -0.012em): Chapter titles for each primary body of work.
- **Title** (800 weight, `clamp(1.7rem, 2.3vw, 2.2rem)`, line-height 1, letter-spacing 0.01em): Section beats, decisions title, and work index row headings.
- **Body** (400 weight, 1rem, line-height 1.55): Explanatory copy, tension and conviction paragraphs, with 60ch maximum line length.
- **Label** (600 weight, 0.74rem, line-height 1, letter-spacing 0.14em, uppercase): Masthead links, stage identifiers, table header cells, and schematic labels.

### Named Rules
**The Lining Numerals Rule.** Body and heading copy enforce `font-variant-numeric: lining-nums;` ensuring numbers align uniformly across tabular ledgers, dates, and pull request citations.

**The Tight Leading Rule.** Large condensed headings maintain line-heights below 0.9 (0.84 to 0.86) to render headlines as solid typographic blocks rather than loose lines.

## Layout

The page uses an asymmetric, responsive layout structured along a 1760px maximum container with fluid horizontal padding (`clamp(1.25rem, 3.2vw, 3.5rem)`):

- **Opening Viewport:** A two-column grid (`minmax(0, 5fr) minmax(0, 7fr)`) pairing builder identity, point-of-view statement, and a ruled 3-item work index on the left with the primary Favor Home artifact stage on the right.
- **Chapter Grid:** A 2-column layout (`minmax(0, 1fr) minmax(250px, 21rem)`) pairing the primary narrative and visual evidence in the left column with a sticky right-hand receipt ledger that tracks the reader's scroll position.
- **Three-Layer Flow:** Gaia is presented as a horizontal sequential pipeline (`Research → Registry → Runtime`) using a 3-column grid (`minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr)`) linked by directional chevron joints.
- **Quiet Archive:** Tabular 4-column row layout (`minmax(10rem, 14rem) minmax(0, 1fr) minmax(7rem, auto) 96px`) for secondary experiments and tools.
- **Responsive Adaptations:**
  - At 1100px (tablet), the receipt ledger unsticks and wraps into a 2-column grid beneath the narrative.
  - At 760px (mobile), the masthead navigation docks to the viewport bottom as a fixed bar (`z-index: 40`), and all multi-column grids collapse to single-column flows.

## Elevation & Depth

Surfaces rely on tonal layering and hairline borders rather than artificial floating elevation:

- Depth is achieved by placing deep well containers (`#06232b`) and authentic cream panels (`#fef1e8`) upon the deep teal foundation (`#092b33`).
- Downward drop shadows are used sparingly to ground artifact frames and mobile viewports against the dark background.

### Shadow Vocabulary
- **Stage Shadow** (`box-shadow: 0 22px 44px -14px rgba(0,10,13,.6)`): Applied to `.home-stage` and `.lens-stage` to elevate interactive frames above the canvas.
- **Mobile Frame Shadow** (`box-shadow: 0 18px 36px -10px rgba(0,10,13,.7)`): Grounding shadow on mobile device mockups in layered pairs.

### Named Rules
**The Tonal Layering Rule.** Depth is created through value contrast across tonal zones (`--sea` ground, `--deep` containers, `--abyss` footer) separated by hairline rules, not card lifts.

## Shapes

- **Zero Radius:** All containers, stage frames, buttons, tags, and image viewports use sharp 90-degree corners (`border-radius: 0`).
- **Hairline Framing:** Ruled lines (`1px solid var(--rule-strong)` and `1px solid var(--rule)`) define the structural skeleton of the interface.
- **Chevron Seams:** Sequential steps in the process flow connect via rotated square joints (`width: 12px; height: 12px; transform: rotate(45deg);`).

## Components

### Publication Boundary Banner
- **Character:** High-contrast authoritative notice stating data status directly adjacent to evidence.
- **Shape:** Rectangular, sharp corners (`border-radius: 0`).
- **Colors:** Background `var(--signal)` (`#cafa53`), text `var(--deep)` (`#06232b`).
- **Padding:** `0.6rem 1rem`.
- **Typography:** 0.84rem / 1.4 Barlow regular, with strong semibold bolding on the lead phrase.

### Lens Switcher
- **Character:** Compact segmented control allowing instant inspection of the Favor, by People island across four data lenses.
- **Shape:** Rectilinear button container framed with `1px solid var(--rule-strong)`.
- **States:** Inactive buttons are transparent with ink text; active button (`aria-pressed="true"`) fills with signal lime (`#cafa53`) and deep text (`#06232b`).
- **Touch Target:** Minimum 38px height and 44px width for accessibility.

### Work Index Rows
- **Character:** Direct chapter navigation on the opening hero.
- **Structure:** Ruled grid rows with display title, descriptive subline, and directional downward arrow.
- **Interaction:** On hover, row shifts to `var(--deep)`, title shifts right (`translateX(0.6rem)`) and turns lime, and arrow nudges downward.
- **Arrival Motion:** Border lines draw in on initial page arrival via CSS animation (`scaleX(0)` to `scaleX(1)`), disabled under `prefers-reduced-motion`.

### Sticky Masthead & Docked Mobile Bar
- **Character:** Persistent navigation tracking reading position across the document.
- **Desktop:** Sticky top bar (`height: 64px`), `rgba(6,35,43,.94)` backdrop blur with bottom border. Active section denoted by a 2px lime underline.
- **Mobile:** Re-anchors to the viewport bottom with safe-area padding for one-thumb reachability.

### Receipt Ledger
- **Character:** Margin column documenting verifiable pull request numbers and scope descriptions.
- **Interaction:** Synchronized with document scroll via IntersectionObserver; inactive entries dim to 0.38 opacity while the active principle's receipts illuminate to 1.0 opacity with lime reference badges.

## Do's and Don'ts

### Do:
- **Do** place an adjacent signal lime publication boundary (`#cafa53`) next to any artifact showing fictional or synthetic data.
- **Do** maintain strict 0px border radius on all cards, buttons, frames, and interactive elements.
- **Do** reserve receipt cyan (`#62d4e7`) for pull request numbers, step prefixes, and ledger citations.
- **Do** provide high-contrast keyboard focus outlines with `3px solid var(--signal)` and `3px outline-offset`.
- **Do** preserve the cream background (`#fef1e8`) inside Favor Home island containers to reflect authentic widget presentation.
- **Do** disable animations and transitions completely when `prefers-reduced-motion: reduce` is active.

### Don't:
- **Don't** use rounded corners, circular pills, or floating card elevated panels.
- **Don't** use signal lime as a general decorative fill or background outside of boundaries, active wayfinding, and focus rings.
- **Don't** give the design system or its components a conceptual brand name; describe surfaces and patterns plainly.
- **Don't** link to private repository pull requests; cite repository and PR number as text.
- **Don't** invent testimonials, unverified metric badges, or client endorsements.
