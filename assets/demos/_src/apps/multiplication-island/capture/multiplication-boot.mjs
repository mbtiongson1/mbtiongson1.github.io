/* Multiplication — the under-construction watershed (#394, #600)
 * ===========================================================================================
 * Mounts into the People & Leaders shell as the third tab, and stands alone in its own harness.
 * Exports the mountable contract and nothing else:
 *
 *     boot(root, bundle) -> Promise<void>
 *     teardown(root) -> void
 *
 * ------------------------------------------------------------------- why this is a teaser
 *
 * The Sphere of Influence renderer in PR #442 was REJECTED, and for a specific reason worth
 * keeping in front of whoever picks this up: it was root-centric. A reader had to select a
 * leader before seeing anything, which produced a small ego graph rather than the church's
 * influence landscape. The approved reset (2026-09-16) requires the whole landscape visible
 * first, with selection acting as focus rather than rebuilding the world around one person.
 *
 * So this tab does NOT ship that renderer, and it does not ship a placeholder pretending to be
 * it either. It shows the shape of the answer — a watershed, which is the agreed visual grammar
 * — states plainly that it is being built, and says what it will answer. The contracts,
 * schemas, privacy projection and `people-sphere-public` query that the real surface needs are
 * already merged and tested; what is missing is the renderer, not the groundwork.
 *
 * ------------------------------------------------------------------------ the river, and why
 *
 * Water is a genuinely good fit for multiplication and not merely a pretty one:
 *
 *   * a watershed BRANCHES, which is what multiplication looks like from above;
 *   * tributaries JOIN, so contribution is visible without ranking anyone;
 *   * flow has VOLUME and DIRECTION, so a chain that is growing looks different from one that
 *     is holding;
 *   * and a dry bed reads as an ABSENCE rather than as a zero, which is the one thing this
 *     dashboard family refuses to get wrong (ADR 0018).
 *
 * The drawing below is a STATEMENT OF INTENT, not data. It carries no counts, no names, and no
 * figures, because there is nothing here it could truthfully count yet. One dry tributary is
 * drawn deliberately: the grammar has to be able to show a stopped chain from the first sketch,
 * or it will be retrofitted later and look like an error state.
 */

import { mountBreadcrumbs } from "./dashboard-breadcrumbs.mjs?v=20260922_793";
import { mountTooltipDelegate, tooltipContent } from "./dashboard-tooltip.mjs?v=20260922_793";
import { mountMarkup } from "./dashboard-markup.mjs?v=20260922_793";

const state = { root: null, tooltip: null, markup: null, listeners: [] };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function svg(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/* Prose does not occupy layout (DESIGN.md), and on a page this short that rule does most of the
 * design work: the surface is a status word, a title, a question, one line, and the drawing.
 * Everything else lives behind this mark. */
function infoMark(text, label) {
  const mark = el("button", "info-tip");
  mark.type = "button";
  mark.setAttribute("aria-label", label);
  const glyph = svg("svg", { viewBox: "0 0 16 16", "aria-hidden": "true", focusable: "false" });
  glyph.append(svg("circle", { cx: 8, cy: 8, r: 7 }),
               svg("line", { x1: 8, y1: 7, x2: 8, y2: 11.4 }),
               svg("circle", { class: "dotcap", cx: 8, cy: 4.7, r: 0.4 }));
  mark.append(glyph);
  mark.dataset.tip = "1";
  mark.dataset.tipLabel = label;
  mark.dataset.tipCompare = text;
  return mark;
}

/* The watershed. One dominant river — the canonical Leadership Pathway — with tributaries
 * joining it, drawn in the Watershed palette and animated as flow.
 *
 * Every stroke reads a theme token, so the sketch re-themes with the swatch like everything
 * else. Widths encode volume: the trunk is widest, a tributary narrows toward its source. */
function watershed() {
  const figure = el("figure", "mult-river");
  const frame = svg("svg", {
    viewBox: "0 0 720 260",
    role: "img",
    "aria-label":
      "A stylised watershed. One wide river runs left to right. Hairline tributaries join it, one "
      + "stronger tributary joins from a marked leader, a new branch leaves that leader heading "
      + "onward, and one channel is drawn dry. An illustration of the grammar, not a chart.",
  });

  /* THE GRAMMAR, from the 2026-09-16 direction on #394. Each object means one thing and the
   * meanings are disciplined, because the whole risk with a river is that proximity starts to
   * read as ownership. Nothing here implies that anyone belongs to anyone.
   *
   *   primary river      the canonical Leadership Pathway, which exists on its own
   *   hairline tributary a structural sphere
   *   stronger tributary development actually recorded
   *   new branch         multiplication: a developed person now developing others
   *   filled landmark    a verified win
   *   hollow landmark    a win nobody measures yet, drawn as pending rather than absent
   *   dry channel        not measured, never a zero
   */
  const TRUNK = "M10 196 C 150 190, 250 172, 372 158 S 590 132, 712 118";

  // Bed under the trunk: the river reads as water in a channel rather than as a drawn line.
  frame.append(svg("path", { class: "mult-river__bed", d: TRUNK }));
  frame.append(svg("path", { class: "mult-river__trunk", d: TRUNK }));
  frame.append(svg("path", { class: "mult-river__current", d: TRUNK }));

  // Hairline tributaries: structural spheres.
  for (const d of [
    "M96 54 C 132 96, 168 140, 236 178",
    "M248 40 C 278 86, 312 128, 372 158",
    "M556 46 C 576 78, 600 108, 648 128",
  ]) frame.append(svg("path", { class: "mult-river__hairline", d }));

  // One stronger tributary: development actually recorded, joining at a named leader.
  frame.append(svg("path", { class: "mult-river__explicit", d: "M392 32 C 412 74, 432 116, 470 142" }));
  frame.append(svg("path", { class: "mult-river__current mult-river__current--branch", d: "M392 32 C 412 74, 432 116, 470 142" }));

  // The leader that tributary reaches, and the NEW branch leaving them. This is multiplication,
  // and it is the only place on the drawing where a stream starts rather than joins.
  frame.append(svg("path", { class: "mult-river__new", d: "M470 142 C 520 132, 566 96, 636 72" }));
  frame.append(svg("circle", { class: "mult-river__leader", cx: 470, cy: 142, r: 7 }));

  // Landmarks: one verified, one pending.
  frame.append(svg("path", { class: "mult-river__win", d: "M582 88 l5 -9 5 9 -5 9 z" }));
  frame.append(svg("path", { class: "mult-river__win mult-river__win--pending", d: "M286 172 l5 -9 5 9 -5 9 z" }));

  // The dry channel: not measured. Never red, and never a zero.
  frame.append(svg("path", { class: "mult-river__dry", d: "M664 40 C 668 66, 668 84, 660 104" }));

  figure.append(frame);
  return figure;
}

export async function boot(root = document.getElementById("multiplication-root")) {
  if (!root) return;
  state.root = root;
  root.classList.add("mult");
  root.replaceChildren();

  if (!root.closest?.(".pshell")) {
    const trail = el("div", "mult-trail");
    mountBreadcrumbs(trail, { currentSurface: "pathways" });
    root.append(trail);
  }

  /* A TEASE, NOT A BRIEF. The whole surface is a status word, a title, the question this
   * dashboard will answer, one line about what is being built, and the drawing. Everything else
   * a reader might want to know lives behind the mark on the title, because prose does not
   * occupy layout (DESIGN.md). Finance Tithes set this shape and it is the right one: a page
   * that is not ready should be short. */
  const head = el("header", "mult-masthead");
  head.append(el("p", "mult-status", "Status: under construction"));

  const title = el("h1", "mult-masthead__title", "Multiplication is being built");
  title.append(infoMark(
    "The grammar is a watershed. The primary river is the canonical Leadership Pathway. A "
    + "hairline tributary is a structural sphere, a stronger one is development actually "
    + "recorded, and a new branch starting downstream is multiplication: someone who was being "
    + "developed has become a leader and begun developing others. A landmark is a verified win, "
    + "a hollow one is a win nobody measures yet, and a dry channel means not measured rather "
    + "than none. The groundwork is already built and tested: the closed contracts, four "
    + "schemas, the server-side privacy projection, and the query that feeds them. The first "
    + "renderer was set aside because it was root-centric, so a reader had to pick a leader "
    + "before seeing anything. What replaces it shows the whole landscape on arrival, and "
    + "selection moves attention rather than rebuilding the world. Leaders are named. Everyone "
    + "else is projected to anonymous cohorts on the server, before anything reaches a browser.",
    "About the watershed"));
  head.append(title);

  head.append(el("p", "mult-masthead__question", "Who are those leaders building? Is multiplication happening?"));
  head.append(el("p", "mult-masthead__line",
    "We are wiring structural relationships, recorded development, and verified wins into one map."));

  const back = el("a", "mult-back", "Return to Executive Dashboards");
  back.href = "/exec";
  head.append(back);
  root.append(head);

  root.append(watershed());

  state.tooltip = mountTooltipDelegate(root, {
    surface: "multiplication",
    selector: "[data-tip]",
    content: (node) => tooltipContent({
      label: node.dataset.tipLabel || null,
      comparison: node.dataset.tipCompare || null,
    }),
  });

  /* The markup pen is shared furniture: every exec surface carries the same drawing system,
   * an under-construction one included. Finance set this precedent (#606) and the reason holds
   * here -- a reader who wants to mark up the watershed grammar, or ask a question on top of
   * it, should not have to wait for the real island. Freezing captures the placeholder exactly
   * as it stands: shape only, no figures, the same honesty the placeholder already carries.
   *
   * The pen docks in the masthead because this surface has no palette or filter rail to sit
   * beside. Nothing loads until it is pressed. */
  if (!state.markup) {
    state.markup = mountMarkup(root, {
      surface: { id: "multiplication", title: "Multiplication" },
      host: head,
      frame: root,
      context: () => ({ mode: null, theme: null, filterSummary: null, url: window.location.href, title: document.title }),
    });
  }
}

export function teardown(root = state.root) {
  for (const [target, type, handler] of state.listeners) target.removeEventListener(type, handler);
  state.listeners = [];
  if (state.tooltip && typeof state.tooltip.destroy === "function") state.tooltip.destroy();
  state.tooltip = null;
  /* The pen mounts a React root on <body>, outside this island, so `root.replaceChildren()`
   * below would leave it behind when the shell switches tabs. */
  if (state.markup && typeof state.markup.destroy === "function") state.markup.destroy();
  state.markup = null;
  if (root) {
    root.replaceChildren();
    root.classList.remove("mult");
  }
  state.root = null;
}
