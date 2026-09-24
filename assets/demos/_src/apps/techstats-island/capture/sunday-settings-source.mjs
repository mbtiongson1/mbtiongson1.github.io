/**
 * Sunday Inputs Settings read for TechStats.
 *
 * Live reports read the canonical settings bridge. Published reports never
 * call this module: their frozen PublishedSettings payload is authoritative.
 * The bridge returns a whole Rock page, so the JSON sentinel is the stable
 * transport rather than an assumed blank layout.
 */

const START = "SI-SETTINGS-JSON-START";
const END = "SI-SETTINGS-JSON-END";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseSettingsRows(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END, start + START.length);
  if (start < 0 || end < 0) throw new Error("Sunday Inputs Settings bridge did not answer.");
  const body = text.slice(start + START.length, end).trim();
  const rows = body ? JSON.parse(body) : [];
  const settingsRow = asArray(rows).find((row) => row?.Kind === "settings");
  if (!settingsRow || settingsRow.A !== "loaded" || !settingsRow.B) {
    throw new Error("Sunday Inputs Settings are unavailable.");
  }
  const settings = JSON.parse(settingsRow.B);
  if (!settings || typeof settings !== "object") throw new Error("Sunday Inputs Settings are malformed.");
  return settings;
}

export function visibleServiceNames(settings) {
  const names = settings?.scheduleNames;
  if (!Array.isArray(names)) return null;
  return names.map((name) => String(name || "").trim()).filter(Boolean);
}

export async function loadSundayInputsSettings({ campus = "MNL", fetchImpl = globalThis.fetch.bind(globalThis) } = {}) {
  const code = String(campus || "MNL").trim().toUpperCase();
  if (!["MNL", "BNE", "SEL"].includes(code)) return null;
  const params = new URLSearchParams({ action: "settings-load", campus: code });
  const response = await fetchImpl(`/sunday-inputs-action?${params}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "text/html", "X-Requested-With": "techstats" },
  });
  if (!response.ok) throw new Error(`Sunday Inputs Settings request failed (${response.status}).`);
  const settings = parseSettingsRows(await response.text());
  const scheduleNames = visibleServiceNames(settings);
  if (scheduleNames === null) throw new Error("Sunday Inputs Settings have no visible service list.");
  return {
    schema: Number(settings.schema) || 1,
    version: Number(settings.version) || 0,
    campus: code,
    venue: settings.venue || "all",
    scheduleNames,
    metricVisibility: settings.metricVisibility || null,
    metricOrder: settings.metricOrder || null,
  };
}
