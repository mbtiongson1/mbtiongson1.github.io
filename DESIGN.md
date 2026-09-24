---
name: mbtiongson1 Portfolio — Screening Room
description: A single portfolio experience that lets the work lead and keeps the founder, product mechanisms, and artifact boundaries in view.
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
    fontFamily: "Barlow Condensed, sans-serif"
    fontWeight: 800
    lineHeight: 0.9
  body:
    fontFamily: "Barlow, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow, Arial, sans-serif"
    fontWeight: 600
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    usage: "Commands, identifiers, and measured sample values only"
components:
  screening-frame:
    backgroundColor: "{colors.night-deep}"
    border: "1px solid {colors.rule}"
  fictional-disclosure:
    backgroundColor: "{colors.sunflower}"
    textColor: "{colors.ink}"
    padding: "0.65rem 1rem"
  project-action:
    minHeight: "2.75rem"
    border: "1px solid {colors.rule}"
    textColor: "{colors.paper}"
---

# Design System: mbtiongson1 Portfolio — Screening Room

## Overview

**Creative North Star: “The working screening room.”**

The site is a portfolio, not a selector between design experiments. A dark, ruled screening frame gives each piece enough room to be inspected while the index keeps the whole body of work in reach. The selected world is Screening Room; five other visual experiments remain source-only and are disabled from the build. The content leads: the first feature is Gaia Skill Tree, followed by dashboards, research, agent tooling, applied ML, and visual studies. A full Gaia Skill Tree case study explains the product and the creator's documented contribution.

**Physical scene:** a maker and a hiring collaborator reviewing real work together in a dim studio; the projected surface stays legible, while the neighboring index keeps context close. The night ground belongs to the screening room, not to a generic “tech dark mode.”

**Key characteristics:**
- The `mbtiongson1` wordmark replaces the old MRBT monogram.
- The homepage opens with one named project reel and one broad artifact stage; it does not offer six competing visual worlds.
- Project actions, source links, creator roles, and disclosures stay adjacent to the current artifact.
- The founder story and “Beyond the browser” section show why the work exists and how the research labs, agent runtime, integration architecture, and terminal tool behave.
- The dashboard embeds are local-only; Gaia products open at their real public URLs rather than inside external iframes.

## Colors

### Primary
- **Night** (`night`, `#081818`): the page field and the room around the work.
- **Night Deep** (`night-deep`, `#061113`): projection surfaces and code exhibits.
- **Night Panel** (`night-panel`, `#111c20`): screen furniture, selection state, and bounded panels.
- **Paper** (`paper`, `#f5f0ea`): display type and primary reading ink.

### Signals
- **Sunflower** (`sunflower`, `#f4d34f`): primary action, keyboard focus on dark grounds, and explicit disclosure on its own panel.
- **Mint** (`mint`, `#65dfb1`): active signal and secondary action.
- **Coral** (`coral`, `#ff684f`): interruption, separators, and a restrained emphasis.

### Supporting neutrals
- **Mist** (`mist`, `#c0ceca`): long-form supporting text.
- **Muted** (`muted`, `#9aaba8`): short metadata and captions only.
- **Rule** (`rule`, `#526462`): thin structure between sections and frames.
- **Ink** (`ink`, `#101b1d`): text on sunflower/coral light surfaces.
- **Focus** (`focus`, `#fff0a3`): visible focus ring over the dark surface.

**Boundary rule:** synthetic, sample, WIP, and static-only status uses explicit adjacent text. Semantic signal colors inside an embedded dashboard remain the artifact's own meanings; portfolio chrome does not recolor them.

## Typography

**Display:** self-hosted Barlow Condensed 800. **Body:** self-hosted Barlow 400/600. Both are bundled under `assets/fonts/` with OFL notices. The same system is used by the flagship case study.

**Code and measurement:** a system monospace stack (`ui-monospace`, SFMono, Menlo, Consolas) is reserved for commands, identifiers, and sample telemetry. It is not a second display voice.

### Hierarchy
- The identity and section headlines are large, condensed, and sentence-case or short uppercase phrases; long explanations stay in Barlow body text.
- Project names are set in the display face; summaries, contribution scopes, captions, and disclosures stay in the body face.
- Small uppercase labels are short and functional. Longer explanations are never letter-spaced or forced into all caps.
- The dashboard iframe keeps its bundled Favor typography rather than inheriting portfolio fonts.

## Layout

The header identifies `mbtiongson1` and links within the one portfolio. The opening grid places the full owner name and a horizontal/vertical project filmstrip on the left, with the selected project in a large screening frame at the right. Gaia Skill Tree is the default feature. The “Founder story” follows with the owner-authored origin statement; “Beyond the browser” contains interactive explainers for Gaia Research's live browser labs, Skill Heaven, Rock MCP, and macdash; the complete project archive remains available as a server-rendered fallback.

At narrow widths, the project rail moves above the full-width stage and becomes a horizontal scroll-snap strip. Story and systems sections stack vertically. The Gaia case study reuses the palette and frame language while changing its composition for long-form reading. Focus targets remain keyboard reachable.

## Elevation, shape, and motion

The page is largely flat. Thin rules, value contrast, and dark panel fields establish hierarchy; shadows are not used as a generic card treatment. Borders are square and restrained. The featured project uses one same-document View Transition when available; the update is immediate when unsupported and motion is disabled for `prefers-reduced-motion: reduce`. All content and controls remain visible and useful without animation.

## Components

### Screening frame and project filmstrip
- The server-rendered reel contains every reviewed public record and its disclosure. JavaScript enhances it into native buttons with `aria-pressed`, focus, and status announcements.
- Project selection changes the artifact area without changing its source facts. Keyboard arrows/Home/End move through the reel; the static anchor list is retained when JavaScript is unavailable.
- Local demos are sandboxed with `allow-scripts allow-downloads`, not `allow-same-origin`. A dashboard's visible disclosure repeats inside the iframe.

### “Beyond the browser” explainers
- Gaia Research selects between two documented browser labs and opens the actual public experiment; the portfolio does not embed either one.
- Skill Heaven selects a documented entropy rung and explains its behavior.
- Rock MCP switches between an offline read-only request path and a scoped/authorized write path. It does not call Rock.
- macdash advances through fictional sample frames. It never reads the portfolio visitor's machine.

### Gaia Skill Tree case study
- The case study explains attribution, evidence grades, ranks, graph/fusion structure, CLI, API, badges, and source scope using public repository facts.
- Authored diagrams are labeled as explanations, not live data. The Open Graph art is captioned as static identity artwork, never as an interface capture.
- Its feature walkthrough retains all four content panels without JavaScript; when enhanced, native buttons expose the selected panel with keyboard operation and a live status.

## Do's and Don'ts

### Do
- Let actual work, contribution scope, and artifact status lead.
- Keep the Gaia Skill Tree flagship first and the five alternate worlds disabled but retained in source.
- Use local fictional data for dashboard demos and load the required local fonts.
- Prefer public product/source links over embedding third-party Gaia sites.
- Keep keyboard focus, reduced motion, semantic fallbacks, and adjacent provenance visible.

### Don't
- Do not restore the six-world selector or give the watershed study flagship prominence.
- Do not call a local dashboard live, connect it to production, expose real Rock data, or enable drill-through URLs.
- Do not present an OG asset, a generated comp, or an authored explanation as a screenshot of live behavior.
- Do not claim benchmarks, customer outcomes, or sole authorship absent source evidence.
