# Gaia Skill Tree case study

## Scope

The route is mounted at `/work/gaia-skill-tree/` and keeps the existing Screening Room system: electric midnight, off-white type, coral/mint/sunflower signal accents, square ruled frames, and self-hosted Barlow fonts. It is a case study and explanation of the public Gaia product, not a second Gaia interface and not a live registry surface.

## Factual sources consulted

- `/Users/marcotiongson/gaia-skill-tree/README.md` — product positioning, the owner-authored origin sentence, documented evidence types and grades, stars/ranks, Trust Magnitude, fusion example, CLI commands, static API, named skills, badges, Trust Ledger, MCP/agent-plugin notes, and contributor table.
- `https://gaiaskilltree.com/` — genuine public product link supplied by the brief; kept as an external link only.
- `https://github.com/gaia-research/gaia-skill-tree` — genuine public source link supplied by the brief.
- `assets/media/gaia-skill-tree-og.webp.json` — provenance for the local owner-provided Open Graph illustration.
- `DESIGN.md`, `src/pages/worlds/screening-room.html`, and `src/styles/screening-room.css` — the portfolio shell, palette, type, material, accessibility conventions, and disclosure language to preserve.

## Role boundary

The source credits `@mbtiongson1` as **Creator and maintainer: graph design, CLI, MCP server, curation pipeline**. The case study names that documented scope and explicitly keeps the project collaborative; it does not claim Marcus built Gaia alone. The exact founder-story seed is reproduced from the README: “I built this because skills should be attributed to the people who proved them. Permanently, not just until the repo goes private.”

## Product facts used

Gaia is described by its README as an evidence-backed AI-agent skill registry, not a marketplace or installer. The page explains only documented elements: contributor attribution; evidence types and grades; stars and named ranks; Trust Magnitude; the skill/fusion graph; named skills; the `init`, `scan`, `push`, and `skills` CLI paths; the static read-only registry API; badges; and the Trust Ledger/leaderboard. The fusion example and rank labels are copied from the README. No live counts, ratings, usage, impact, performance, customer, or outcome claims are used.

The supplied local image is captioned as an **Open Graph illustration**, not an interface capture. The page does not fetch the public API, embed the product, or present local authored diagrams as live registry data. External product, source, API, named-skill, and ledger URLs remain ordinary links.

## Interaction contract

- The feature walkthrough is server-rendered HTML. All four chapters and their explanatory content exist in the document before JavaScript runs.
- The control group is hidden in the HTML fallback. With JavaScript unavailable, every chapter remains visible in reading order and a `<noscript>` note explains the fallback.
- When JavaScript loads, it reveals semantic `<button type="button">` controls. Each control uses `aria-pressed`, `aria-controls`, a visible focus ring, and a status announcement. The selected chapter is shown and other chapters receive `hidden` and `aria-hidden="true"`.
- Click/tap selects a chapter. Arrow Left/Right and Arrow Up/Down move through chapters, Home/End jump to the first/last chapter, and focus follows keyboard movement. Buttons remain native tab stops.
- `prefers-reduced-motion: reduce` disables transition and entrance motion; the page remains fully readable and the walkthrough does not depend on animation.
- No interaction depends on a remote request, authentication, iframe, or mutable live data.

## Limitations

The local case study can explain the documented product and show the owner-provided identity artwork, but it cannot stand in for Gaia's live registry or 3D exploration. Visitors should use the external product and source links for current behavior and registry data.
