/* Shared status primitive: the visible half of every announce() (#587).
 *
 * Every island already owns a visually hidden live region and an announce() that writes to
 * it, so a screen reader hears "Copied Attendance as a table." while a sighted operator sees
 * nothing at all. The 2026-09-15 audit found no shipped surface with a visible completion,
 * failure, or working cue. This module closes that gap once, for every island, with one chip
 * that says the same words the live region says, at the same moment.
 *
 * Nothing here fetches, stores, or logs (contract Sec1) -- pure DOM, timers, and classes.
 * Styles live in apps/shared/ux-base.css (merged into every island stylesheet); the standard
 * they implement is docs/design/ux-bar.md.
 *
 * Exports
 *   HOLD_MS                          the one hold vocabulary: how long each kind stays
 *   kindFor(message)                 "done" | "fail" | "busy" | "info" from the words alone
 *   formatClock(date)                "HH:MM" for "refreshed · 14:05" style completions
 *   motionMs(root, token, fallback)  a --motion-* token as a number, 0 under reduced motion,
 *                                    so a JS timeout and the CSS it pairs with read one value
 *   trackHostChrome(root)            measure the host and surface chrome into
 *                                    --host-chrome-bottom for status positioning
 *   markChanged(nodes, { max })      one-shot settle cue on the stations a change touched
 *   mountStatus(root, opts)          -> controller (below)
 *
 * mountStatus(root, { live, label, timers })
 *   root    the island root; the chip is appended here so the island's scoped CSS styles it
 *   live    the island's existing live region. When given, the chip is aria-hidden and the
 *           region carries the words to assistive tech; when absent the chip is role=status.
 *   label   accessible name for the dismiss control, default "Dismiss"
 *   timers  { set, clear } override for tests; defaults to setTimeout / clearTimeout
 *
 * Controller
 *   element                          the chip
 *   announce(message, { kind, visible = true, hold })
 *                                    say it to assistive tech and, when visible, show the chip.
 *                                    kind defaults to kindFor(message); hold to HOLD_MS[kind].
 *   quiet(message)                   assistive tech only, no chip. For filter chatter, where
 *                                    the visible answer is the changed stations themselves
 *                                    (markChanged), not a toast on every click.
 *   busy(message)                    sticky working state; replaced by the next announce
 *   done(message)                    completion, holds HOLD_MS.done then leaves
 *   fail(message, { action })        sticky failure with a dismiss control (label, run);
 *                                    Escape dismisses too. A failure is never a toast.
 *   clear()                          close the chip now
 *   destroy()                        clear and remove the chip
 */

export const HOLD_MS = Object.freeze({ done: 3200, info: 2600, busy: 0, fail: 0 });

const SVG_NS = "http://www.w3.org/2000/svg";
const MARK_PATHS = Object.freeze({
  done: "M4 12.5l5 5L20 7",
  fail: "M12 6v7.5M12 17.2v.6",
  busy: "M12 3a9 9 0 0 1 9 9",
  info: "M12 8v.5M12 11.5V17",
});

const FAIL_WORDS = /\b(could not|couldn't|cannot|can't|unavailable|failed|fail|error|no faithful|not saved|denied|timed out)\b/i;
const DONE_WORDS = /\b(copied|exported|saved|refreshed|loaded|applied|reset|cleared|done|complete|completed|pinned|updated|sent)\b/i;
const BUSY_WORDS = /\b(loading|working|saving|exporting|copying|refreshing|fetching|preparing)\b|(\.\.\.|…)\s*$/i;

/* The words decide the kind, so an island's existing announce() strings gain a visible
 * meaning without rewriting a single message. An explicit kind always wins. */
export function kindFor(message) {
  const text = String(message || "");
  if (FAIL_WORDS.test(text)) return "fail";
  if (BUSY_WORDS.test(text)) return "busy";
  if (DONE_WORDS.test(text)) return "done";
  return "info";
}

/* "14:05", operator-local, zero padded. Used for "Sunday Report refreshed · 14:05": a
 * completion cue that also answers "how fresh is this?" the next time someone looks up. */
export function formatClock(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* The CSS token is the only place a duration is written. A JS timeout that must match it
 * (the mode-switch class that comes off when the widgets have landed) reads it here, so
 * reduced motion, which zeroes the tokens, zeroes the timeout too and nothing is left
 * waiting on a transition that never ran. */
export function motionMs(root, token = "--motion-state", fallback = 180) {
  try {
    const target = root || (typeof document !== "undefined" ? document.documentElement : null);
    if (!target || typeof getComputedStyle !== "function") return fallback;
    const raw = getComputedStyle(target).getPropertyValue(token).trim();
    if (!raw) return fallback;
    const value = Number.parseFloat(raw);
    if (Number.isNaN(value)) return fallback;
    return raw.endsWith("ms") ? value : value * 1000;
  } catch {
    return fallback;
  }
}

/* Status positioning is a contract between the host and the island, not a surface-specific
 * pixel offset. Rock's mobile header can be normal-flow `relative` at one breakpoint and
 * fixed/sticky at another, so the measurement follows the pixels at the viewport's top edge.
 * The suite breadcrumb is the island's own top chrome; it opts into the same contract with
 * data-ux-host-chrome so the chip clears both bars. Only the shared CSS gap is added later. */
export function trackHostChrome(root) {
  if (!root || typeof document === "undefined" || typeof document.elementsFromPoint !== "function") return () => {};
  const offset = () => {
    let lowest = 0;
    const probe = document.elementsFromPoint(Math.round(window.innerWidth / 2), 2) || [];
    for (const node of probe) {
      if (node === document.documentElement || node === document.body) continue;
      // Skip root's own subtree (our chip) and root's ancestors (whole-page wrappers whose
      // rect spans the entire document and would otherwise read as towering "chrome").
      if (root === node || root.contains?.(node) || node.contains?.(root)) continue;
      const rect = node.getBoundingClientRect?.();
      if (rect && rect.top <= 2 && rect.bottom > lowest) lowest = rect.bottom;
    }

    // A normal-flow host header may end immediately before the island. Start at the island's
    // top edge as well, then walk any marked surface chrome that touches that boundary. This
    // handles Rock's nav plus the suite breadcrumb without knowing either implementation's
    // position/z-index rules.
    const rootRect = root.getBoundingClientRect?.();
    if (rootRect && rootRect.top > lowest) lowest = rootRect.top;
    const marked = root.querySelectorAll?.("[data-ux-host-chrome]") || [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of marked) {
        const rect = node.getBoundingClientRect?.();
        if (!rect || rect.top > lowest + 2 || rect.bottom <= lowest) continue;
        if (rect.bottom > lowest) {
          lowest = rect.bottom;
          changed = true;
        }
      }
    }
    return Math.min(lowest, Math.round(window.innerHeight * 0.35));
  };
  const apply = () => { root.style.setProperty("--host-chrome-bottom", `${Math.round(offset())}px`); };
  apply();
  const retries = [150, 400, 900, 1800];
  const timers = retries.map((delay) => window.setTimeout(apply, delay));
  window.addEventListener("resize", apply, { passive: true });
  return () => { timers.forEach((id) => window.clearTimeout(id)); window.removeEventListener("resize", apply); };
}

/* One-shot settle on the stations a user action changed. Restarts cleanly when the same
 * station changes twice in a row, caps the count so a 300-tile grid never animates as a
 * grid, and cleans up after itself. Never call this on load: it explains a change, and
 * on load nothing has changed yet. Returns how many nodes were marked. */
export function markChanged(nodes, { max = 8 } = {}) {
  const list = Array.from(nodes || []).filter(Boolean).slice(0, Math.max(0, max));
  for (const node of list) {
    node.classList.remove("ux-changed");
    void node.offsetWidth;
    node.classList.add("ux-changed");
    if (typeof node.addEventListener === "function") {
      node.addEventListener("animationend", () => node.classList.remove("ux-changed"), { once: true });
    }
  }
  return list.length;
}

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function buildMark() {
  const mark = el("span", "ux-status__mark");
  mark.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", MARK_PATHS.info);
  svg.append(path);
  mark.append(svg);
  return { mark, path };
}

export function mountStatus(root, { live = null, label = "Dismiss", timers = null } = {}) {
  const set = timers && timers.set ? timers.set : (fn, ms) => setTimeout(fn, ms);
  const clearTimer = timers && timers.clear ? timers.clear : (id) => clearTimeout(id);

  const chip = el("div", "ux-status");
  chip.dataset.open = "false";
  chip.dataset.kind = "info";
  if (live) {
    chip.setAttribute("aria-hidden", "true");
  } else {
    chip.setAttribute("role", "status");
    chip.setAttribute("aria-live", "polite");
  }
  const { mark, path } = buildMark();
  const text = el("span", "ux-status__text");
  const btn = el("button", "ux-status__btn");
  btn.type = "button";
  btn.textContent = label;
  btn.hidden = true;
  chip.append(mark, text, btn);
  if (root && typeof root.append === "function") root.append(chip);

  let timer = null;
  let action = null;
  let escapeBound = false;

  const onEscape = (event) => {
    if (event && event.key === "Escape" && chip.dataset.kind === "fail") controller.clear();
  };
  const bindEscape = (on) => {
    if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
    if (on && !escapeBound) { document.addEventListener("keydown", onEscape); escapeBound = true; }
    if (!on && escapeBound) { document.removeEventListener("keydown", onEscape); escapeBound = false; }
  };

  btn.addEventListener("click", () => {
    const run = action && typeof action.run === "function" ? action.run : null;
    controller.clear();
    if (run) run();
  });

  const speak = (message) => {
    const words = String(message || "");
    if (live) {
      /* Re-announce an identical message: assistive tech ignores an unchanged live region,
       * so the region is emptied first and refilled on the next tick. */
      live.textContent = "";
      set(() => { live.textContent = words; }, 0);
    }
  };

  const controller = {
    element: chip,
    announce(message, { kind = null, visible = true, hold = null } = {}) {
      const words = String(message || "");
      const resolved = kind || kindFor(words);
      speak(words);
      if (!visible) {
        /* A caller that narrates its completion quietly (no toast) still resolved whatever
         * busy state it opened -- an open sticky busy chip must not outlive the work it was
         * reporting on just because this particular announce chose not to show a toast (#763). */
        if (chip.dataset.open === "true" && chip.dataset.kind === "busy" && (resolved === "done" || resolved === "fail")) {
          controller.clear();
        }
        return controller;
      }
      if (timer) { clearTimer(timer); timer = null; }
      action = null;
      chip.dataset.kind = resolved;
      path.setAttribute("d", MARK_PATHS[resolved] || MARK_PATHS.info);
      text.textContent = words;
      btn.hidden = resolved !== "fail";
      btn.textContent = label;
      chip.dataset.open = "true";
      bindEscape(resolved === "fail");
      const stay = hold === null || hold === undefined ? HOLD_MS[resolved] : Number(hold);
      if (stay > 0) timer = set(() => { timer = null; controller.clear(); }, stay);
      return controller;
    },
    quiet(message) { return controller.announce(message, { visible: false }); },
    busy(message) { return controller.announce(message, { kind: "busy" }); },
    done(message) { return controller.announce(message, { kind: "done" }); },
    fail(message, { action: act = null } = {}) {
      controller.announce(message, { kind: "fail" });
      if (act && act.label) { btn.textContent = String(act.label); action = act; }
      return controller;
    },
    clear() {
      if (timer) { clearTimer(timer); timer = null; }
      action = null;
      chip.dataset.open = "false";
      bindEscape(false);
      return controller;
    },
    destroy() {
      controller.clear();
      if (typeof chip.remove === "function") chip.remove();
    },
  };
  return controller;
}
