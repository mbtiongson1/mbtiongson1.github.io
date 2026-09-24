/* Prototype renderer. It calls the REAL responsibility model
   (apps/stats_inputs/src/ui/shared/inputs-inbox.js) over fictional data, so what this page
   shows is what the app will derive. Rendering here is prototype-only. */
(function () {
  var I = window.FavorInputsInbox;
  var P = window.PROTO;
  var ICON = {
    burst: '<svg viewBox="0 0 1500 1500" aria-hidden="true"><path d="m1141.9 750 171.5-74.17-184.85-27.26L1275 532.54l-185.6 21.51 111.43-149.98-173.71 68.81 68.81-173.71L945.95 410.6 967.46 225 851.43 371.45 824.17 186.6 750 358.1l-74.17-171.5-27.26 184.85L532.54 225l21.51 185.6-149.98-111.43 68.81 173.71-173.71-68.81L410.6 554.05 225 532.54l146.45 116.03-184.85 27.26L358.1 750l-171.5 74.17 184.85 27.26L225 967.46l185.6-21.51-111.43 149.98 173.71-68.81-68.81 173.71 149.98-111.43-21.51 185.6 116.03-146.45 27.26 184.85L750 1141.9l74.17 171.5 27.26-184.85L967.46 1275l-21.51-185.6 149.98 111.43-68.81-173.71 173.71 68.81-111.43-149.98 185.6 21.51-146.45-116.03 184.85-27.26z"/></svg>',
    chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    tick: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 7"/></svg>',
    gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    ext: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
    grid: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h16M4 19h16"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };
  window.PROTO_ICON = ICON;

  function el(tag, cls, html) { var n = document.createElement(tag); if (cls) { n.className = cls; } if (html !== undefined) { n.innerHTML = html; } return n; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function shell(mount, opts) {
    var s = el("header", "in-shell");
    s.innerHTML = '<div class="in-shell__inner">' +
      '<a class="in-shell__brand" href="index.html"><span class="in-shell__mark">' + ICON.burst + '</span><span class="in-shell__name">Sunday Inputs<small>Favor Church</small></span></a>' +
      '<div class="in-shell__tools">' +
        '<a class="in-iconbtn" href="index.html?view=all" title="All inputs">' + ICON.grid + '<span>All inputs</span></a>' +
        '<a class="in-iconbtn' + (opts && opts.setup ? ' is-on' : '') + '" href="setup.html" aria-label="Setup" title="Setup">' + ICON.gear + '</a>' +
      '</div></div>';
    mount.appendChild(s);
  }

  function scope(mount) {
    var row = el("div", "in-scope");
    row.innerHTML = '<label class="in-chip"><span>Manila</span><select aria-label="Campus"><option>Manila</option><option>Brisbane</option><option>Seoul</option></select></label>' +
      '<label class="in-chip"><span>Sunday, Sep 20</span><select aria-label="Sunday"><option>Sunday, Sep 20 (this Sunday)</option><option>Sunday, Sep 13</option><option>Sunday, Sep 6</option></select></label>';
    mount.appendChild(row);
  }

  function computed() {
    var all = I.buildResponsibilities({ units: P.units(), memberships: P.viewer.memberships, preferences: P.preferences, viewer: P.viewer, now: P.now });
    var scoped = I.inboxForViewer(all);
    return { all: all, items: scoped.items, scoped: scoped.scoped, summary: I.inboxSummary(scoped.items) };
  }

  function card(item) {
    var isBtn = !item.complete;
    var node = el(isBtn ? "button" : "div", isBtn ? ("in-card" + (item.progress.done > 0 ? " in-card--started" : "") + (item.mine ? " in-card--mine" : "") + (item.suggested ? " in-card--suggested" : "")) : "in-receipt");
    if (isBtn) {
      node.type = "button";
      node.setAttribute("data-key", item.key);
      var role = item.mine ? '<span class="in-card__role">' + esc(item.roleName || "Yours") + '</span>' : (item.suggested ? '<span class="in-card__role">Probably yours</span>' : "");
      node.innerHTML = '<span class="in-card__label">' + esc(item.label) + '</span>' +
        '<span class="in-card__status"><span class="in-dot" aria-hidden="true"></span>' + esc(item.statusLine) + (role ? ' ' + role : '') + '</span>' +
        '<span class="in-card__cta">' + (item.progress.done > 0 ? "Continue" : "Start") + ICON.chev + '</span>' +
        (item.suggested ? '<span class="in-card__note">Matched by team name. Confirm the owner in Setup.</span>' : "");
      node.addEventListener("click", function () { location.href = "entry.html?key=" + encodeURIComponent(item.key); });
    } else {
      node.innerHTML = '<span class="in-receipt__tick">' + ICON.tick + '</span>' +
        '<span class="in-receipt__label">' + esc(item.label) + '</span>' +
        '<span class="in-receipt__meta">' + esc(item.receiptText) + '</span>' +
        '<button type="button" class="in-receipt__edit" aria-label="Edit ' + esc(item.label) + '">Edit</button>';
      node.querySelector("button").addEventListener("click", function () { location.href = "entry.html?key=" + encodeURIComponent(item.key); });
    }
    return node;
  }

  function home(mount) {
    var c = computed();
    var wrap = el("div");
    wrap.appendChild(el("p", "in-fictional", "Fictional prototype data."));
    var head = el("div", "in-head");
    head.innerHTML = '<h1 class="in-head__title">Sunday, Sep 20</h1><p class="in-head__sub">Manila · ' + (c.scoped ? "your inputs" : "every input for the campus") + '</p>';
    wrap.appendChild(head);
    var pct = c.summary.total ? Math.round(100 * c.summary.done / c.summary.total) : 0;
    var prog = el("div", "in-progress" + (c.summary.allDone ? " is-done" : ""));
    prog.innerHTML = '<div class="in-progress__line"><span>' + (c.summary.allDone ? "You’re all caught up." : '<strong>' + c.summary.done + '</strong> of ' + c.summary.total + ' finished') + '</span><span class="in-tabular">' + pct + '%</span></div><div class="in-progress__bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + c.summary.total + '" aria-valuenow="' + c.summary.done + '" style="--in-progress-scale:' + (pct / 100) + '"><span></span></div>';
    wrap.appendChild(prog);

    var open = c.items.filter(function (i) { return !i.complete; });
    var done = c.items.filter(function (i) { return i.complete; });
    var sec = el("section", "in-section");
    sec.innerHTML = '<div class="in-section__head"><h2 class="in-section__title">Your inputs</h2><span class="in-section__count">' + open.length + ' to finish</span></div>';
    var list = el("ul", "in-list");
    open.forEach(function (item) { var li = el("li"); li.appendChild(card(item)); list.appendChild(li); });
    if (open.length === 0) { list.appendChild(el("li", "in-empty", "<strong>Nothing left for this Sunday</strong>Everything you own is saved in Rock.")); }
    sec.appendChild(list);
    wrap.appendChild(sec);

    if (done.length) {
      var dsec = el("section", "in-section");
      dsec.innerHTML = '<div class="in-section__head"><h2 class="in-section__title">Done</h2><span class="in-section__count">' + done.length + ' saved</span></div>';
      var dl = el("ul", "in-list");
      done.forEach(function (item) { var li = el("li"); li.appendChild(card(item)); dl.appendChild(li); });
      dsec.appendChild(dl);
      wrap.appendChild(dsec);
    }

    var auto = el("section", "in-section");
    auto.innerHTML = '<div class="in-section__head"><h2 class="in-section__title">Automatic</h2></div>' +
      '<div class="in-auto"><span class="in-auto__label">Total unique volunteers</span><span class="in-auto__source"><span class="in-auto__badge">Automatic</span> Derived from team entries · ' + P.derivedUnique.filled + ' of ' + P.derivedUnique.of + ' teams in</span><span class="in-auto__value">' + P.derivedUnique.value + '</span></div>';
    wrap.appendChild(auto);

    var links = el("div", "in-links");
    links.innerHTML = '<a href="index.html?view=all">' + ICON.grid + 'See all inputs</a><a href="#">' + ICON.ext + 'History in Rock</a>';
    wrap.appendChild(links);
    mount.appendChild(wrap);
    return c;
  }

  function findItem(key) {
    var c = computed();
    var hit = c.all.filter(function (i) { return i.key === key; })[0];
    return { item: hit || c.all.filter(function (i) { return !i.complete; })[0], all: c.all, list: c.items };
  }

  function entry(mount, key, opts) {
    var found = findItem(key);
    var item = found.item;
    var fields = item.fields;
    var wrap = el("div", "in-entry");
    wrap.setAttribute("data-key", item.key);
    if (!(opts && opts.inPane)) {
      var back = el("a", "in-back"); back.href = "index.html"; back.innerHTML = ICON.back + "My Inputs"; wrap.appendChild(back);
    }
    var head = el("div", "in-head");
    head.innerHTML = '<h1 class="in-head__title">' + esc(item.label) + '</h1><p class="in-head__sub">Sunday, Sep 20 · Manila' + (item.mine ? ' · ' + esc(item.roleName) : '') + '</p>';
    wrap.appendChild(head);

    var grid = el("div", "in-entry__fields");
    fields.forEach(function (f, idx) {
      var wide = /unique/i.test(f.label);
      var fc = el("div", "in-field" + (wide ? " in-field--wide" : ""));
      var inputId = "f" + idx;
      fc.innerHTML = '<div class="in-field__head"><label class="in-field__label" for="' + inputId + '">' + esc(f.label) + (f.sub ? '<small>' + esc(f.sub) + '</small>' : '') + '</label><span class="in-field__req' + (f.required ? ' is-required' : '') + '">' + (f.required ? 'Required' : 'Optional') + '</span></div>' +
        '<input class="in-num" id="' + inputId + '" type="number" inputmode="numeric" min="0" step="1" placeholder="—" value="' + esc(f.value || "") + '" aria-describedby="' + inputId + '-r">' +
        (f.meta ? '<div class="in-field__receipt" id="' + inputId + '-r">' + ICON.tick + esc(I.inboxFormatReceipt(f.meta, P.now)) + '</div>' : '<div class="in-field__receipt" id="' + inputId + '-r">Not reported yet</div>');
      var input = fc.querySelector("input");
      input.addEventListener("input", function () {
        var dirty = input.value !== String(f.value || "");
        fc.classList.toggle("is-dirty", dirty);
        refresh();
      });
      grid.appendChild(fc);
    });
    wrap.appendChild(grid);

    var foot = el("div", "in-entry__foot");
    var count = el("p", "in-entry__count");
    var save = el("button", "in-primary"); save.type = "button"; save.innerHTML = ICON.tick + '<span>Save and finish</span>'; save.disabled = true;
    var reset = el("button", "in-text-btn", "Reset changes"); reset.type = "button"; reset.disabled = true;
    foot.appendChild(count); foot.appendChild(save); foot.appendChild(reset);
    wrap.appendChild(foot);

    function refresh() {
      var inputs = grid.querySelectorAll("input");
      var dirty = false, done = 0, total = 0;
      inputs.forEach(function (inp, i) {
        var f = fields[i];
        if (inp.value !== String(f.value || "")) { dirty = true; }
        if (f.required) { total += 1; if (inp.value !== "") { done += 1; } }
      });
      count.textContent = done + " of " + total + " required saved" + (dirty ? " once you save" : "");
      count.classList.toggle("is-done", done === total && !dirty);
      save.disabled = !dirty;
      reset.disabled = !dirty;
    }
    refresh();

    reset.addEventListener("click", function () {
      grid.querySelectorAll("input").forEach(function (inp, i) { inp.value = fields[i].value || ""; inp.parentNode.classList.remove("is-dirty"); });
      refresh();
    });

    save.addEventListener("click", function () {
      save.disabled = true; save.setAttribute("aria-busy", "true"); save.innerHTML = '<span class="in-spin" aria-hidden="true"></span><span>Saving…</span>';
      window.PROTO_STATUS && window.PROTO_STATUS.busy("Saving " + item.label + "…");
      setTimeout(function () {
        grid.querySelectorAll("input").forEach(function (inp, i) { fields[i].value = inp.value; fields[i].meta = { at: new Date().toISOString(), by: P.viewer.name }; inp.parentNode.classList.remove("is-dirty"); inp.parentNode.querySelector(".in-field__receipt").innerHTML = ICON.tick + esc(I.inboxFormatReceipt(fields[i].meta, new Date())); });
        save.removeAttribute("aria-busy"); save.innerHTML = ICON.tick + '<span>Save and finish</span>';
        window.PROTO_STATUS && window.PROTO_STATUS.done("Saved · " + I.inboxFormatWhen(new Date().toISOString(), new Date()));
        var req = fields.filter(function (f) { return f.required; });
        var complete = req.every(function (f) { f.value !== ""; return f.value !== ""; });
        if (complete) {
          var next = I.inboxNextUnfinished(found.list, item.key);
          var done = el("div", "in-done");
          done.innerHTML = '<div class="in-done__title"><span class="in-receipt is-fresh" style="display:contents"><span class="in-receipt__tick">' + ICON.tick + '</span></span>' + esc(item.label) + ' is done</div>' +
            '<p class="in-done__meta">' + esc(I.inboxFormatReceipt({ at: new Date().toISOString(), by: P.viewer.name }, new Date())) + '</p>' +
            '<div class="in-done__next">' + (next ? '<a class="in-primary" href="entry.html?key=' + encodeURIComponent(next.key) + '"><span>Next: ' + esc(next.label) + '</span>' + ICON.next + '</a>' : '<p class="in-progress is-done"><span class="in-progress__line">You’re all caught up.</span></p>') + '<a class="in-secondary" href="index.html">Back to My Inputs</a></div>';
          foot.replaceWith(done);
          done.querySelector(".in-primary, .in-secondary").focus();
        } else { refresh(); }
      }, 700);
    });
    mount.appendChild(wrap);
    return item;
  }

  // A tiny ES5 status chip with the shared .ux-status classes (the app uses inputs-status.js).
  function mountStatus(root) {
    var chip = el("div", "ux-status"); chip.dataset.open = "false"; chip.dataset.kind = "info"; chip.setAttribute("role", "status");
    chip.innerHTML = '<span class="ux-status__mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 8v.5M12 11.5V17"/></svg></span><span class="ux-status__text"></span><button type="button" class="ux-status__btn" hidden>Dismiss</button>';
    root.appendChild(chip);
    var timer = null;
    var MARK = { done: "M4 12.5l5 5L20 7", fail: "M12 6v7.5M12 17.2v.6", busy: "M12 3a9 9 0 0 1 9 9", info: "M12 8v.5M12 11.5V17" };
    function show(kind, text, hold) {
      clearTimeout(timer); chip.dataset.kind = kind; chip.querySelector("path").setAttribute("d", MARK[kind]); chip.querySelector(".ux-status__text").textContent = text; chip.querySelector("button").hidden = kind !== "fail"; chip.dataset.open = "true";
      if (hold) { timer = setTimeout(function () { chip.dataset.open = "false"; }, hold); }
    }
    chip.querySelector("button").addEventListener("click", function () { chip.dataset.open = "false"; });
    return { busy: function (t) { show("busy", t, 0); }, done: function (t) { show("done", t, 3200); }, fail: function (t) { show("fail", t, 0); }, info: function (t) { show("info", t, 2600); } };
  }

  window.PROTO_RENDER = { shell: shell, scope: scope, home: home, entry: entry, computed: computed, mountStatus: mountStatus, el: el, esc: esc };
}());
