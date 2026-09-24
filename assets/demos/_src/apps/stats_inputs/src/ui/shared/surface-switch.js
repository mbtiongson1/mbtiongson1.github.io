
  // Header surface switcher (#715). The brand word is baked per surface in each
  // shell ("SUNDAY", "YOUTH"); the span beside it is the mode word that
  // render.js keeps in sync. This module owns only the dropdown that moves the
  // reader between stats surfaces, which replaced the old /reporting/metrics
  // external link.
  //
  // The list lives here, once, rather than in each shell: the shells are already
  // near-duplicates and a second copy of the route table is a second thing to
  // forget. Routes match src/surfaces.yaml `route:`.
  var SI_SURFACES = [
    { route: "/sunday-inputs", label: "Sunday stats", note: "Sunday services", icon: "fa fa-sun-o" },
    { route: "/youth-inputs", label: "Youth stats", note: "Saturday youth", icon: "fa fa-bolt" }
  ];

  (function wireSurfaceSwitch() {
    var trigger = document.getElementById("si-surface-switch");
    var menu = document.getElementById("si-surfacemenu");
    if (!trigger || !menu) { return; }

    var here = String(window.location.pathname || "").replace(/\/+$/, "").toLowerCase();

    menu.innerHTML = "";
    SI_SURFACES.forEach(function (surface) {
      var isCurrent = here === surface.route;
      var item = document.createElement("a");
      item.className = isCurrent ? "si-surfaceitem is-current" : "si-surfaceitem";
      item.setAttribute("role", "menuitem");
      item.href = surface.route;
      if (isCurrent) { item.setAttribute("aria-current", "page"); }

      var icon = document.createElement("i");
      icon.className = surface.icon + " si-surfaceicon";
      icon.setAttribute("aria-hidden", "true");
      item.appendChild(icon);

      var text = document.createElement("span");
      text.className = "si-surfacetext";
      var name = document.createElement("span");
      name.className = "si-surfacename";
      name.textContent = surface.label;
      var note = document.createElement("span");
      note.className = "si-surfacenote";
      note.textContent = surface.note;
      text.appendChild(name);
      text.appendChild(note);
      item.appendChild(text);

      var mark = document.createElement("i");
      mark.className = isCurrent ? "fa fa-check si-surfacemark" : "si-surfacemark";
      mark.setAttribute("aria-hidden", "true");
      item.appendChild(mark);

      menu.appendChild(item);
    });

    function items() {
      return Array.prototype.slice.call(menu.querySelectorAll(".si-surfaceitem"));
    }

    function isOpen() { return !menu.hidden; }

    function close(refocus) {
      if (!isOpen()) { return; }
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (refocus) { trigger.focus(); }
    }

    function open(focusIndex) {
      if (isOpen()) { return; }
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      var list = items();
      if (list.length && typeof focusIndex === "number") {
        list[focusIndex < 0 ? list.length - 1 : focusIndex].focus();
      }
    }

    function move(step) {
      var list = items();
      if (!list.length) { return; }
      var at = list.indexOf(document.activeElement);
      var next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
      list[next].focus();
    }

    trigger.addEventListener("click", function (event) {
      event.stopPropagation();
      if (isOpen()) { close(false); } else { open(null); }
    });

    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") { event.preventDefault(); open(0); }
      else if (event.key === "ArrowUp") { event.preventDefault(); open(-1); }
      else if (event.key === "Escape") { close(false); }
    });

    menu.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { event.preventDefault(); close(true); }
      else if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
      else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
      else if (event.key === "Tab") { close(false); }
    });

    document.addEventListener("click", function (event) {
      if (!isOpen()) { return; }
      if (menu.contains(event.target) || trigger.contains(event.target)) { return; }
      close(false);
    });
  }());
