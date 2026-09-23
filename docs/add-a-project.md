# Add a project once

The source of truth is `data/projects.json`. The build writes semantic HTML for the lobby and Field Atlas from that file; future worlds can use the same data in their own template or read `/data/projects.json` on the static site. Do **not** author a second project list in a world.

## 1. Review publication boundaries

Confirm you own or may publish every file. Remove names, credentials, private contact details, production data, and unreviewed source. A prototype is not a live integration. Keep fictional/sample/WIP status visible **beside the artifact**, not only in a footer or alt text. Add the original filename and source path to `data/asset-provenance.json`. For a WebP/PNG raster, record its source in an adjacent provenance sidecar using `impeccable embed-prompt <asset> --prompt 'Sourced from ...'`; `impeccable embed-prompt --scan assets/media assets/demos` must report zero missing. Sidecar fallback is normal for WebP.

## 2. Add one record

Copy this shape and replace the values. `id` is a permanent URL fragment (`lowercase-hyphenated`); do not rename it after links circulate.

```json
{
  "id": "example-project",
  "title": "Project title",
  "kind": "Interface study",
  "summary": "One factual sentence about what can be seen or tried.",
  "context": "How this artifact was made and what it does not prove.",
  "disclosure": "WIP / fictional-data prototype. No live or production data.",
  "visibility": "public",
  "live": {
    "url": "https://example.org/verified-public-page",
    "label": "Visit the public site",
    "verifiedAt": "2026-09-24"
  },
  "demo": {
    "type": "local-html",
    "url": "/assets/demos/example-project/index.html",
    "label": "Open the interactive prototype",
    "previewAnchor": "optional-id-inside-demo"
  },
  "media": {
    "src": "/assets/media/example-project.webp",
    "width": 1600,
    "height": 1000,
    "alt": "Specific description of the visible interface or image, without a claim it cannot support.",
    "caption": "What this image actually shows, including synthetic/WIP status if applicable."
  }
}
```

At least one of `demo` and `media` is required; either may be `null`. `live` is optional and may be `null`; only add a public HTTPS URL after checking it in a browser, record the check date in `verifiedAt`, and do not infer active features or outcomes from the link. None of the current records has a verified live URL. Only `visibility: "public"` records are accepted by the build. Keep drafts outside this catalog until reviewed. `demo.type` currently supports only `local-html`: a copied static artifact whose URL starts at this site root. `previewAnchor` optionally scrolls the **embedded preview** to a meaningful section; the full-size launch still opens the page from the top. Do not put a live endpoint, private app, or external embed in `demo.url`. For a public external site, use `live` after verification; do not mislabel it as a local demo.

## 3. Prepare media

Aim for a source image at least **1600px wide** for large interface captures; preserve its natural aspect ratio and enter its exact width and height. Optimize to WebP around quality 80–85, inspect text legibility at displayed size, and let visitors open the full-size image. Never crop away a source disclosure without repeating it adjacent to the image. Alt text describes visible content, not marketing claims; a decorative duplicate would use empty alt, but project imagery here is informative. Caption gives source/context and distinguishes screenshots from functioning software. `disclosure` is always rendered directly next to the artifact, including an iframe. Keep downloaded fonts' licenses with them.

## 4. Build and verify

Run `npm run build && npm run check`, then preview `dist/` with `python3 -m http.server 8000 --directory dist`. Check `/`, `/worlds/field-atlas/#example-project`, the full-size asset, and any local HTML demo. The build is static: no server process or secret is deployed. `scripts/build.mjs` validates media paths, required descriptions/disclosures, public visibility, and each demo's local URL. `scripts/check.mjs` validates generated routes, six-way navigation, disclosures, demo boundaries, and raster provenance.

## How the six worlds integrate

`data/worlds.json` is the route registry; all six slugs and statuses are final. Every page must link the other five worlds and use the shared project catalog. For an incoming world, replace its existing placeholder at `src/pages/worlds/<slug>.html` and add its own `src/styles/<slug>.css` and optional `src/scripts/<slug>.js`; the build automatically assembles them. See the exact route map in `docs/worlds.md`. Tokens available to its template: `{{WORLD_NAV}}`, `{{WORLD_NAME}}`, `{{WORLD_DESCRIPTION}}`, `{{PROJECT_INDEX}}`, `{{PROJECT_LEAD}}`, `{{PROJECT_REST}}`, and `{{PROJECT_LINKS}}`. Those generic render helpers are optional; a world with a different structure can use a dedicated client script reading `/data/projects.json`, while retaining a named static fallback from the template tokens. The five incoming world workers do not need to edit the shared build script. Give the new world its own stylesheet, interaction, semantics, responsive behavior, and no-JavaScript route to the work. Do not apply Field Atlas styling globally or turn the six experiences into theme variants.
