(() => {
  const controls = document.getElementById("channel-controls");
  const fallback = document.getElementById("channel-fallback");
  const featured = document.getElementById("selected-project");
  const archive = document.querySelector(".archive-projects");
  const channelStatus = document.getElementById("channel-status");
  const monitorState = document.getElementById("monitor-state");

  if (!controls || !fallback || !featured || !archive || !channelStatus || !monitorState) return;

  const sourceLinks = [...fallback.querySelectorAll("a[data-project-link]")];
  const sections = [...document.querySelectorAll(".project-section[data-project]")];
  const sectionById = new Map(sections.map((section) => [section.dataset.project, section]));
  const orderById = new Map(sourceLinks.map((link, index) => [link.dataset.projectLink, index]));
  const currentSection = () => featured.querySelector(".project-section[data-project]");
  const initialId = currentSection()?.dataset.project;

  if (!sourceLinks.length || sourceLinks.length !== sectionById.size || !initialId) return;
  if (sourceLinks.some((link) => !sectionById.has(link.dataset.projectLink))) return;

  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const createMeter = () => {
    const meter = create("span", "channel-meter");
    meter.setAttribute("aria-hidden", "true");
    for (let index = 0; index < 7; index += 1) meter.append(create("span", "meter-tick"));
    meter.append(
      create("span", "meter-red-zone"),
      create("span", "meter-needle"),
      create("span", "meter-hub")
    );
    return meter;
  };

  const createChannelButton = (link) => {
    const id = link.dataset.projectLink;
    const title = link.querySelector(".index-title")?.textContent.trim() || link.textContent.trim();
    const kind = link.querySelector(".index-kind")?.textContent.trim() || "Project artifact";
    const button = create("button", "channel-button");
    button.type = "button";
    button.dataset.projectId = id;
    button.setAttribute("aria-pressed", id === initialId ? "true" : "false");
    button.setAttribute("aria-label", `Show ${title} in the monitor`);
    const copy = create("span", "channel-copy");
    copy.append(
      create("span", "channel-button-title", title),
      create("span", "channel-button-kind", kind)
    );
    button.append(
      createMeter(),
      copy,
      create("span", "channel-control-state", id === initialId ? "Selected" : "Choose this channel")
    );
    return button;
  };

  const statusFor = (section) => {
    if (section.querySelector(".demo-window")) return "Interactive local prototype";
    if (section.querySelector(".image-artifact")) {
      return section.querySelector('.project-heading a[href^="https://"]')
        ? "Static artwork · external site link"
        : "Static image artifact";
    }
    return "External site · no local preview";
  };

  const restoreArchiveOrder = () => {
    [...archive.children]
      .sort((a, b) => (orderById.get(a.dataset.project) ?? 0) - (orderById.get(b.dataset.project) ?? 0))
      .forEach((section) => archive.append(section));
  };

  const announceSelection = (section) => {
    const title = section.querySelector(".project-heading h2")?.textContent.trim() || "Project";
    const status = statusFor(section);
    channelStatus.textContent = `Selected: ${title} · ${status}. The meter marks selection only.`;
    monitorState.textContent = status;
  };

  const selectProject = (id, moveFocus = false) => {
    const nextSection = sectionById.get(id);
    if (!nextSection) return;

    const previousSection = currentSection();
    if (previousSection !== nextSection) {
      if (previousSection) archive.append(previousSection);
      featured.replaceChildren(nextSection);
      restoreArchiveOrder();
    }

    [...controls.querySelectorAll(".channel-button")].forEach((button) => {
      const selected = button.dataset.projectId === id;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      button.querySelector(".channel-control-state").textContent = selected ? "Selected" : "Choose this channel";
      if (selected && moveFocus) button.focus({ preventScroll: true });
      if (selected && moveFocus && window.matchMedia("(max-width: 560px)").matches) {
        const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
        button.scrollIntoView({ block: "nearest", inline: "center", behavior });
      }
    });

    announceSelection(nextSection);
  };

  const buttons = sourceLinks.map(createChannelButton);
  controls.replaceChildren(...buttons);
  controls.hidden = false;
  fallback.hidden = true;
  document.querySelector(".vu-bridge")?.classList.add("is-enhanced");
  announceSelection(sectionById.get(initialId));

  controls.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-project-id]");
    if (button) selectProject(button.dataset.projectId);
  });

  controls.addEventListener("keydown", (event) => {
    const focused = event.target.closest("button[data-project-id]");
    if (!focused) return;

    const index = buttons.findIndex((button) => button.dataset.projectId === focused.dataset.projectId);
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % buttons.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    else return;

    event.preventDefault();
    selectProject(buttons[nextIndex].dataset.projectId, true);
  });
})();
