---
name: "Marcus Portfolio — Screening Room"
description: "An electric-midnight screening bay for inspecting one shared project archive."
colors:
  night: "#081818"
  night-deep: "#061113"
  night-panel: "#111c20"
  paper: "#f5f0ea"
  ink: "#101b1d"
  mist: "#c0ceca"
  muted: "#9aaba8"
  rule: "#526462"
  coral: "#ff684f"
  mint: "#65dfb1"
  sunflower: "#f4d34f"
  focus: "#fff0a3"
typography:
  display:
    fontFamily: "Barlow Condensed, Barlow, sans-serif"
    fontSize: "clamp(3.25rem, 5.2vw, 5.25rem)"
    fontWeight: 800
    lineHeight: 0.78
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
    letterSpacing: "0.12em"
components:
  filmstrip-selected:
    backgroundColor: "{colors.night-panel}"
    textColor: "{colors.paper}"
    height: "3.55rem"
    padding: "0.52rem 0.3rem"
  artifact-disclosure:
    backgroundColor: "{colors.sunflower}"
    textColor: "{colors.ink}"
    padding: "0.66rem 1rem"
  world-navigation:
    textColor: "{colors.mist}"
    height: "2.75rem"
    padding: "0.35rem 0"
  artifact-open:
    textColor: "{colors.paper}"
    height: "2.75rem"
    padding: "0.55rem 0.75rem"
  screen-frame:
    backgroundColor: "{colors.night-deep}"
    textColor: "{colors.paper}"
---

# Design System: Marcus Portfolio — Screening Room

## Overview

**Creative North Star: “The working screening bay”**

This route is an interface critique room: the authentic project artifact is the feature, while the portfolio shell names what is on screen and how it can be inspected. It opens on the actual, sandboxed People, compiled dashboard rather than a device mockup, fabricated case-study image, or promotional hero. The visible identity is exactly **Marcus Rafael B. Tiongson**, deliberately set across three lines: Marcus / Rafael / B. Tiongson. The shared archive supplies every title, description, disclosure, image, local demo, and verified public link.

Electric midnight is cut by a precise off-white projection field and small coral, mint, and sunflower registration signals. The signals identify focus, selection, and publication status; they never imply data or performance. Each displayed project keeps its own visual identity inside the screening frame.

**Key Characteristics:**
- A narrow identity-and-filmstrip rail displays the full owner name—Marcus / Rafael / B. Tiongson—and gives the live artifact most of the desktop width.
- The current project's name, type, publication boundary, and real action stay adjacent to its artifact.
- The filmstrip is text-led; it does not invent thumbnails for records without reviewed media.
- The same named archive links work without JavaScript; enhanced buttons add project switching.

## Colors

The surface uses a committed dark field with a warm display ground and three purposeful registration signals.

### Primary
- **Electric Midnight** (`night`): the full-page screening-room ground.
- **Deep Stage** (`night-deep`): the screen surround and quiet image ground.
- **Panel Midnight** (`night-panel`): project heading bars and active filmstrip state.

### Secondary
- **Signal Coral** (`coral`): the local-demo status band and small punctuation accents.
- **Projection Mint** (`mint`): concise artifact-kind labels and the current-screen marker.
- **Registration Sunflower** (`sunflower`): selected film number, high-salience disclosure, and focus-adjacent wayfinding.

### Neutral
- **Projection Paper** (`paper`): primary text against the dark field.
- **Stage Ink** (`ink`): dark text on the sunflower and coral bands.
- **Soft Mist** (`mist`): explanatory copy.
- **Quiet Mist** (`muted`): non-primary metadata.
- **Frame Rule** (`rule`): thin boundaries between work and stage.
- **Focus Light** (`focus`): visible keyboard focus against both dark and light surfaces.

**The Evidence-Signal Rule.** Accent colors mark navigation and disclosure only; they never encode a measurement, outcome, or live connection.

## Typography

**Display Font:** Self-hosted Barlow Condensed, weight 800 (with Barlow and sans-serif fallbacks). **Body Font:** Self-hosted Barlow at weights 400 and 600.

**Character:** Condensed display lettering gives the maker's name a strong vertical footprint without crowding the actual interface. Barlow keeps labels, status, and project context direct and readable. The route uses the repository's licensed local font files; it does not fetch remote fonts.

### Hierarchy
- **Display** (800, fluid 3.25–5.25rem, 0.78 line-height): “Marcus / Rafael / B. Tiongson” as three intentional block lines, and large link-only state titles.
- **Project title** (800, fluid 1.55–2.65rem, 0.98 line-height): the selected work's catalog title, held in the frame header.
- **Body** (400, 1rem, 1.5 line-height): summaries and context, constrained to roughly 72ch.
- **Label** (600, 0.72rem, 1.4 line-height, tracked uppercase for short strings): navigation, status, filmstrip metadata, and section labels. Longer descriptive copy remains sentence case.

## Layout

The desktop masthead carries the owner mark and six real world links. Below it, a two-column screening layout keeps a narrow identity / project rail beside a broad project frame. The outer frame begins immediately; there is no standard hero above the work. The active artifact receives the broadest and tallest area.

At 1120px the header drops its redundant route label. At 800px the rail and projection reflow into a vertical sequence; at 560px the project strip becomes a horizontally scrollable, keyboard-operable sequence above the full-width artifact. At 380px and below, the identity descriptor moves beneath the three-line name so “B. Tiongson” keeps a full-width line. The inner dashboard is responsive HTML at its actual viewport width, never a desktop screenshot scaled to a phone. A linear, server-rendered project archive remains visible if JavaScript or the catalog request is unavailable. The project count is generic in that fallback and derived from public catalog records when the enhanced strip loads.

## Elevation & Depth

The route is flat: no card shadows, gradients, or glass layers. Hairline rules and value shifts between the midnight field, panel, and artifact surround establish depth. The compiled dashboard retains its own surface and typography inside a sandboxed iframe; the portfolio does not repaint the project.

## Shapes

The form language is square and ruled. Thin frames and short registration bars replace rounded-card shells. A small diamond-like index pin and circular on-screen signal are the only recurring compact silhouettes. The active project is identified by filled color and `aria-pressed`, not color alone. Focus uses a high-contrast outline with offset.

## Components

### Project filmstrip
- One named row per public project, in catalog order, with its number, title, and catalog kind.
- The active row receives a sunflower number and panel ground. Buttons expose `aria-pressed`; arrow keys, Home, and End move through projects, while Enter and Space use native button behavior.
- The strip contains no generated screenshot thumbnails. It never invents a preview for Gaia Research or implies that an Open Graph image is live behavior.

### Screening frame
- A thin ruled surround holds an “On screen” metadata row and the selected project section.
- People, compiled is the first screen: the compiled local HTML runs in an iframe restricted to `allow-scripts allow-downloads` and uses `no-referrer`.
- A static project image is shown from its reviewed catalog media with its caption and disclosure. A live-only record receives an explicit no-local-image/no-embed state and its verified external link; external Gaia sites are never embedded.

### Artifact disclosure and actions
- The catalog disclosure sits directly between the project heading and the artifact. It is a high-contrast sunflower band with dark text.
- Local demo, full-size image, and public-site actions are separate, plainly named links. New tabs carry a screen-reader hint and `noopener noreferrer`.

### Navigation and fallback
- The masthead's six route links are real anchors; the current world receives a coral rule and the compact strip scrolls horizontally on phones.
- The server-rendered project index anchors to catalog-backed sections before JavaScript runs. JavaScript replaces the fallback index only after the public catalog loads successfully. Failed requests leave the static archive and generic “Project reel” label intact.

### Motion and accessibility
- Color and border feedback is brief and limited to controls. Reduced-motion preference removes transitions and smooth scrolling without hiding state changes.
- Landmarks, a skip link, visible focus, live selection status, descriptive image alternatives, iframe titles, and touch-sized project/actions support keyboard, touch, and assistive-technology use.

## Do's and Don'ts

### Do:
- **Do** let the shared public project catalog supply every title, kind, description, disclosure, asset, demo, and live link.
- **Do** keep the real interactive People screen visible first and clearly label its fictional data.
- **Do** show link-only projects as useful external-site states without inventing a preview.
- **Do** preserve the project's own identity inside the frame and reflow the archive at narrow widths.

### Don't:
- **Don't** copy pixels, text, or metrics from a generated development comp into published content.
- **Don't** embed the Gaia sites or publish the excluded Gaia Research hero artwork.
- **Don't** turn synthetic data into a real client or outcome claim.
- **Don't** add fake browser chrome, device mockups, gradients, glass, or an equal-card gallery in place of the working screen.
