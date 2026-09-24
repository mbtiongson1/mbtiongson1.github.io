# Add a project once

`data/projects.json` is the single reviewed project archive. The Screening Room reel, no-JavaScript project notes, and case-study references draw from it. Do not create a parallel catalog in page JavaScript.

## 1. Review the publication boundary

Confirm the work may be shown publicly. Remove private names, credentials, personal data, production payloads, and unreviewed source. An interactive dashboard demo must use local fictional data only and must not connect to Rock or another live system. Keep `fictional`, `sample`, `WIP`, and static-capture boundaries immediately beside the artifact. Record raster provenance in `data/asset-provenance.json` and in the media sidecar; never ship generated decision comps as evidence.

## 2. Record the project

```json
{
  "id": "example-project",
  "title": "Project title",
  "kind": "Tool / research system / interface study",
  "summary": "One factual sentence about what can be inspected or tried.",
  "context": "How it was made and what the artifact does not prove.",
  "disclosure": "A concise status or data boundary displayed beside the artifact.",
  "role": "Optional, evidence-backed contribution statement.",
  "visibility": "public",
  "live": null,
  "links": [
    {
      "url": "https://example.org/source",
      "label": "Read the public source",
      "verifiedAt": "2026-09-24"
    }
  ],
  "caseStudy": null,
  "demo": null,
  "media": null
}
```

At least one of `live`, `links`, `caseStudy`, `demo`, or `media` must be present. `live` is a verified public product URL. `links` can carry a repository, paper, public lab, or related source; verify each HTTPS URL and date it. `caseStudy` is a local route such as `/work/gaia-skill-tree/`. Do not claim a local demo is the live product.

A local demo uses:

```json
"demo": {
  "type": "local-html",
  "url": "/assets/demos/example-project/index.html",
  "label": "Open interactive local demo",
  "frameLabel": "FICTIONAL LOCAL DATA / INTERACTIVE PROTOTYPE"
}
```

The builder embeds local demos in a sandboxed iframe (`allow-scripts allow-downloads`, without `allow-same-origin`). Keep demo data self-contained and offline: no live APIs, Rock paths, production endpoints, analytics, or external network requests. Load licensed fonts from local files. The visible `frameLabel` and adjacent disclosure must make sample status unmistakable.

A raster record needs `src`, intrinsic `width` and `height`, descriptive `alt`, and an accurate `caption`. The Gaia Skill Tree Open Graph art is not a screenshot. The Gaia Research hero contains unverified metrics and remains excluded from the portfolio media catalog.

Array order is editorial: the first project is the default Screening Room feature. Keep Gaia Skill Tree first unless the owner explicitly reorders the flagship.

## 3. Build and verify

```sh
npm run build
npm run check
npm run check -- --release
```

The builder emits the portfolio at `/`, the flagship case study at `/work/gaia-skill-tree/`, and only files used by the active Screening Room. It keeps five other world source trees in the repo but does not publish their routes, styles, or scripts. The project archive is emitted at `/data/projects.json` for the filmstrip enhancement; the server-rendered HTML remains useful if JavaScript is off.

The check verifies disclosures, local links, case-study output, media provenance, sandboxing, fake-data demo boundaries, and that disabled world routes do not appear in `dist/`. Preview `dist/` with `python3 -m http.server 8000 --directory dist`; inspect desktop and mobile in the already-authorized browser space before publishing. Do not access production systems to QA a portfolio demo.
