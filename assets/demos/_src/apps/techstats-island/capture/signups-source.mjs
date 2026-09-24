/**
 * Reads the same live data as /signups-index (page 1061 / block 1820,
 * `rock-pages` `pages/internal/signups/live_signups_board/`), rather than
 * recomputing any of its ~1500-line counting SQL here. That page embeds its
 * already-computed rows as a JSON island:
 *   <script type="application/json" id="signups-index-json">...</script>
 * This is a same-origin authenticated page fetch (the viewer's own Rock
 * session cookie), not a REST call — /signups-index is a Lava page, not an
 * API route.
 */

const JSON_ISLAND_PATTERN = /<script[^>]*id="signups-index-json"[^>]*>([\s\S]*?)<\/script>/;

// Per-SourceKind query param name for /form-insights, mirroring
// signups-index.lava's `rowParam` assign (Task 2, lines ~430-436).
const ROW_PARAM_BY_SOURCE_KIND = {
  FormBuilder: "WorkflowTypeId",
  SignUpGroup: "GroupId",
  EventRegistration: "RegistrationInstanceId",
  Schedule: "ScheduleId",
};

function truthy(value) {
  return value === true || value === 1 || value === "1" || value === "True" || value === "true";
}

// Live-verified against staging /signups-index on 2026-08-31: SourceId,
// GroupId, and ScheduleId all come through as JS `number` today. Still
// coerce numeric strings defensively -- the lava's own `row.SourceId > 0`
// check coerces automatically (Liquid), so a future ToJSON shape that
// stringifies numbers must not silently zero out every href.
function parsePositiveId(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

/**
 * Pure derivation of the two link fields, mirroring signups-index.lava's
 * `detailHref` / `publicHref` assigns (lines ~443-500). Exported so it can be
 * unit-tested without a fetch.
 */
export function deriveSignupLinks(row) {
  const sourceKind = row?.SourceKind ?? null;
  const sourceId = parsePositiveId(row?.SourceId);
  const rowParam = ROW_PARAM_BY_SOURCE_KIND[sourceKind] || "";

  const href = rowParam !== "" && sourceId !== null ? `/form-insights?${rowParam}=${sourceId}` : "";

  let publicHref = "";
  if (sourceKind === "FormBuilder" && row?.WorkflowTypeGuid != null) {
    publicHref = `/ExternalWorkflowEntry/${row.WorkflowTypeGuid}`;
  } else if (sourceKind === "EventRegistration" && sourceId !== null) {
    publicHref = `/Registration?RegistrationInstanceId=${sourceId}`;
  } else if (sourceKind === "SignUpGroup") {
    // The lava's fully-resolved path hashes GroupId/LocationId/ScheduleId via
    // Rock's IdHasher, which the JSON island does not expose (non_goal: no
    // hashed-IdKey public URL here) -- always use the lava's own fallback.
    publicHref = "/signups";
  }
  // Schedule, and any unrecognized/absent SourceKind, deliberately leave
  // publicHref unset -- same decision as the lava (a bare Schedule is not
  // itself a bookable public entry point).

  return { href, publicHref };
}

export async function loadLiveSignups({ fetchImpl = globalThis.fetch.bind(globalThis), campus = "MNL" } = {}) {
  const query = campus ? `?signupsCampus=${encodeURIComponent(campus)}` : "";
  const response = await fetchImpl(`/signups-index${query}`, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error(`Live signups request failed (${response.status}).`);
  const html = await response.text();
  const match = JSON_ISLAND_PATTERN.exec(html);
  if (!match) throw new Error("Live signups JSON island not found.");

  const rows = JSON.parse(match[1]);
  if (!Array.isArray(rows)) throw new Error("Live signups JSON island was not an array.");

  return rows
    .filter((row) => truthy(row?.FilterTracked))
    .map((row) => {
      const { href, publicHref } = deriveSignupLinks(row);
      return {
        name: String(row.Label ?? ""),
        count: typeof row.ThisWeek === "number" ? row.ThisWeek : null,
        prev: typeof row.LastWeek === "number" ? row.LastWeek : null,
        delta: typeof row.Delta === "number" ? row.Delta : null,
        state: "active",
        dates: row.EventDateText ? String(row.EventDateText) : "",
        notes: row.Notes ? String(row.Notes) : "",
        href,
        publicHref,
      };
    })
    .filter((row) => row.name);
}
