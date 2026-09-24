// Canonical Sunday service schedule for the Manila campus, read straight off
// Rock's Schedule/Category tree -- the same tree apps/sunday_inputs resolves
// for its "Service Times" category (see apps/sunday_inputs/config/metric_registry.py
// and apps/sunday_inputs/blocks/sunday-inputs-action-bridge.lava's "schedule-options"
// SQL action, which this mirrors). Resolved by Guid only, never by category
// Name -- staff have renamed these on prod before, and a Name-based lookup
// silently returns nothing when that happens.
//
// This is a convenience default only. TechStats keeps ServiceTimes editable
// per report (the "Sunday Service Times" popover) so an editor can correct or
// override whatever this returns -- a canceled/combined service, a schedule
// mid-migration, or simply Rock being briefly unreachable.

const MANILA_VENUE_CATEGORY_GUIDS = [
  "5cdecc60-4ed0-4157-8f9e-4426c9ac6620", // Crowne
  "aa30a8fa-6239-4c7f-8ce6-9b3ed5fc0487", // Podium
  "9c5ac825-dad3-45eb-aac4-6334eba7fe7f", // Metrotent
];

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function getJson(fetchImpl, path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const response = await fetchImpl(`/api/${path}${query ? `?${query}` : ""}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Service times request failed (${response.status}).`);
  return response.json();
}

function isSundaySchedule(schedule) {
  return /BYDAY=[^;\n]*SU/i.test(String(schedule?.iCalendarContent || ""));
}

function isEffectiveOn(schedule, isoDate) {
  const start = schedule?.EffectiveStartDate ? String(schedule.EffectiveStartDate).slice(0, 10) : null;
  const end = schedule?.EffectiveEndDate ? String(schedule.EffectiveEndDate).slice(0, 10) : null;
  if (start && isoDate < start) return false;
  if (end && isoDate > end) return false;
  return true;
}

// iCalendarContent carries the start time as DTSTART;TZID=...:YYYYMMDDTHHmmss
// (RRULE only encodes the recurrence day, not the time-of-day).
function startMinutes(schedule) {
  const match = /DTSTART[^:]*:\d{8}T(\d{2})(\d{2})/.exec(String(schedule?.iCalendarContent || ""));
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

function scheduleLabel(schedule) {
  const name = String(schedule?.Name || "").trim();
  return name || `Schedule #${schedule?.Id ?? ""}`;
}

// Returns { times, count }; on any failure (network, auth, empty result)
// returns { times: [], count: 0 } so a Rock hiccup never blocks report
// editing -- callers treat this as a default, not a dependency.
export async function fetchCanonicalServiceTimes(reportDate, { fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  try {
    const categoryFilter = MANILA_VENUE_CATEGORY_GUIDS
      .map((guid) => `Category/Guid eq guid'${guid}'`)
      .join(" or ");
    const rows = await getJson(fetchImpl, "Schedules", {
      $filter: `IsActive eq true and (${categoryFilter})`,
      $select: "Id,Name,iCalendarContent,EffectiveStartDate,EffectiveEndDate",
      $expand: "Category",
    });

    const isoDate = String(reportDate || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    const schedules = asArray(rows)
      .filter((schedule) => isSundaySchedule(schedule) && isEffectiveOn(schedule, isoDate))
      .sort((a, b) => startMinutes(a) - startMinutes(b));

    const times = [];
    for (const schedule of schedules) {
      const label = scheduleLabel(schedule);
      if (label && !times.includes(label)) times.push(label);
    }
    return { times, count: times.length };
  } catch {
    return { times: [], count: 0 };
  }
}
