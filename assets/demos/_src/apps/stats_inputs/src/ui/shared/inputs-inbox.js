  // ---- Input Apps: the responsibility model (#677) ----------------------
  // Pure functions, no DOM, no state, ES5. This file is concatenated into the
  // page IIFE by apps/stats_inputs/build (manifest.json order) and is also
  // loaded verbatim by the workbench prototype and the Node harness tests,
  // so it must stay free of every page global (state, SPEC, VIEWER, document).
  //
  // A responsibility is DERIVED from Rock values, never stored (plan D2):
  //   complete  <=>  every required field has a saved value
  //   blank !== zero: "" is not reported, "0" is reported none (plan §3.2)
  //
  // Callers hand in "units": the cells a responsibility owns, with the saved
  // value and its modified-by meta already resolved, so this module never
  // needs the cell-key machinery in metrics.js.
  //
  //   unit = { key, kind: "team"|"department", defaultLabel, matchNames: [..],
  //            fields: [{ id, label, guid, required, value, meta: {at, by}, source }] }
  //
  // Ownership (plan D3) comes from preferences.responsibilities[key].owners
  // (Ministry Team group Guids). A membership whose group NAME matches the
  // unit's matchNames is only ever a SUGGESTION, labelled as such by the UI.

  // A team responsibility is its volunteer counts; a department is its stats.
  // Both say so in the default label because Kids the team and Kids the
  // department are two Rock things a viewer may own separately (plan §3.1).
  var INBOX_DEFAULT_DEPARTMENT_LABELS = {
    "PEOPLE": "People stats",
    "KIDS": "Kids stats",
    "STATS": "Sunday attendance",
    "SPECIAL SERVICES": "Special services",
    "CIW": "CIW",
    "UNASSIGNED": "Other stats"
  };
  var INBOX_TEAM_LABEL_SUFFIX = " volunteers";

  function inboxTeamLabel(token) {
    var base = inboxLabelFromToken(token);
    return base ? base + INBOX_TEAM_LABEL_SUFFIX : "";
  }

  function inboxNormalizeName(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/^(mnl|bne|sel)\b[\s|:-]*/, "")
      .replace(/\b(team|teams|ministry|the|favor)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // "SECURITY & PARKING" -> "Security & Parking"; "CRTVSxPROD" is kept as is
  // because it is not a word. Tokens are the names staff already use, so the
  // default only softens shouting caps; Setup can override the label.
  function inboxLabelFromToken(token) {
    var raw = String(token || "").trim();
    if (!raw) { return ""; }
    if (/[a-z]/.test(raw) && /[A-Z]/.test(raw) && !/\s/.test(raw)) { return raw; }
    return raw.split(/(\s+|\(|\)|,|&|\/)/).map(function (part) {
      if (!/[A-Za-z]/.test(part)) { return part; }
      if (part.length <= 3 && part === part.toUpperCase() && part !== "AND") { return part; }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join("");
  }

  function inboxDepartmentLabel(department) {
    var key = String(department || "UNASSIGNED").toUpperCase();
    return INBOX_DEFAULT_DEPARTMENT_LABELS[key] || inboxLabelFromToken(key);
  }

  function inboxResponsibilityKey(kind, campus, token) {
    return (kind === "department" ? "dept" : "team") + ":" + String(campus || "").toUpperCase() + ":" + String(token || "");
  }

  function inboxRequired(field) {
    return field.required !== false;
  }

  function inboxHasValue(field) {
    return field.value !== null && field.value !== undefined && String(field.value) !== "";
  }

  function inboxLatestMeta(fields) {
    var latest = null;
    var latestTime = 0;
    fields.forEach(function (field) {
      if (!inboxHasValue(field) || !field.meta || !field.meta.at) { return; }
      var t = new Date(field.meta.at).getTime();
      if (!isNaN(t) && t > latestTime) { latestTime = t; latest = field.meta; }
    });
    return latest;
  }

  // "10:42" today, "Sun 10:42" this week, "Sep 14" otherwise. All in the
  // operational (campus) time zone: the bridge stamps Manila wall-clock with
  // +08:00, so the browser must not reinterpret it.
  function inboxFormatWhen(iso, now, timeZone) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ""; }
    var ref = now instanceof Date ? now : new Date(now || Date.now());
    var tz = timeZone || "Asia/Manila";
    var dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    var sameDay = dayFmt.format(d) === dayFmt.format(ref);
    var time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d).replace(/\u202f/g, " ");
    if (sameDay) { return time; }
    var diffDays = (ref.getTime() - d.getTime()) / 86400000;
    if (diffDays >= 0 && diffDays < 7) {
      return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(d) + " " + time;
    }
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(d);
  }

  function inboxFormatReceipt(meta, now, timeZone) {
    if (!meta || !meta.at) { return ""; }
    var when = inboxFormatWhen(meta.at, now, timeZone);
    var by = meta.by ? String(meta.by) : "";
    if (by && when) { return "Saved by " + by + " · " + when; }
    if (when) { return "Saved · " + when; }
    return by ? "Saved by " + by : "Saved";
  }

  function inboxMembershipIsLeader(mem) {
    return !!mem && (mem.isLeader === 1 || mem.isLeader === "1" || mem.isLeader === true);
  }

  // Word containment after normalisation: "MNL Favor Kids Team" matches
  // "MNL Kids" because every word of the shorter name appears in the longer.
  // A one-word name must match exactly, so "Host" never claims "Hospitality".
  function inboxMatchesName(groupName, matchNames) {
    var g = inboxNormalizeName(groupName);
    if (!g) { return false; }
    var gWords = g.split(" ");
    return (matchNames || []).some(function (candidate) {
      var c = inboxNormalizeName(candidate);
      if (!c) { return false; }
      if (g === c) { return true; }
      var cWords = c.split(" ");
      var shorter = cWords.length <= gWords.length ? cWords : gWords;
      var longer = shorter === cWords ? gWords : cWords;
      return shorter.every(function (w) { return longer.indexOf(w) >= 0; });
    });
  }

  function inboxStatusLine(item) {
    if (item.complete) { return item.receiptText || "Saved"; }
    if (item.progress.done === 0) { return "Not started"; }
    var left = item.progress.total - item.progress.done;
    var line = left + (left === 1 ? " number left" : " numbers left");
    if (item.latestMeta && item.latestMeta.by) { line += " · last saved by " + item.latestMeta.by; }
    return line;
  }

  // The one function the page, the home card, and the prototype all call.
  function buildResponsibilities(input) {
    var prefs = input.preferences || {};
    var configured = prefs.responsibilities || {};
    var memberships = input.memberships || [];
    var now = input.now || new Date();
    var tz = input.timeZone || "Asia/Manila";
    var out = (input.units || []).map(function (unit, index) {
      var conf = configured[unit.key] || {};
      var owners = (conf.owners || []).map(function (g) { return String(g).toLowerCase(); });
      var fields = (unit.fields || []).map(function (f) {
        return {
          id: f.id, label: f.label, guid: f.guid, source: f.source || "manual",
          required: inboxRequired(f), value: f.value, meta: f.meta || null
        };
      });
      var required = fields.filter(inboxRequired);
      var done = required.filter(inboxHasValue).length;
      var owned = memberships.filter(function (m) { return owners.indexOf(String(m.groupGuid || "").toLowerCase()) >= 0; });
      var matched = owned.length > 0 ? [] : memberships.filter(function (m) { return inboxMatchesName(m.groupName, unit.matchNames); });
      var relevant = owned.length > 0 ? owned : matched;
      var latestMeta = inboxLatestMeta(fields);
      var complete = required.length > 0 && done === required.length;
      return {
        key: unit.key,
        kind: unit.kind,
        label: conf.label ? String(conf.label) : unit.defaultLabel,
        fields: fields,
        required: required,
        optional: fields.filter(function (f) { return !inboxRequired(f); }),
        progress: { done: done, total: required.length },
        complete: complete,
        latestMeta: latestMeta,
        receiptText: complete ? inboxFormatReceipt(latestMeta, now, tz) : "",
        owners: owners,
        mine: owned.length > 0,
        suggested: owned.length === 0 && matched.length > 0,
        leader: relevant.some(inboxMembershipIsLeader),
        roleName: relevant.length > 0 ? String(relevant[0].roleName || "") : "",
        order: index
      };
    });
    out.forEach(function (item) { item.statusLine = inboxStatusLine(item); });
    return inboxOrder(out);
  }

  // Plan §3.3: mine unfinished (leaders first), suggested unfinished, other
  // unfinished, then receipts newest first. Ties keep the catalog order.
  function inboxOrder(list) {
    function rank(item) {
      if (item.complete) { return 3; }
      if (item.mine) { return 0; }
      if (item.suggested) { return 1; }
      return 2;
    }
    return list.slice().sort(function (a, b) {
      var ra = rank(a), rb = rank(b);
      if (ra !== rb) { return ra - rb; }
      if (ra === 3) {
        var ta = a.latestMeta && a.latestMeta.at ? new Date(a.latestMeta.at).getTime() : 0;
        var tb = b.latestMeta && b.latestMeta.at ? new Date(b.latestMeta.at).getTime() : 0;
        if (ta !== tb) { return tb - ta; }
      } else if (ra === 0 && a.leader !== b.leader) {
        return a.leader ? -1 : 1;
      }
      return a.order - b.order;
    });
  }

  function inboxSummary(list) {
    var visible = list.filter(function (item) { return item.progress.total > 0; });
    var done = visible.filter(function (item) { return item.complete; }).length;
    return {
      total: visible.length,
      done: done,
      allDone: visible.length > 0 && done === visible.length,
      line: visible.length === 0 ? "Nothing to enter yet" : (done === visible.length ? "You're all caught up." : done + " of " + visible.length + " finished")
    };
  }

  // The viewer's slice of the inbox: owned and suggested work first, receipts
  // for those, and nothing else. A viewer who owns nothing gets the whole
  // campus picture, which is what an operator needs (plan §3.3).
  function inboxForViewer(list) {
    var mineOrSuggested = list.filter(function (item) { return item.mine || item.suggested; });
    if (mineOrSuggested.length === 0) { return { items: list, scoped: false }; }
    return { items: mineOrSuggested, scoped: true };
  }

  function inboxNextUnfinished(list, afterKey) {
    var idx = -1;
    list.forEach(function (item, i) { if (item.key === afterKey) { idx = i; } });
    for (var step = 1; step <= list.length; step += 1) {
      var candidate = list[(idx + step) % list.length];
      if (candidate && !candidate.complete && candidate.key !== afterKey) { return candidate; }
    }
    return null;
  }

  var inboxExports = {
    buildResponsibilities: buildResponsibilities,
    inboxOrder: inboxOrder,
    inboxSummary: inboxSummary,
    inboxForViewer: inboxForViewer,
    inboxNextUnfinished: inboxNextUnfinished,
    inboxFormatReceipt: inboxFormatReceipt,
    inboxFormatWhen: inboxFormatWhen,
    inboxLabelFromToken: inboxLabelFromToken,
    inboxTeamLabel: inboxTeamLabel,
    inboxDepartmentLabel: inboxDepartmentLabel,
    inboxResponsibilityKey: inboxResponsibilityKey,
    inboxMatchesName: inboxMatchesName,
    inboxNormalizeName: inboxNormalizeName
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = inboxExports; }
  if (typeof window !== "undefined") { window.FavorInputsInbox = inboxExports; }

