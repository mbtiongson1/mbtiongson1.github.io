/**
 * Projected Unique Sunday Attendance — browser-side contract.
 *
 * Mirrors src/metric_contract/unique_attendance.py exactly. Both the Page 12
 * homepage KPI and the TechStats Sunday Report import this module so the
 * multiplier table is never hard-coded in two places.
 *
 * Scope rule (operator, 2026-09-21): the multiplier applies ONLY to headcount
 * that cannot be individually identified -- today that's auditorium adults
 * (a per-service manual tally, no check-in). A component already counted as
 * unique people (Kids Attendance and Kids Leaders are both check-in/schedule-
 * based today) is added to the result AFTER multiplying, never folded into
 * the number passed to resolveProjectedUnique(). This module is domain-
 * agnostic: it multiplies whatever headcount the caller passes it. Deciding
 * which portion of a Sunday's attendance is "unknown" vs "already unique" is
 * the caller's job, not this contract's.
 *
 * Issue #724, #725.
 */

export const MODEL_YEAR = 2026;

export const MULTIPLIERS = Object.freeze([
  Object.freeze({ serviceCount: 1, multiplier: 1.00000000, lo: 1.00000000, hi: 1.00000000, basis: "exact", sampleSize: null, confidence: null }),
  Object.freeze({ serviceCount: 2, multiplier: 0.92069488, lo: 0.89759766, hi: 0.95206833, basis: "observed", sampleSize: 29, confidence: null }),
  Object.freeze({ serviceCount: 3, multiplier: 0.81032490, lo: 0.76032490, hi: 0.86032490, basis: "modeled", sampleSize: null, confidence: "interpolated from 2- and 4-service observed data" }),
  Object.freeze({ serviceCount: 4, multiplier: 0.72098804, lo: 0.71480199, hi: 0.79374194, basis: "observed", sampleSize: 5, confidence: null }),
]);

const _MAP = new Map(MULTIPLIERS.map((entry) => [entry.serviceCount, entry]));
export const MAX_SUPPORTED_SERVICES = Math.max(...MULTIPLIERS.map((e) => e.serviceCount));

/**
 * Resolve the Projected Unique attendance from headcount and service count.
 *
 * @param {object} opts
 * @param {number|null} opts.headcount  The UNKNOWN (not individually identified) headcount only
 * @param {number|null} opts.serviceCount  Number of services active for this campus/date
 * @param {number}      [opts.year=MODEL_YEAR]
 * @returns {{ available: boolean, projectedUnique: number|null, projectedLow: number|null,
 *             projectedHigh: number|null, headcount: number|null, serviceCount: number|null,
 *             multiplier: number|null, basis: string|null, reason: string|null }}
 */
export function resolveProjectedUnique({ headcount, serviceCount, year = MODEL_YEAR } = {}) {
  if (year !== MODEL_YEAR) {
    return { available: false, projectedUnique: null, projectedLow: null, projectedHigh: null, headcount, serviceCount, multiplier: null, basis: null, reason: `No approved model for year ${year}` };
  }
  if (headcount == null || headcount < 0) {
    return { available: false, projectedUnique: null, projectedLow: null, projectedHigh: null, headcount, serviceCount, multiplier: null, basis: null, reason: "Headcount unavailable" };
  }
  if (serviceCount == null || serviceCount < 1) {
    return { available: false, projectedUnique: null, projectedLow: null, projectedHigh: null, headcount, serviceCount, multiplier: null, basis: null, reason: "Service count unavailable or invalid" };
  }
  const entry = _MAP.get(serviceCount);
  if (!entry) {
    return { available: false, projectedUnique: null, projectedLow: null, projectedHigh: null, headcount, serviceCount, multiplier: null, basis: null, reason: `Unsupported service count: ${serviceCount} (max supported: ${MAX_SUPPORTED_SERVICES})` };
  }
  return {
    available: true,
    projectedUnique: Math.round(headcount * entry.multiplier),
    projectedLow: Math.round(headcount * entry.lo),
    projectedHigh: Math.round(headcount * entry.hi),
    headcount,
    serviceCount,
    multiplier: entry.multiplier,
    basis: entry.basis,
    reason: null,
  };
}
