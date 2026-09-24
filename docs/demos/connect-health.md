# Connect Health local demo

## Source and provenance

This portfolio artifact is an authored, offline prototype. Its fixture was derived only from the allowed fictional payload at `/Users/marcotiongson/rock-dashboards/apps/connect-field-island/capture/bundle-fictional.json`. The visual direction was checked against the allowed Connect shell and stylesheet, and the health thresholds were translated from the authored derived model in the allowed source module. No production payload, snapshot, route, query, group reference, parent name, leader name, address, or contact field is shipped.

The shipped page contains a 60-group sanitized subset of that fixture inline. Group labels are generated as `Fictional group 001` and onward; campus and place labels are replaced with `Campus 01` and `Locality 01` forms. Six weekly attendance states are retained as local fake data so the dashboard can recompute health, pressure, totals, and rhythm on every interaction.

## Offline boundary

- `index.html` holds the complete sanitized fixture in an inline JSON script block.
- `connect-health.js` performs no data loading and makes no network requests. There is no fetch, map tile, analytics, export, or drill-through behavior.
- `connect-health.css` and the four font files are the only referenced assets, all through local relative paths.
- The visible disclosure at the dashboard is intentionally repeated in the page footer: `FICTIONAL LOCAL DATA · INTERACTIVE PROTOTYPE · NOT CONNECTED TO ROCK`.

## Feature behavior

- Campus, health, age, meeting mode, locality, and day filters update the visible groups and recompute the summary metrics, signal board, locality lattice, pressure rail, rhythm pockets, queue, and classic tables.
- Creative reading presents the mission-control signal board, field strip, locality plotboard, leader-load plot, rhythm grid, and intervention queue.
- Classic register genuinely swaps the composition to a quieter tabular register over the same filtered dataset.
- Clicking a signal summary filters by that health band. Clicking a field mark, pressure row, queue row, or classic group row focuses one fictional group. Locality, day, and classic locality controls focus a slice. The scope bar and `Reset` action provide a clear way back.
- Native buttons and selects provide a tab path, visible focus, `aria-pressed` state, live announcements, Escape-to-clear for group focus, and arrow/Home/End movement through the field strip.
- CSS disables transitions and animations under `prefers-reduced-motion: reduce`; the information and state changes remain available.

## Fonts

The demo reuses the portfolio's local Favor fonts without copying them:

- `../people-compiled/font-favorvetica-normal-normal.otf`
- `../people-compiled/font-favorvetica-bold-normal.otf`
- `../people-compiled/font-favor-sans-normal-normal.otf`
- `../people-compiled/font-favor-sans-bold-normal.otf`

These paths are relative to `assets/demos/connect-health/connect-health.css`.

## Limitations

This is not a complete operating dashboard. It intentionally omits person-level details, real links, exact geography, live freshness, retention, progression, demand, exports, and map coordinates. “Healthy” means healthy on the measured leadership and attendance signals in this fixture; unavailable or unmeasured concepts are not converted into zeros. The fixture is a representative subset rather than the full fictional payload, and all labels are safe portfolio-facing replacements.
