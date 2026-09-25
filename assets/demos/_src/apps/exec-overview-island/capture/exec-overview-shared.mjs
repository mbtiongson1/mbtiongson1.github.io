/**
 * Exec Overview Mini — shared data/model constants.
 *
 * This module is the single source of truth for the category orders, colors,
 * labels, and connection targets that both the full Exec Overview and the
 * Page 12 mini use. Duplicating any of these into the mini boot would violate
 * the #664 parity contract — same queries, same aggregation, same category
 * order, same colors, same labels, same handling of Unknown.
 *
 * The full exec-overview-boot.mjs declares these inline (they predate this
 * file). The mini imports them from here. A future refactor can point the full
 * boot here too, but that is not this ticket's scope.
 */

// Age bands — category order for donut arcs and bar rows
export const AGES = ["kids", "youth", "youngAdults", "adults", "seasoned", "unknown"];

export const AGE_LABELS = {
  kids: "Kids 0–12",
  youth: "Youth 13–17",
  youngAdults: "Young Adults 18–25",
  adults: "Adults",
  seasoned: "Seasoned",
  unknown: "Unknown Age",
};

export const AGE_COLORS = {
  kids: "var(--age-kids)",
  youth: "var(--age-youth)",
  youngAdults: "var(--age-young-adults)",
  adults: "var(--age-adults)",
  seasoned: "var(--age-seasoned)",
  unknown: "var(--state-unknown)",
};

// Connection status
export const CONNECTION_ORDER = ["Crowd", "Core", "New", "Leader"];
export const CONNECTION_COLORS = {
  Crowd: "var(--cohort-crowd)",
  Core: "var(--cohort-core)",
  New: "var(--cohort-new)",
  Leader: "var(--cohort-leader)",
};
export const CONNECTION_TARGETS = { Leader: 15, Core: 35, Crowd: 35, New: 15 };

// Gender
export const GENDER_ORDER = ["Women", "Men", "Unknown"];
export const GENDER_COLORS = {
  Women: "var(--accent)",
  Men: "var(--secondary)",
  Unknown: "var(--state-unknown)",
};

// Campus
export const CAMPUS_ORDER = ["MNL", "BNE", "SEL", "UNASSIGNED"];
export const CAMPUS_COLORS = {
  MNL: "var(--accent)",
  BNE: "var(--secondary)",
  SEL: "var(--cohort-crowd)",
  UNASSIGNED: "var(--muted-ink)",
};
export const CAMPUS_LABELS = {
  MNL: "Manila (MNL)",
  BNE: "Brisbane (BNE)",
  SEL: "Seoul (SEL)",
  ALL: "All Campuses (Global)",
  UNASSIGNED: "Unassigned",
};

export const CAMPUSES = new Set(["MNL", "BNE", "SEL", "ALL"]);
export const GENDERS = new Set(["women", "men"]);

// Helpers — exact parity with exec-overview-boot.mjs
export const number = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null;
export const format = (value) => Number.isFinite(value) ? Math.round(value).toLocaleString() : "—";
export const percent = (part, whole) => whole > 0 ? (part * 100 / whole) : null;
export const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));

/**
 * Parse a demographics response from the JSON island payload.
 */
export function readResponse(value, queryId, requiredFields) {
  if (!value || value.status !== "ok" || value.queryId !== queryId || !Array.isArray(value.rows)) {
    return { available: false, rows: [] };
  }
  const rows = [];
  for (const row of value.rows) {
    if (!row || typeof row !== "object" || requiredFields.some((field) => !(field in row))) {
      return { available: false, rows: [] };
    }
    rows.push(row);
  }
  return { available: true, rows };
}

/**
 * Aggregate rows by a field into a Map of name → count.
 */
export function aggregate(rows, field) {
  const map = new Map();
  for (const row of rows) {
    const count = number(row.uniquePeople);
    if (count === null) continue;
    const key = String(row[field] ?? "Unknown");
    map.set(key, (map.get(key) || 0) + count);
  }
  return map;
}

/**
 * Convert an aggregated Map into an ordered items array with name, count, pct, color.
 */
export function itemsFrom(map, order, colors) {
  const entries = order
    ? [
        ...order.filter((key) => map.has(key)).map((key) => [key, map.get(key)]),
        ...[...map].filter(([key]) => !order.includes(key)),
      ]
    : [...map];
  const total = entries.reduce((value, [, count]) => value + count, 0);
  return entries.map(([name, count]) => ({
    name,
    count,
    pct: total ? (count * 100) / total : 0,
    color: colors[name] || "var(--muted-ink)",
    unknown: String(name).toLowerCase() === "unknown" || name === "UNASSIGNED",
  }));
}

/**
 * Sum a numeric field across rows, returning null if any value is invalid.
 */
export function sum(rows, field) {
  let total = 0;
  for (const row of rows) {
    const value = number(row[field]);
    if (value === null) return null;
    total += value;
  }
  return total;
}

/**
 * Connection status semantic state (healthy/watch/attention).
 */
export function connectionSemantic(name, share) {
  const target = CONNECTION_TARGETS[name];
  if (target === undefined || share === null || share === undefined) return null;
  if (name === "Leader") {
    if (share >= 15) return { state: "healthy", label: "Healthy", note: `Leader: ${share.toFixed(1)}% (Target 15% · Healthy)` };
    if (share >= 10) return { state: "watch", label: "Watch", note: `Leader: ${share.toFixed(1)}% (Target 15% · Watch)` };
    return { state: "attention", label: "Attention", note: `Leader: ${share.toFixed(1)}% (Target 15% · Attention)` };
  }
  if (name === "Core") {
    if (share >= 35) return { state: "healthy", label: "Healthy", note: `Core: ${share.toFixed(1)}% (Target 35% · Healthy)` };
    if (share >= 25) return { state: "watch", label: "Watch", note: `Core: ${share.toFixed(1)}% (Target 35% · Watch)` };
    return { state: "attention", label: "Attention", note: `Core: ${share.toFixed(1)}% (Target 35% · Attention)` };
  }
  if (name === "Crowd") {
    const diff = Math.abs(share - 35);
    if (diff <= 6) return { state: "healthy", label: "Healthy", note: `Crowd: ${share.toFixed(1)}% (Target 35% · Healthy)` };
    if (diff <= 12) return { state: "watch", label: "Watch", note: `Crowd: ${share.toFixed(1)}% (Target 35% · Watch)` };
    return { state: "attention", label: "Attention", note: `Crowd: ${share.toFixed(1)}% (Target 35% · Attention)` };
  }
  if (name === "New") {
    const diff = Math.abs(share - 15);
    if (diff <= 4) return { state: "healthy", label: "Healthy", note: `New: ${share.toFixed(1)}% (Target 15% · Healthy)` };
    if (diff <= 8) return { state: "watch", label: "Watch", note: `New: ${share.toFixed(1)}% (Target 15% · Watch)` };
    return { state: "attention", label: "Attention", note: `New: ${share.toFixed(1)}% (Target 15% · Attention)` };
  }
  return null;
}

export function isOpenAccessRow(row) {
  return String(row?.campusShortCode ?? "UNASSIGNED") !== "OPEN";
}
