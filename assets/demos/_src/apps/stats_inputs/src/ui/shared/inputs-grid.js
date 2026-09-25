/* Stub proving the shared-bundle mechanism for #713; T3 fills it in. */
// Private module state for the cell provenance hint (#751, CONTRACT.md). One
// singleton per page: the hint layer lives outside #si-app (document.body,
// §3), so this state is not per-render like everything else in SIGrid.
var _siHint = { el: null, ctx: null, activeTrigger: null, openTimer: null, closeTimer: null };
var SIGrid = {
  HINT_OPEN_DELAY_MS: 100,
  HINT_CLOSE_GRACE_MS: 150,
  composeCellTitle: function (field, ctx, stateText) {
    var segments = [];
    var meta = null;
    var relative = "";
    if (stateText) { segments.push(stateText); }
    if (field && field.archived) { segments.push("archived in Rock"); }
    if (field && ctx && ctx.state && ctx.state.savedMeta && ctx.fieldCellKey) {
      meta = ctx.state.savedMeta[ctx.fieldCellKey(field)];
    }
    if (meta && meta.modifiedDateTime) {
      // editTimeLabel (dates.js / youth-modules/dates.js, concatenated ahead
      // of this file in both bundles -- see manifest.json) gives clock time
      // for today and relative days for anything earlier, evaluated in the
      // campus's own zone. relativeTime stays as the fallback for a harness
      // that loads this file without dates.js (e.g. the existing Node grid
      // tests), unchanged, per #751's own instruction not to touch it.
      relative = (typeof editTimeLabel === "function")
        ? editTimeLabel(meta.modifiedDateTime, ctx.state.campus)
        : (ctx.relativeTime ? ctx.relativeTime(meta.modifiedDateTime) : meta.modifiedDateTime);
      // relative is "" only for an unparseable ModifiedDateTime; "Saved  by X"
      // (double space) is never shown.
      segments.push((relative ? "Saved " + relative : "Saved")
        + (meta.modifiedByName ? " by " + meta.modifiedByName : ""));
    }
    return segments.join(" · ");
  },
  // composeHintText is the hint's own name for composeCellTitle (§0, §2): one
  // text function, so a call site reads as "the hint's text" without
  // duplicating composeCellTitle's segment-joining rules.
  composeHintText: function (field, ctx, stateText) {
    return SIGrid.composeCellTitle(field, ctx, stateText);
  },
  // The most recent ModifiedDateTime across every cell in `fields` (a row's
  // cells), formatted with the same editTimeLabel composeHintText uses --
  // one formatter, one source of truth (#751). A row with no receipts
  // anywhere returns "", never a dash or placeholder.
  rowEditStamp: function (fields, ctx) {
    if (!fields || !ctx || !ctx.state || !ctx.state.savedMeta || !ctx.fieldCellKey) { return ""; }
    var latestIso = "";
    var latestTime = -1;
    fields.forEach(function (field) {
      if (!field) { return; }
      var meta = ctx.state.savedMeta[ctx.fieldCellKey(field)];
      if (!meta || !meta.modifiedDateTime) { return; }
      var t = new Date(meta.modifiedDateTime).getTime();
      if (!isNaN(t) && t > latestTime) { latestTime = t; latestIso = meta.modifiedDateTime; }
    });
    if (!latestIso || typeof editTimeLabel !== "function") { return ""; }
    return editTimeLabel(latestIso, ctx.state.campus);
  },
  // Resolves the field descriptor a hint trigger's data-si-cell-key refers to.
  // The DOM only carries the key string (fieldCellKey(field)); ctx.allStatsFields
  // / ctx.allTeamFields are the same field descriptors renderMatrix rendered
  // from, so matching on the same key function finds the same field.
  _hintResolveField: function (trigger, ctx) {
    var key = trigger && trigger.getAttribute ? trigger.getAttribute("data-si-cell-key") : "";
    if (!key || !ctx || !ctx.state || !ctx.fieldCellKey) { return null; }
    var fields = ctx.state.mode === ctx.MODE_STATS
      ? (ctx.allStatsFields ? ctx.allStatsFields() : [])
      : (ctx.allTeamFields ? ctx.allTeamFields() : []);
    for (var i = 0; i < fields.length; i += 1) {
      if (fields[i] && ctx.fieldCellKey(fields[i]) === key) { return fields[i]; }
    }
    return null;
  },
  _hintPointFromEvent: function (event) {
    if (!event || typeof event.clientX !== "number" || typeof event.clientY !== "number") { return null; }
    if (!event.clientX && !event.clientY) { return null; }
    return { x: event.clientX, y: event.clientY };
  },
  // Viewport-clamped, position:fixed placement -- ports variant A's placement
  // math (workbench/prototypes/last-edited-hint/variants.js placeFixed),
  // itself a plain-script mirror of dashboard-tooltip.mjs's placeNear. Below
  // the anchor by default, flips above when there is no room, clamps to the
  // viewport edges. Positioning is not part of CONTRACT.md (§0): only
  // position:fixed is required there.
  _hintPlace: function (trigger, point) {
    var hintEl = _siHint.el;
    if (!hintEl || !trigger || !trigger.getBoundingClientRect) { return; }
    var doc = trigger.ownerDocument || document;
    var box = trigger.getBoundingClientRect();
    var tip = hintEl.getBoundingClientRect();
    var vw = doc.documentElement.clientWidth;
    var vh = doc.documentElement.clientHeight;
    var gap = 8, edge = 8;
    var anchorTop = point ? point.y : box.top;
    var anchorBottom = point ? point.y : box.bottom;
    var top = anchorBottom + gap;
    if (top + tip.height > vh - edge) {
      var above = anchorTop - gap - tip.height;
      top = above >= edge ? above : Math.max(edge, vh - edge - tip.height);
    }
    var left = point ? point.x + gap : box.right - tip.width;
    if (!point && left < edge) { left = box.left; }
    if (point && left + tip.width > vw - edge) { left = point.x - gap - tip.width; }
    left = Math.max(edge, Math.min(left, vw - edge - tip.width));
    hintEl.style.top = Math.round(top) + "px";
    hintEl.style.left = Math.round(left) + "px";
  },
  _hintReposition: function () {
    if (_siHint.activeTrigger && _siHint.el && _siHint.el.getAttribute("data-open") === "true") {
      SIGrid._hintPlace(_siHint.activeTrigger, null);
    }
  },
  _hintScheduleOpen: function (trigger, point) {
    if (_siHint.openTimer) { clearTimeout(_siHint.openTimer); }
    if (_siHint.closeTimer) { clearTimeout(_siHint.closeTimer); _siHint.closeTimer = null; }
    _siHint.openTimer = setTimeout(function () {
      _siHint.openTimer = null;
      SIGrid.showHint(trigger, _siHint.ctx, point);
    }, SIGrid.HINT_OPEN_DELAY_MS);
  },
  _hintScheduleClose: function () {
    if (_siHint.openTimer) { clearTimeout(_siHint.openTimer); _siHint.openTimer = null; }
    if (_siHint.closeTimer) { clearTimeout(_siHint.closeTimer); }
    _siHint.closeTimer = setTimeout(function () {
      _siHint.closeTimer = null;
      SIGrid.hideHint({ immediate: false });
    }, SIGrid.HINT_CLOSE_GRACE_MS);
  },
  // trigger must carry [data-si-cell-key] and must not be an <input> (§9) --
  // callers here (the delegate handlers below) already guard this.
  // Releases one trigger back to its resting state: native title recomputed
  // (never read back from a cached string, §5), open/describedby marks
  // removed. Called both when the hint closes and when a sweep moves the hint
  // to a different cell -- a trigger left marked open with a blanked title is
  // the stale-neighbour defect requirement 4 exists to prevent.
  // Closes the bubble AND drops its text. A closed-but-populated bubble still
  // carries the previous cell's name in the DOM, which is the stale-neighbour
  // failure one opacity transition away from being visible again.
  _hintBlank: function () {
    if (!_siHint.el) { return; }
    _siHint.el.setAttribute("data-open", "false");
    _siHint.el.textContent = "";
  },
  _hintRelease: function (trigger) {
    if (!trigger) { return; }
    var field = SIGrid._hintResolveField(trigger, _siHint.ctx);
    var restored = SIGrid.composeHintText(field, _siHint.ctx, "");
    trigger.setAttribute("title", restored ? restored : "");
    trigger.removeAttribute("data-si-hint-open");
    trigger.removeAttribute("aria-describedby");
  },
  showHint: function (trigger, ctx, point) {
    if (!trigger || !_siHint.el || !ctx) { return; }
    // Repeated here as well as in the delegate's triggerFrom, deliberately:
    // showHint is reachable programmatically (tests, a future caller), and the
    // editor seam must hold on every path into it, not only the hover one.
    if (trigger.tagName === "INPUT") { return; }
    if (String(trigger.className || "").indexOf("si-cell-editing") !== -1) { return; }
    _siHint.ctx = ctx;
    // Release the previous trigger FIRST, before the empty-text early return
    // below. A sweep onto a receiptless neighbour composes to "" and must
    // still close the old bubble rather than leaving it anchored and stale.
    if (_siHint.activeTrigger && _siHint.activeTrigger !== trigger) {
      SIGrid._hintRelease(_siHint.activeTrigger);
      _siHint.activeTrigger = null;
      SIGrid._hintBlank();
    }
    var field = SIGrid._hintResolveField(trigger, ctx);
    var text = SIGrid.composeHintText(field, ctx, "");
    if (!text) { return; }
    trigger.setAttribute("title", "");
    trigger.setAttribute("data-si-hint-open", "true");
    trigger.setAttribute("aria-describedby", "si-hint");
    _siHint.el.textContent = text;
    _siHint.el.setAttribute("data-open", "true");
    _siHint.activeTrigger = trigger;
    SIGrid._hintPlace(trigger, point);
  },
  hideHint: function (opts) {
    if (_siHint.openTimer) { clearTimeout(_siHint.openTimer); _siHint.openTimer = null; }
    if (_siHint.closeTimer) { clearTimeout(_siHint.closeTimer); _siHint.closeTimer = null; }
    var trigger = _siHint.activeTrigger;
    if (!trigger) {
      SIGrid._hintBlank();
      return;
    }
    _siHint.activeTrigger = null;
    SIGrid._hintRelease(trigger);
    SIGrid._hintBlank();
  },
  // Mounts the singleton #si-hint layer (document.body, §3) and the delegated
  // listener set (§4) on tableRoot, exactly once for the lifetime of the page
  // -- idempotent via tableRoot.dataset.hintMounted (§2). Called at the top of
  // renderMatrix on every render; the force-close below runs every time
  // regardless of the mount guard, because a render discards the old <tbody>
  // (and any trigger the hint is anchored to) whether or not this is the
  // first call (§1's render-time safety net).
  mountCellHint: function (tableRoot, ctx) {
    if (!tableRoot) { return null; }
    SIGrid.hideHint({ immediate: true });
    // Defensive, matching this file's existing feature-detection idiom
    // (e.g. refreshRow's `ctx.document.querySelectorAll` guard below): a
    // minimal test ctx/DOM fake that renders a matrix without a real
    // document (getElementById, body) or a real element (dataset) skips the
    // hint entirely rather than throwing. Production always has all four.
    if (!ctx || !ctx.document || typeof ctx.document.getElementById !== "function"
      || typeof ctx.document.createElement !== "function" || !ctx.document.body || !tableRoot.dataset) {
      return null;
    }
    if (tableRoot.dataset.hintMounted === "true") { return tableRoot._siHintController || null; }
    tableRoot.dataset.hintMounted = "true";

    var doc = ctx.document;
    var hintEl = doc.getElementById("si-hint");
    if (!hintEl) {
      hintEl = doc.createElement("div");
      hintEl.id = "si-hint";
      hintEl.className = "si-hint";
      hintEl.setAttribute("role", "tooltip");
      hintEl.setAttribute("data-open", "false");
      doc.body.appendChild(hintEl);
    }
    _siHint.el = hintEl;
    _siHint.ctx = ctx;

    function triggerFrom(event) {
      var node = event.target;
      var found = node && node.closest ? node.closest("[data-si-cell-key]") : null;
      // The editing <input> also carries data-si-cell-key (§9, :415) -- the
      // hint never opens for an element mid-edit.
      if (!found || found.tagName === "INPUT") { return null; }
      // The cell being edited keeps its own data-si-cell-key while the live
      // <input> sits inside it, so a pointer landing on the <td>'s padding
      // rather than on the input resolves to the <td> and clears the INPUT
      // guard above. The hint must never open over an active editor.
      if (String(found.className || "").indexOf("si-cell-editing") !== -1) { return null; }
      return found;
    }

    tableRoot.addEventListener("pointerover", function (event) {
      var trigger = triggerFrom(event);
      if (!trigger) { return; }
      if (trigger === _siHint.activeTrigger && hintEl.getAttribute("data-open") === "true") { return; }
      SIGrid._hintScheduleOpen(trigger, SIGrid._hintPointFromEvent(event));
    });
    tableRoot.addEventListener("pointerout", function (event) {
      var trigger = triggerFrom(event);
      if (trigger && trigger === _siHint.activeTrigger && !(event.relatedTarget && trigger.contains(event.relatedTarget))) {
        SIGrid._hintScheduleClose();
      }
    });
    tableRoot.addEventListener("focusin", function (event) {
      var trigger = triggerFrom(event);
      if (trigger) { SIGrid._hintScheduleOpen(trigger, null); }
    });
    tableRoot.addEventListener("focusout", function (event) {
      var trigger = triggerFrom(event);
      if (trigger && trigger === _siHint.activeTrigger) { SIGrid._hintScheduleClose(); }
    });

    doc.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { SIGrid.hideHint({ immediate: true }); }
    });
    var view = doc.defaultView || (typeof window !== "undefined" ? window : null);
    if (view) {
      view.addEventListener("scroll", function () { SIGrid._hintReposition(); }, true);
      view.addEventListener("resize", function () { SIGrid._hintReposition(); });
    }

    var controller = {
      hide: function () { SIGrid.hideHint({ immediate: true }); },
      destroy: function () { SIGrid.hideHint({ immediate: true }); }
    };
    tableRoot._siHintController = controller;
    return controller;
  },
  renderMatrix: function (host, ctx) {
    SIGrid.mountCellHint(host, ctx);
    var wrap = ctx.el("div", "si-table-wrap");
    var table = ctx.document.createElement("table");
    var thead = ctx.document.createElement("thead");
    var hrow = ctx.document.createElement("tr");
    var matrixTeams = ctx.visibleTeams();
    var statsGrid = ctx.state.mode === ctx.MODE_STATS ? ctx.syncStatsGrid() : null;
    var showCount = ctx.state.mode === ctx.MODE_STATS || matrixTeams.some(function (team) {
      return team.count && ctx.metricVisibilityEnabled("teams", team.count.guid);
    });
    var showTrailing = ctx.state.mode === ctx.MODE_STATS || matrixTeams.some(function (team) {
      return team.unique && ctx.metricVisibilityEnabled("teams", team.unique.guid);
    });
    hrow.appendChild(ctx.el("th", null, ctx.state.mode === ctx.MODE_STATS ? "STATISTIC" : "TEAM"));
    if (showTrailing) { hrow.appendChild(ctx.el("th", "si-col-total", ctx.state.mode === ctx.MODE_STATS ? "TOTAL" : "UNIQUE")); }
    if (showCount) { ctx.state.services.forEach(function (s) { hrow.appendChild(ctx.el("th", null, ctx.serviceLabel(s))); }); }
    thead.appendChild(hrow);
    table.appendChild(thead);

    var tbody = ctx.document.createElement("tbody");
    if (ctx.state.mode === ctx.MODE_STATS) {
      (statsGrid ? statsGrid.rows : []).forEach(function (row) {
        var item = row.item;
        if (!ctx.metricVisibilityEnabled("stats", item.guid)) { return; }
        var id = ctx.metricIdFor(item);
        var tr = ctx.document.createElement("tr");
        var label = ctx.el("div", "si-grid-label");
        label.appendChild(ctx.el("span", "si-grid-label-text", item.title));
        ctx.appendGridMetricLink(label, ctx.statMetricHref(item), item.title);
        tr.appendChild(ctx.el("td"));
        tr.lastChild.appendChild(label);
        // Most recent ModifiedDateTime across this row's cells, muted, under
        // the label (#751). Text only -- not a second interactive trigger.
        var statRowStamp = SIGrid.rowEditStamp(row.cells, ctx);
        if (statRowStamp) { tr.lastChild.appendChild(ctx.el("div", "si-grid-editstamp", statRowStamp)); }
        var total = 0;
        var any = false;
        var serviceValues = [];
        var filledCount = 0;
        // #692: a weekly stat has ONE cell and no per-service values. Its
        // value belongs in the TOTAL column -- it is the stored weekly total,
        // not a sum -- and every service column stays blank. Reading
        // row.cells[serviceIndex] for it would print the weekly total under
        // the first service and make the row look per-service.
        if (row.weekly) {
          var weekValue = id && row.cells[0]
            ? ctx.draftValue(row.cells[0].metricId, row.cells[0].scheduleId, row.cells[0].note, row.cells[0].partitionTuple)
            : "";
          if (weekValue !== "") { total = parseInt(weekValue, 10); any = true; }
          serviceValues = ctx.state.services.map(function () { return ""; });
        } else {
          ctx.state.services.forEach(function (s, serviceIndex) {
            var field = row.cells[serviceIndex];
            var v = id && field ? ctx.draftValue(field.metricId, field.scheduleId, field.note, field.partitionTuple) : "";
            if (v !== "") { total += parseInt(v, 10); any = true; filledCount += 1; }
            serviceValues.push(v);
          });
        }
        var totalTd = ctx.el("td", "si-col-total", any ? String(total) : "-");
        var totalTitle = SIGrid.composeCellTitle(row.weekly ? row.cells[0] : null, ctx, "");
        if (totalTitle) { totalTd.title = totalTitle; }
        // A weekly stat has one field, and that field lives in TOTAL. Service
        // columns remain explicitly inapplicable below.
        if (row.weekly && id && !ctx.isFrozen(ctx.state.date) && !row.cells[0].archived) {
          totalTd.className = "si-col-total si-cell-clickable";
          var weeklyStateClass = SIGrid.cellStateClass(row.cells[0], ctx);
          if (weeklyStateClass) { totalTd.className += " " + weeklyStateClass; }
          totalTd.tabIndex = 0;
          totalTd.setAttribute("role", "button");
          var weeklyAria = "Edit " + item.title + " (weekly)";
          var weeklyContext = SIGrid.composeCellTitle(row.cells[0], ctx, "");
          if (weeklyContext) { weeklyAria += " — " + weeklyContext; }
          totalTd.setAttribute("aria-label", weeklyAria);
          totalTd.setAttribute("data-si-cell-key", ctx.fieldCellKey(row.cells[0]));
          (function (cell, field) {
            cell.addEventListener("click", function () { SIGrid.cellEditor(cell, field, ctx); });
            cell.addEventListener("keydown", function (e) {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); SIGrid.cellEditor(cell, field, ctx); }
            });
          })(totalTd, row.cells[0]);
        }
        tr.appendChild(totalTd);
        var isPartial = filledCount > 0 && filledCount < ctx.state.services.length;
        ctx.state.services.forEach(function (s, serviceIndex) {
          var v = serviceValues[serviceIndex];
          var field = row.cells[serviceIndex];
          var td = ctx.document.createElement("td");
          if (row.weekly) {
            // Not a missing per-service reading: this metric has no service
            // grain at all, so the cell is inapplicable rather than empty.
            td.className = "si-cell-na";
            td.title = SIGrid.composeCellTitle(null, ctx, "weekly metric");
            td.setAttribute("aria-label", item.title + " is entered weekly, not per service");
          } else if (id && field) {
            td.textContent = v !== "" ? v : "-";
            var statTitle = SIGrid.composeCellTitle(field, ctx, "");
            if (statTitle) { td.title = statTitle; }
            if (!ctx.isFrozen(ctx.state.date) && !field.archived) {
              td.className = "si-cell-clickable";
              var statStateClass = SIGrid.cellStateClass(field, ctx);
              if (statStateClass) { td.className += " " + statStateClass; }
              td.tabIndex = 0;
              td.setAttribute("role", "button");
              var statAria = "Edit " + item.title + " for " + ctx.serviceLabel(s);
              if (statTitle) { statAria += " — " + statTitle; }
              td.setAttribute("aria-label", statAria);
              td.setAttribute("data-si-cell-key", ctx.fieldCellKey(field));
              (function (cell, descriptor) {
                cell.addEventListener("click", function () { SIGrid.cellEditor(cell, descriptor, ctx); });
                cell.addEventListener("keydown", function (e) {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); SIGrid.cellEditor(cell, descriptor, ctx); }
                });
              })(td, field);
            }
          } else if (isPartial) {
            td.className = "si-cell-missing";
            td.textContent = ".";
            td.title = SIGrid.composeCellTitle(null, ctx, "not submitted");
            td.setAttribute("aria-label", "not submitted");
          } else {
            td.textContent = "-";
          }
          tr.appendChild(td);
        });
        if (!any) { tr.className = "si-row-empty"; }
        if (ctx.dirtyCells(ctx.statFields(item)).length > 0) { tr.className = (tr.className ? tr.className + " " : "") + "si-row-dirty"; }
        tbody.appendChild(tr);
      });
    } else {
      var sumByService = ctx.state.services.map(function () { return 0; });
      var sumUnique = 0;
      var sumAny = false;
      ctx.visibleTeams().forEach(function (team) {
        var countId = ctx.metricIdFor(team.count);
        var uniqueId = ctx.metricIdFor(team.unique);
        var countVisible = team.count && ctx.metricVisibilityEnabled("teams", team.count.guid);
        var uniqueVisible = team.unique && ctx.metricVisibilityEnabled("teams", team.unique.guid);
        var weeklyOnly = !team.count;
        var teamFieldList = ctx.teamFields ? ctx.teamFields(team) : [];
        teamFieldList.forEach(function (field) { field.team = team; });
        var countFields = teamFieldList.filter(function (field) { return field.kind === "count"; });
        var uniqueFields = teamFieldList.filter(function (field) { return field.kind === "unique"; });
        var findCountField = function (serviceId) {
          var matches = countFields.filter(function (field) {
            return String(field.scheduleId) === String(serviceId);
          });
          return matches.length > 0 ? matches[0] : null;
        };
        var tr = ctx.document.createElement("tr");
        if (!team.inactive) { tr.className = "si-clickable"; }
        if (ctx.state.mode === ctx.MODE_TEAMS && team.token === ctx.state.team) {
          tr.className = (tr.className ? tr.className + " " : "") + "si-row-selected";
          tr.style.background = "#fffbeb";
          tr.setAttribute("aria-current", "true");
        }
        var teamName = ctx.teamDisplayName ? ctx.teamDisplayName(team) : team.token;
        var nameContent = ctx.el("div", "si-grid-label");
        nameContent.appendChild(ctx.el("span", "si-grid-label-text", teamName));
        ctx.appendGridMetricLink(nameContent, ctx.metricHref(team), teamName);
        var name = ctx.el("td");
        name.appendChild(nameContent);
        // Most recent ModifiedDateTime across this team's count + unique
        // cells, muted, under the label (#751). Text only.
        var teamRowStamp = SIGrid.rowEditStamp(teamFieldList, ctx);
        if (teamRowStamp) { name.appendChild(ctx.el("div", "si-grid-editstamp", teamRowStamp)); }
        tr.appendChild(name);

        var serviceValues = [];
        var filledCount = 0;
        var anyVisible = false;
        if (showCount) {
          ctx.state.services.forEach(function (s) {
            var countField = findCountField(s.id);
            var countIdentity = countId ? ctx.loadedCellDescriptor(countId, s.id) : null;
            var countAmbiguous = !!(countField && countIdentity && countIdentity.ambiguous);
            var v = countVisible && countId && countField && countIdentity && !countAmbiguous
              ? ctx.draftValue(countId, s.id, countIdentity.note, countIdentity.partitionTuple) : "";
            if (v !== "") { filledCount += 1; anyVisible = true; }
            serviceValues.push({ value: v, field: countField, identity: countIdentity, ambiguous: countAmbiguous });
          });
        }
        var isPartial = filledCount > 0 && filledCount < ctx.state.services.length;

        serviceValues.forEach(function (cell, serviceIndex) {
          var v = cell.value;
          var td = ctx.document.createElement("td");
          if (weeklyOnly) {
            // A count-less team has one weekly value, not per-service values.
            // Keep every service column explicitly inapplicable, just like a
            // weekly statistic, without changing the per-cell missing state.
            td.className = "si-cell-na";
            td.title = SIGrid.composeCellTitle(null, ctx, "weekly metric");
            td.setAttribute("aria-label", teamName + " is entered weekly, not per service");
          } else if (cell.ambiguous) {
            td.className = "si-cell-ambiguous";
            td.textContent = "-";
            var ambiguousState = "Ambiguous Note rows — resolve in Rock before editing";
            var ambiguousTitle = SIGrid.composeCellTitle(cell.field, ctx, ambiguousState);
            td.title = ambiguousTitle;
            var ambiguousAria = ambiguousState;
            var ambiguousContext = SIGrid.composeCellTitle(cell.field, ctx, "");
            if (ambiguousContext) { ambiguousAria += " — " + ambiguousContext; }
            td.setAttribute("aria-label", ambiguousAria);
            td.addEventListener("click", function (event) { event.stopPropagation(); });
          } else if (cell.field) {
            td.textContent = v !== "" ? v : "-";
            var teamTitle = SIGrid.composeCellTitle(cell.field, ctx, "");
            if (teamTitle) { td.title = teamTitle; }
            if (v !== "") {
              sumByService[serviceIndex] += parseInt(v, 10);
              sumAny = true;
            }
            if (!ctx.isFrozen(ctx.state.date) && !cell.field.archived) {
              td.className = "si-cell-clickable";
              var teamStateClass = SIGrid.cellStateClass(cell.field, ctx);
              if (teamStateClass) { td.className += " " + teamStateClass; }
              td.tabIndex = 0;
              td.setAttribute("role", "button");
              // DC5: exactly "<service name> · <teamMetricLabel(team,'count')>" when
              // the resolver hook is present (Sunday) -- CR1: even with saved-cell
              // provenance (teamTitle), which stays on the visual tooltip (.title,
              // set above) only. Youth (no hook) keeps its original
              // "Edit <team> for <service> [— provenance]" wording unchanged.
              var teamAria;
              if (ctx.teamMetricLabel) {
                teamAria = ctx.serviceLabel(ctx.state.services[serviceIndex]) + " · " + ctx.teamMetricLabel(team, "count");
              } else {
                teamAria = "Edit " + teamName + " for " + ctx.serviceLabel(ctx.state.services[serviceIndex]);
                if (teamTitle) { teamAria += " — " + teamTitle; }
              }
              td.setAttribute("aria-label", teamAria);
              td.setAttribute("data-si-cell-key", ctx.fieldCellKey(cell.field));
              (function (cellNode, descriptor) {
                cellNode.addEventListener("click", function (event) {
                  event.stopPropagation();
                  SIGrid.cellEditor(cellNode, descriptor, ctx);
                });
                cellNode.addEventListener("keydown", function (event) {
                  event.stopPropagation();
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    SIGrid.cellEditor(cellNode, descriptor, ctx);
                  }
                });
              })(td, cell.field);
            }
          } else if (isPartial) {
            td.className = "si-cell-missing";
            td.textContent = ".";
            td.title = SIGrid.composeCellTitle(null, ctx, "not submitted");
            td.setAttribute("aria-label", "not submitted");
          } else {
            td.textContent = "-";
          }
          tr.appendChild(td);
        });

        var uniqueIdentity = uniqueId ? ctx.loadedCellDescriptor(uniqueId, null) : null;
        var uniqueField = uniqueFields.length > 0 ? uniqueFields[0] : null;
        var uniqueAmbiguous = !!(uniqueField && uniqueIdentity && uniqueIdentity.ambiguous);
        var u = uniqueVisible && uniqueId && uniqueField && uniqueIdentity && !uniqueAmbiguous
          ? ctx.draftValue(uniqueId, null, uniqueIdentity.note, uniqueIdentity.partitionTuple) : "";
        if (u !== "") { anyVisible = true; sumUnique += parseInt(u, 10); sumAny = true; }
        if (showTrailing) {
          var uniqueTd = ctx.el("td", "si-col-total", u === "" ? "-" : u);
          if (uniqueAmbiguous) {
            uniqueTd.className = "si-col-total si-cell-ambiguous";
            uniqueTd.textContent = "-";
            var uniqueAmbiguousState = "Ambiguous Note rows — resolve in Rock before editing";
            var uniqueAmbiguousTitle = SIGrid.composeCellTitle(uniqueField, ctx, uniqueAmbiguousState);
            uniqueTd.title = uniqueAmbiguousTitle;
            var uniqueAmbiguousAria = uniqueAmbiguousState;
            var uniqueAmbiguousContext = SIGrid.composeCellTitle(uniqueField, ctx, "");
            if (uniqueAmbiguousContext) { uniqueAmbiguousAria += " — " + uniqueAmbiguousContext; }
            uniqueTd.setAttribute("aria-label", uniqueAmbiguousAria);
            uniqueTd.addEventListener("click", function (event) { event.stopPropagation(); });
          } else if (uniqueField) {
            var uniqueTitle = SIGrid.composeCellTitle(uniqueField, ctx, "");
            if (uniqueTitle) { uniqueTd.title = uniqueTitle; }
          }
          if (!uniqueAmbiguous && uniqueField && !ctx.isFrozen(ctx.state.date) && !uniqueField.archived) {
            uniqueTd.className = "si-col-total si-cell-clickable";
            var uniqueStateClass = SIGrid.cellStateClass(uniqueField, ctx);
            if (uniqueStateClass) { uniqueTd.className += " " + uniqueStateClass; }
            uniqueTd.tabIndex = 0;
            uniqueTd.setAttribute("role", "button");
            // DC5: exactly teamMetricLabel(team,'unique') when the resolver hook is
            // present (Sunday) -- CR1: even with saved-cell provenance (uniqueTitle),
            // which stays on the visual tooltip (.title, set above) only. Youth (no
            // hook) keeps its original wording.
            var uniqueAria;
            if (ctx.teamMetricLabel) {
              uniqueAria = ctx.teamMetricLabel(team, "unique");
            } else {
              uniqueAria = "Edit " + team.token + " " + uniqueField.label;
              if (uniqueTitle) { uniqueAria += " — " + uniqueTitle; }
            }
            uniqueTd.setAttribute("aria-label", uniqueAria);
            uniqueTd.setAttribute("data-si-cell-key", ctx.fieldCellKey(uniqueField));
            (function (cellNode, descriptor) {
              cellNode.addEventListener("click", function (event) {
                event.stopPropagation();
                SIGrid.cellEditor(cellNode, descriptor, ctx);
              });
              cellNode.addEventListener("keydown", function (event) {
                event.stopPropagation();
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  SIGrid.cellEditor(cellNode, descriptor, ctx);
                }
              });
            })(uniqueTd, uniqueField);
          }
          tr.insertBefore(uniqueTd, tr.children[1]);
        }
        if (!anyVisible) { tr.className = (tr.className ? tr.className + " " : "") + "si-row-empty"; }

        if (!team.inactive) {
          tr.addEventListener("click", function () {
            ctx.selectTeamManually(team.token);
            ctx.render();
          });
        }
        tbody.appendChild(tr);
      });
      var sumRow = ctx.document.createElement("tr");
      sumRow.className = "si-row-sum";
      sumRow.appendChild(ctx.el("td", null, "SUM TOTAL"));
      if (showTrailing) { sumRow.appendChild(ctx.el("td", "si-col-total", sumAny ? String(sumUnique) : "-")); }
      if (showCount) {
        sumByService.forEach(function (sum) { sumRow.appendChild(ctx.el("td", null, sumAny ? String(sum) : "-")); });
      }
      tbody.appendChild(sumRow);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    host.appendChild(wrap);
    if (ctx.state.mode === ctx.MODE_STATS) {
      var actions = ctx.el("div", "si-matrix-actions");
      var save = ctx.el("button", "si-save");
      save.type = "button";
      save.setAttribute("data-si-save-kind", "stats-grid");
      ctx.updateSaveButton(save, ctx.dirtyCells(ctx.allStatsFields()).length > 0, ctx.isFrozen(ctx.state.date));
      save.addEventListener("click", function () {
        if (ctx.state.saving) { return; }
        ctx.saveCells(ctx.dirtyCells(ctx.allStatsFields()), "stats grid");
      });
      var cancel = ctx.el("button", "si-cancel", "CANCEL");
      cancel.type = "button";
      cancel.setAttribute("data-si-cancel-kind", "stats-grid");
      cancel.disabled = ctx.dirtyCells(ctx.allStatsFields()).length === 0 || ctx.isFrozen(ctx.state.date);
      cancel.addEventListener("click", function () {
        if (ctx.state.saving) { return; }
        ctx.allStatsFields().forEach(function (field) {
          var key = ctx.fieldCellKey(field);
          delete ctx.state.draft[key];
          delete ctx.state.draftVersions[key];
          delete ctx.state.validationErrors[key];
        });
        ctx.render();
      });
      actions.appendChild(save);
      actions.appendChild(cancel);
      host.appendChild(actions);
    } else {
      var teamActions = ctx.el("div", "si-matrix-actions");
      var teamSave = ctx.el("button", "si-save");
      teamSave.type = "button";
      teamSave.setAttribute("data-si-save-kind", "teams");
      ctx.updateSaveButton(teamSave, ctx.dirtyCells(ctx.allTeamFields()).length > 0, ctx.isFrozen(ctx.state.date));
      teamSave.addEventListener("click", function () {
        if (ctx.state.saving) { return; }
        ctx.saveCells(ctx.dirtyCells(ctx.allTeamFields()), "teams grid");
      });
      var teamCancel = ctx.el("button", "si-cancel", "CANCEL");
      teamCancel.type = "button";
      teamCancel.setAttribute("data-si-cancel-kind", "teams-grid");
      teamCancel.disabled = ctx.dirtyCells(ctx.allTeamFields()).length === 0 || ctx.isFrozen(ctx.state.date);
      teamCancel.addEventListener("click", function () {
        if (ctx.state.saving) { return; }
        ctx.allTeamFields().forEach(function (field) {
          var key = ctx.fieldCellKey(field);
          delete ctx.state.draft[key];
          delete ctx.state.draftVersions[key];
          delete ctx.state.validationErrors[key];
        });
        ctx.render();
      });
      teamActions.appendChild(teamSave);
      teamActions.appendChild(teamCancel);
      host.appendChild(teamActions);
    }
    host.appendChild(ctx.el("p", "si-note", "Tap any row to edit · archived teams are hidden"));
  },
  cellEditor: function (td, field, ctx) {
    // First statement, before any guard below (§9, CONTRACT.md): the hint and
    // a cell's edit mode are mutually exclusive, whether cellEditor was
    // reached via click or via Enter/Space keydown.
    SIGrid.hideHint({ immediate: true });
    // This predicate is deliberately repeated at the seam, rather than only
    // at render time. A stale click or key event must never write to a closed
    // Sunday after the date changes.
    var identity = field && (field.kind === "count" || field.kind === "unique") && ctx.loadedCellDescriptor
      ? ctx.loadedCellDescriptor(field.metricId, field.scheduleId)
      : null;
    if (!td || !field || ctx.isFrozen(ctx.state.date) || field.archived || (identity && identity.ambiguous) || ctx.state.saving) { return false; }
    if (td.querySelector && td.querySelector("input")) { return false; }

    var key = ctx.fieldCellKey(field);
    var initialValue = ctx.draftValue(field.metricId, field.scheduleId, field.note, field.partitionTuple);
    var originalClass = td.className;
    var table = td;
    var editing = true;
    var input = ctx.document.createElement("input");
    var metricGuid = ctx.metricGuidForId ? ctx.metricGuidForId(field.metricId) : null;
    var label = td.getAttribute("aria-label") || "Edit value";
    var error = ctx.validationError ? ctx.validationError(field) : "";

    while (table && String(table.tagName || "").toLowerCase() !== "table") {
      table = table.parentNode;
    }

    input.type = "number";
    input.min = "0";
    input.placeholder = "-";
    input.className = "si-num si-grid-editor";
    input.value = initialValue;
    input.setAttribute("data-si-cell-key", key);
    input.setAttribute("aria-label", label);
    if (metricGuid) { input.setAttribute("data-si-metric-guid", metricGuid); }
    var inputTitle = SIGrid.composeCellTitle(field, ctx, error);
    if (inputTitle) { input.title = inputTitle; }
    if (error) {
      input.setAttribute("aria-invalid", "true");
    }

    function displayValue(value) {
      return value === "" ? "-" : String(value);
    }

    function refreshActions() {
      if (!ctx.document.querySelectorAll) { return; }
      var isTeams = field.kind === "count" || field.kind === "unique";
      var dirtyFields = isTeams ? ctx.allTeamFields() : ctx.allStatsFields();
      var dirty = ctx.dirtyCells(dirtyFields).length > 0;
      var saveKind = isTeams ? "teams" : "stats-grid";
      var saves = ctx.document.querySelectorAll(".si-save[data-si-save-kind='" + saveKind + "']");
      var cancelKind = isTeams ? "teams-grid" : "stats-grid";
      var cancels = ctx.document.querySelectorAll(".si-cancel[data-si-cancel-kind='" + cancelKind + "']");
      Array.prototype.forEach.call(saves, function (button) {
        ctx.updateSaveButton(button, dirty, ctx.isFrozen(ctx.state.date));
      });
      Array.prototype.forEach.call(cancels, function (button) {
        button.disabled = ctx.state.saving || !dirty || ctx.isFrozen(ctx.state.date);
      });
    }

    function refreshRow() {
      var tr = td.parentNode;
      var fields = field.item && ctx.statFields
        ? ctx.statFields(field.item)
        : (field.team && ctx.teamFields ? ctx.teamFields(field.team) : []);
      var total = 0;
      var any = false;
      fields.forEach(function (candidate) {
        var value = ctx.draftValue(candidate.metricId, candidate.scheduleId, candidate.note, candidate.partitionTuple);
        if (value !== "") {
          total += parseInt(value, 10);
          any = true;
        }
      });
      if (field.item && tr && tr.children && tr.children.length > 1) {
        var totalCell = tr.children[1];
        if (totalCell !== td && !(totalCell.querySelector && totalCell.querySelector("input"))) {
          totalCell.textContent = any ? String(total) : "-";
        }
      }
      if (tr) {
        var rowDirty = fields.length > 0 && ctx.dirtyCells(fields).length > 0;
        tr.className = tr.className.replace(/\s*si-row-dirty/g, "");
        if (rowDirty) { tr.className += " si-row-dirty"; }
      }
      if (field.kind === "count" || field.kind === "unique") {
        var sumRow = table && table.querySelectorAll ? table.querySelectorAll("tr.si-row-sum") : [];
        if (sumRow.length > 0) {
          var summary = sumRow[0];
          var countSums = ctx.state.services.map(function () { return 0; });
          var uniqueSum = 0;
          var hasValue = false;
          ctx.visibleTeams().forEach(function (team) {
            ctx.teamFields(team).forEach(function (candidate) {
              var value = ctx.draftValue(candidate.metricId, candidate.scheduleId, candidate.note, candidate.partitionTuple);
              if (value === "") { return; }
              hasValue = true;
              if (candidate.kind === "unique") {
                uniqueSum += parseInt(value, 10);
                return;
              }
              ctx.state.services.forEach(function (service, serviceIndex) {
                if (String(service.id) === String(candidate.scheduleId)) {
                  countSums[serviceIndex] += parseInt(value, 10);
                }
              });
            });
          });
          var hasTrailing = summary.children.length > 1
            && String(summary.children[1].className || "").indexOf("si-col-total") >= 0;
          var firstServiceIndex = hasTrailing ? 2 : 1;
          if (hasTrailing) { summary.children[1].textContent = hasValue ? String(uniqueSum) : "-"; }
          ctx.state.services.forEach(function (service, serviceIndex) {
            var serviceCell = summary.children[firstServiceIndex + serviceIndex];
            if (serviceCell) { serviceCell.textContent = hasValue ? String(countSums[serviceIndex]) : "-"; }
          });
        }
      }
    }

    function restoreCell() {
      var value = ctx.draftValue(field.metricId, field.scheduleId, field.note, field.partitionTuple);
      var stateClass = SIGrid.cellStateClass(field, ctx);
      var baseClass = originalClass
        .replace(/\s*si-cell-draft/g, "")
        .replace(/\s*si-cell-empty/g, "");
      td.innerHTML = "";
      td.className = baseClass + (stateClass ? " " + stateClass : "");
      td.textContent = displayValue(value);
      var restoredTitle = SIGrid.composeCellTitle(field, ctx, error);
      if (restoredTitle) {
        td.title = restoredTitle;
      } else {
        td.removeAttribute("title");
      }
    }

    function nextEditableCell(direction) {
      if (!table || !table.querySelectorAll) { return null; }
      var cells = Array.prototype.slice.call(table.querySelectorAll("td.si-cell-clickable"));
      var currentIndex = cells.indexOf(td);
      var nextIndex = currentIndex + direction;
      return currentIndex >= 0 && nextIndex >= 0 && nextIndex < cells.length ? cells[nextIndex] : null;
    }

    function finish(commit, focusCell) {
      if (!editing) { return; }
      editing = false;
      if (commit) {
        ctx.setDraft(field.metricId, field.scheduleId, input.value, field.note, field.partitionTuple);
      } else {
        ctx.setDraft(field.metricId, field.scheduleId, initialValue, field.note, field.partitionTuple);
      }
      restoreCell();
      refreshRow();
      refreshActions();
      if (focusCell) { td.focus(); }
    }

    td.className = originalClass + " si-cell-editing";
    td.innerHTML = "";
    td.appendChild(input);
    if (ctx.appendValidationError) { ctx.appendValidationError(td, field); }
    input.addEventListener("input", function () {
      if (!editing || ctx.state.saving) { return; }
      ctx.setDraft(field.metricId, field.scheduleId, input.value, field.note, field.partitionTuple);
      refreshRow();
      refreshActions();
    });
    input.addEventListener("click", function (event) { event.stopPropagation(); });
    input.addEventListener("keydown", function (event) {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        finish(false, true);
      } else if (event.key === "Enter") {
        event.preventDefault();
        finish(true, true);
      } else if (event.key === "Tab") {
        event.preventDefault();
        var next = nextEditableCell(event.shiftKey ? -1 : 1);
        finish(true, false);
        if (next) {
          next.focus();
          next.click();
        }
      }
    });
    input.addEventListener("blur", function () { finish(true, false); });
    input.focus();
    if (input.select) { input.select(); }
    return true;
  },
  cellStateClass: function (field, ctx) {
    if (!field || !ctx) { return ""; }
    // dirtyCells([field]) uses fieldCellKey(field), so the visual state and
    // the payload sent by SAVE cannot disagree about this cell's identity.
    if (ctx.dirtyCells([field]).length > 0) { return "si-cell-draft"; }
    if (ctx.draftValue(field.metricId, field.scheduleId, field.note, field.partitionTuple) === ""
      && ctx.savedValue(field.metricId, field.scheduleId, field.note, field.partitionTuple) === "") {
      return "si-cell-empty";
    }
    return "";
  },
  guardNavigation: function (ctx, proceed) {
    var confirmed = !ctx.dirty || window.confirm("You have unsaved changes. Discard this draft?");
    if (confirmed) { proceed(); }
    return confirmed;
  }
};
