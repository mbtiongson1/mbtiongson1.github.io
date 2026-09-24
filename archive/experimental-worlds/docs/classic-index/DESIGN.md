---
name: Marcus Rafael B. Tiongson — Classic Index
description: A bright, direct portfolio index that puts the real work and its context first.
colors:
  paper: "#f7f8f7"
  ink: "#17191d"
  body-ink: "#303840"
  muted: "#5b646d"
  rule: "#d4d9dd"
  soft: "#edf1f4"
  accent: "#1457b8"
  accent-dark: "#103f82"
  focus: "#1457b8"
  artifact-ground: "#10131a"
  on-accent: "#ffffff"
typography:
  display:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "clamp(1.35rem, 2vw, 1.9rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "clamp(1.8rem, 2.5vw, 2.7rem)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.11em"
components:
  owner-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.display}"
    height: "2.75rem"
  page-navigation-link:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.body}"
    height: "2.75rem"
  project-index-link:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "0.5rem 0.2rem 0.5rem 0"
    height: "3.45rem"
  artifact-action:
    backgroundColor: "transparent"
    textColor: "{colors.accent-dark}"
    typography: "{typography.body}"
    height: "2.75rem"
  artifact-disclosure:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.body-ink}"
    padding: "0.62rem 0.8rem"
  world-navigation-link:
    backgroundColor: "transparent"
    textColor: "{colors.body-ink}"
    height: "3rem"
---

# Design System: Marcus Rafael B. Tiongson — Classic Index

## Overview

**Creative North Star: “The open work index”**

Classic Index is a deliberately familiar portfolio: a visitor recognizes the owner, finds the lead interface, and reaches the complete archive through ordinary named links. The page stays bright and spacious so the actual prototype or reviewed project image—not a decorative portfolio motif—provides the strongest visual material. Project facts and disclosures remain sourced from the shared catalog.

The system is authored through precise Barlow typography, measured columns, fine rules, square image frames, and one blue navigation accent. It avoids rounded card stacks and hidden interactions while keeping the useful affordances of a standard portfolio.

**Key Characteristics:**
- Light neutral canvas with dark, highly legible copy and a single blue accent.
- A two-column opening: the actual featured artifact and a complete named project index.
- Archive entries remain inspectable, with each static, fictional, WIP, or external item described honestly.

## Colors

The palette uses cool paper and ink for reading, muted slate for secondary copy, and blue for navigation, links, and focus.

### Primary
- **Portfolio Blue** (`accent`): the active page link, project-index arrows, link emphasis, and keyboard focus.
- **Deep Link Blue** (`accent-dark`): persistent text-link color where the brighter accent would be less readable.

### Neutral
- **Cool Paper** (`paper`): the main page ground.
- **Deep Ink** (`ink`): owner name, project titles, and primary headings.
- **Working Ink** (`body-ink`): explanatory copy and text on the disclosure band.
- **Slate Text** (`muted`): labels, supporting descriptions, and secondary navigation.
- **Hairline Rule** (`rule`): section divisions and index rows.
- **Soft Field** (`soft`): the artifact disclosure band and quiet footer regions.
- **Artifact Ground** (`artifact-ground`): the frame around the dark interactive preview.
- **On-Accent White** (`on-accent`): text on the blue skip link and selected text.

**The One Accent Rule.** Reserve blue for wayfinding, link affordances, and focus; do not turn it into a background skin for project imagery.

## Typography

**Display Font:** Self-hosted Barlow at weight 600 (with Arial and sans-serif fallbacks).

**Body Font:** Self-hosted Barlow at weights 400 and 600. Both files are covered by the repository's Barlow OFL notice.

**Character:** Barlow keeps the owner name and project titles direct and readable without leaning on a fashionable display serif or a framework-default stack. Body copy stays open and ordinary; uppercase tracked labels are small and functional.

### Hierarchy
- **Display** (600, fluid 1.35–1.9rem, 1.1 line-height): the full owner name in the masthead.
- **Headline** (600, fluid 1.8–2.7rem, 1.08 line-height): the featured project title; archive titles step down at narrower widths.
- **Body** (400, 1rem, 1.55 line-height): project descriptions and about/contact context, with a 72ch maximum on long project copy.
- **Label** (600, 0.78rem, 1.3 line-height, tracked): short navigation and archive labels only.

## Layout

The masthead spans the page, with the owner's full name left and Work, About, and Contact links right. The opening uses a narrow project-index rail beside a wide feature column; CSS places the featured project first in the document order, while the desktop grid places the index at the left. The archive is an open two-column list separated by whitespace and top rules, not a grid of nested cards.

At 820px and below, the lead artifact comes first and the complete project index becomes a horizontally scrollable, touch-friendly row. The archive becomes one column at 600px, while the masthead, about/contact sections, and six-world footer navigation reflow to fit the viewport. Images retain their catalog dimensions and natural ratio. Internal project links remain ordinary anchors with no JavaScript dependency.

## Elevation & Depth

The route is flat: there are no shadows or floating panels. Thin rules, whitespace, and the tonal shift behind the disclosure and footer distinguish sections. The embedded demo keeps its own interface and dark ground inside a sandboxed iframe; the portfolio does not restyle or imply a live connection.

## Shapes

The system uses square-edged dividers and frames. Project images sit inside a thin rule and remain at their natural aspect ratio. The small rotated-square index marker is a wayfinding detail, not a standalone icon tile. There is no rounded-card scale.

## Components

### Masthead and page navigation
- The owner link preserves the full name “Marcus Rafael B. Tiongson” and has a minimum 44px target.
- Work, About, and Contact link to real sections. The active Work state uses blue text and a short underline; focus remains visible independently of hover.

### Project index
- Every entry comes from `data/projects.json`, with the exact catalog title and kind.
- Desktop links are ruled rows with a small outlined marker and an arrow. On narrow screens, the rows become a horizontally navigable strip; links still jump to server-rendered project sections with JavaScript disabled.
- Link rows meet or exceed 44px in height. Hover and keyboard focus fill the marker and move the arrow slightly; reduced-motion preferences remove the motion.

### Featured artifact and disclosure
- The lead catalog record appears in the large feature column with its exact title, kind, summary, context, and disclosure.
- The local prototype is rendered as the actual compiled HTML in the shared builder's sandboxed iframe. It is not represented by a generated screenshot.
- The disclosure is directly adjacent to the artifact and remains distinct from the demo's own interface band.

### Archive project sections
- The shared `PROJECT_REST` token renders every remaining public record. Static images include intrinsic width, height, descriptive alt text, and the adjacent catalog caption.
- Link-only Gaia Research stays an explicit external destination with no local image or embed. Gaia Skill Tree's local Open Graph art is labeled as static illustration, not a live capture.
- Primary actions are text links with a small inline SVG arrow and a minimum 44px target.

### Six-world navigation
- The footer renders the shared `{{WORLD_NAV}}` token, including the current route and every sibling world. It becomes a two-column grid on mobile and stays a conventional link list.

## Do's and Don'ts

### Do:
- **Do** source all six titles, kinds, descriptions, artifacts, and disclosures from the shared project catalog.
- **Do** make the project index, Work/About/Contact links, and six-world navigation work as named anchors or regular links without JavaScript.
- **Do** keep static, fictional, WIP, sample-data, and external-site disclosures beside their corresponding artifact.
- **Do** keep every actionable link at least 44px high, with visible keyboard focus and reduced-motion support.

### Don't:
- **Don't** use the generated decision comp as portfolio evidence or copy, crop, trace, or recreate its pixels and claims.
- **Don't** invent project categories, tags, metrics, client outcomes, or local previews for external-only records.
- **Don't** add search/filter controls without a clear catalog-backed implementation, or add a second project metadata source.
- **Don't** import remote fonts, style other worlds, or turn the shared project archive into a single global visual skin.
