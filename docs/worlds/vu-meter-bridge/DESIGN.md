---
name: Marcus Portfolio — VU Meter Bridge
description: Six named project channels feed one truthful monitor bay.
colors:
  chassis: "#17191a"
  chassis-deep: "#0c0f10"
  chassis-mid: "#242729"
  paper: "#f2ede2"
  muted: "#bec4bd"
  rule: "#555b57"
  steel: "#82857f"
  face: "#f1e5ce"
  face-light: "#fff6e3"
  face-ink: "#1c1a17"
  face-rule: "#b9aa91"
  walnut: "#684631"
  walnut-deep: "#412c21"
  red-zone: "#b83c2c"
  focus: "#f3c76b"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, sans-serif"
    fontSize: "clamp(2.45rem, 4.4vw, 4.8rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Barlow Condensed, Barlow, sans-serif"
    fontSize: "clamp(2rem, 3.4vw, 3.6rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "-0.018em"
  body:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0.065em"
rounded:
  dial: "50%"
spacing:
  gutter: "clamp(1rem, 2.6vw, 2.6rem)"
  tap: "2.75rem"
components:
  channel-button:
    backgroundColor: "{colors.face}"
    textColor: "{colors.face-ink}"
    padding: "0.55rem 0.62rem 0.62rem"
    height: "8rem"
  channel-button-selected:
    backgroundColor: "{colors.face-light}"
    textColor: "{colors.face-ink}"
  artifact-link:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    padding: "0.58rem 0.72rem"
    height: "{spacing.tap}"
  disclosure:
    backgroundColor: "{colors.face}"
    textColor: "{colors.face-ink}"
    padding: "0.72rem 0.78rem"
  monitor-frame:
    backgroundColor: "{colors.chassis-mid}"
    textColor: "{colors.paper}"
    padding: "0.75rem"
  channel-meter:
    backgroundColor: "{colors.face}"
    textColor: "{colors.face-ink}"
    height: "3.3rem"
  world-link:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    height: "{spacing.tap}"
  skip-link:
    backgroundColor: "{colors.face}"
    textColor: "{colors.face-ink}"
    padding: "0.65rem 1rem"
    height: "{spacing.tap}"
  maker-lockup:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    height: "{spacing.tap}"
---

# Design System: VU Meter Bridge

## Overview

**Creative North Star: "The Channel-Select Bridge"**

A dark, measured instrument chassis gives six real project records the clarity of named channels. Pale meter faces and square steel edges carry the wayfinding; warm walnut bands mark the structure, not a decorative desk scene. The visitor chooses one channel and inspects its real artifact in the main monitor bay. The lower archive keeps the other five records available as complete, honest entries.

The recording-desk metaphor is structural rather than theatrical. There are no sound effects, invented level values, faux telemetry, or rows of decorative knobs. The interface uses a black needle and a single red selector zone to say which project is selected—nothing about that project's quality or activity. Portfolio evidence stays in its catalog form, with publication disclosures adjacent.

**Key Characteristics:**
- A six-channel selector leads to one dominant, inspectable monitor.
- Charcoal, pale instrument faces, steel rules, and walnut rails define the palette and depth.
- Selection is an explicit button state; names and links remain available without JavaScript.
- Every artifact remains source-backed and its disclosure stays beside it.

## Colors

The field is graphite-dark; the navigation face is warm and light; walnut and steel are structural, while red is reserved for the selected-channel index.

### Primary
- **Chassis:** the page ground and the dark monitor surround.
- **Instrument Face:** project-channel controls and publication-disclosure bands.
- **Face Ink:** channel names and copy on pale surfaces.

### Secondary
- **Walnut Rail:** the narrow upper and lower chassis bands and small maker mark.
- **Steel Edge:** defined instrument and screen boundaries.
- **Selected Red:** one small zone on the active meter face and its matching selected-state label.

### Neutral
- **Paper:** primary text on the charcoal field.
- **Muted:** secondary text and supporting context on dark surfaces.
- **Rule:** internal divisions and archive separators.

**The Selection-Only Rule.** Red and the black needle mark selection only. They never encode performance, project quality, a live connection, or a measurement.

## Typography

**Display Font:** Self-hosted Barlow Condensed 800, with Barlow and sans-serif fallbacks. **Body Font:** Self-hosted Barlow 400/600, with Arial and sans-serif fallbacks. Both type families are served from the repository's licensed `assets/fonts/` files; this route adds no remote font dependency.

**Character:** Condensed, heavy headings read like carefully lettered instrument labels. Barlow keeps disclosure, context, and project kinds plain and comfortable to read.

### Hierarchy
- **Display** (800, fluid 2.45rem–4.8rem, 0.9 line-height): the world title and large project names.
- **Headline** (800, fluid 2rem–3.6rem, 0.9 line-height): archive entries and section headings.
- **Body** (400, 1rem, 1.5 line-height): summaries and explanatory copy; keep measures near 66ch where space permits.
- **Label** (600, 0.78rem minimum, 1.25 line-height, tracked): kinds, navigation, statuses, and instrument labels. Keep functional labels at or above 12px.

**The Local-Font Rule.** Use the self-hosted Barlow files or their named local fallbacks; do not add remote imports or unbundled faces.

## Layout

A compact maker/world header sits above the title and the six-channel bridge. The desktop bridge uses six equal columns; the tablet range reduces it to three columns; narrow mobile shows one full-width channel at a time in a horizontal snap rail. The selected project occupies a framed monitor bay with its factual title, kind, status, disclosure, and summary in a narrow information column beside the larger artifact. At 800px and below that composition becomes one column, with the disclosure before the artifact. All five non-lead records remain in a ruled archive below. Without JavaScript, the six catalog-generated links remain real anchors into one featured section and five archive sections. On mobile, world navigation wraps into visible rows rather than clipping into a themed gesture.

## Elevation & Depth

The system is flat, not floating. Tonal fields, a one-pixel steel outline, a narrow walnut rail, and the monitor's inner border establish layers. There are no drop shadows. The main artifact frame reads as a physical bay because of its inset boundary and contrast, not a lifted card.

**The Defined-Edge Rule.** Prefer a clear steel boundary or a tonal step over a soft floating shadow.

## Shapes

Panels, channel controls, links, and archive rows use square corners. Only the CSS-drawn meter arc and its central hub are circular. The channel face uses unnumbered calibration ticks; it is a selection affordance, not a chart. Keyboard focus is a three-pixel warm outline with offset, not a material screw or status lamp. No free-standing knob, fake switch, or decorative hardware is part of the system.

## Components

### Project-channel controls
- **Character:** six pale, square channel plates, each with the real catalog title and kind.
- **Shape:** square panel edges; the small dial geometry is confined to the control face.
- **State:** native buttons expose `aria-pressed`; the selected project also has visible “Selected” text. Arrow keys cycle; Home and End reach the first and last channel. On mobile the active control is brought into view.
- **No-script behavior:** the control group is replaced only after successful enhancement; the static named project anchors stay usable otherwise.

### Meter selector face
- **Drawing:** CSS/HTML geometry with no numeric labels, scale values, audio, or raster dial asset.
- **Selected:** one black needle and the red index zone appear on the chosen channel only. Both are a selection mark, never a reading.

### Monitor and artifact frame
- **Shape:** square steel outline, dark tonal well, narrow walnut lower rail.
- **Artifact:** the featured local prototype is the catalog's sandboxed same-site HTML demo. Static images preserve their natural proportions and open at full size. A link-only record has no fabricated thumbnail, image, or embed; its verified public link remains explicit.
- **Disclosure:** catalog disclosure remains before and beside the artifact. Captions and source context stay with their own archive entry.

### Artifact links and publication notes
- **Links:** outlined, minimum 44px-high actions with a visible underline and external-link indication.
- **Disclosure:** dark text on a pale face, placed adjacent to the item it describes.
- **Focus:** high-contrast visible outline; hover is not the sole affordance.

### Portfolio-world navigation
- **Style:** named text links in the maker header, with the current world indicated by an underline and color shift.
- **Mobile:** links wrap into rows, preserving access to every world.

### Maker and skip affordances
- **Maker lockup:** the full home link and its mobile mark remain at least 44px tall/square.
- **Skip link:** becomes visible on keyboard focus and retains the same 44px minimum target.

## Do's and Don'ts

### Do:
- **Do** derive all channel names, descriptions, disclosures, and artifacts from the shared project catalog.
- **Do** keep the fictional-data warning adjacent to the compiled dashboard and preserve each static capture's caveats.
- **Do** keep link-only Gaia Research as a verified link with an explicit no-local-preview note.
- **Do** make selection obvious in both text and `aria-pressed`, with keyboard focus visible.
- **Do** use only the repository's self-hosted licensed Barlow fonts.

### Don't:
- **Don't** make a needle, red zone, status label, or channel position imply project performance.
- **Don't** add audio, fabricated metrics, fake dashboard screenshots, or an external site embed.
- **Don't** copy the generated decision comp or its pixels into published assets.
- **Don't** turn the meter bridge into a card grid or spread decorative knobs across the interface.
- **Don't** borrow another world’s palette or layout as a global portfolio skin.
