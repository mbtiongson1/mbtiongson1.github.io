(() => {
  const controls = document.getElementById("walkthrough-controls");
  const buttonGroup = controls?.querySelector(".walkthrough-buttons");
  const buttons = buttonGroup ? [...buttonGroup.querySelectorAll("button[data-panel]")] : [];
  const panels = buttons.map((button) => document.getElementById(button.dataset.panel)).filter(Boolean);
  const status = document.getElementById("walkthrough-status");

  if (!controls || !buttonGroup || buttons.length !== panels.length || !buttons.length) return;

  controls.hidden = false;

  let activeIndex = buttons.findIndex((button) => button.getAttribute("aria-pressed") === "true");
  if (activeIndex < 0) activeIndex = 0;

  const selectChapter = (nextIndex, moveFocus = false) => {
    if (nextIndex < 0 || nextIndex >= buttons.length) return;
    activeIndex = nextIndex;

    buttons.forEach((button, index) => {
      const selected = index === activeIndex;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      if (selected && moveFocus) button.focus();
    });

    panels.forEach((panel, index) => {
      const selected = index === activeIndex;
      panel.hidden = !selected;
      panel.setAttribute("aria-hidden", selected ? "false" : "true");
    });

    if (status) {
      const label = buttons[activeIndex].textContent.replace(/^\s*\d+\s*/, "").trim();
      status.textContent = `Showing chapter ${String(activeIndex + 1).padStart(2, "0")}: ${label}.`;
    }
  };

  selectChapter(activeIndex);

  buttonGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-panel]");
    if (!button) return;
    const index = buttons.indexOf(button);
    selectChapter(index);
  });

  buttonGroup.addEventListener("keydown", (event) => {
    const button = event.target.closest("button[data-panel]");
    if (!button) return;

    let nextIndex = activeIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (activeIndex + 1) % buttons.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (activeIndex - 1 + buttons.length) % buttons.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = buttons.length - 1;
    else return;

    event.preventDefault();
    selectChapter(nextIndex, true);
  });
})();
