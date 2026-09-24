(() => {
  const rungDescriptions = {
    zero: {
      heading: "ZERO / clean launch",
      copy: "Start with no ambient skills. Add nothing permanently; summon a skill only for this session.",
    },
    low: {
      heading: "LOW / Heaven converges",
      copy: "Keep the session narrow: point at the gap and bring in only the capability that helps with it.",
    },
    med: {
      heading: "MED / Heaven converges",
      copy: "Stay on the task's missing capability, while giving the session a little more room to meet it.",
    },
    high: {
      heading: "HIGH / Hell explores",
      copy: "Look wider than the first obvious skill when the problem is unfamiliar.",
    },
    xhigh: {
      heading: "XHIGH / Hell explores",
      copy: "Explore more of the evidenced skill world around the gap; nothing is installed by summoning.",
    },
    max: {
      heading: "MAX / Hell explores",
      copy: "Use the broadest Hell band when the task needs wider capability discovery.",
    },
    ultra: {
      heading: "ULTRA / direction and depth",
      copy: "Let the controller choose how far to converge or explore for each gap, using its documented event and operator controls.",
    },
  };

  const rungExplorer = document.querySelector("[data-rung-explorer]");
  if (rungExplorer) {
    const buttons = [...rungExplorer.querySelectorAll("[data-rung]")];
    const output = rungExplorer.querySelector("#rung-output");
    buttons.forEach((button) => button.addEventListener("click", () => {
      const selected = rungDescriptions[button.dataset.rung];
      if (!selected || !output) return;
      buttons.forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      output.replaceChildren();
      const heading = document.createElement("strong");
      heading.textContent = selected.heading;
      const copy = document.createElement("p");
      copy.textContent = selected.copy;
      output.append(heading, copy);
    }));
  }

  const researchLabs = {
    craft: {
      title: "INFINITE SKILL CRAFT",
      copy: "Combine two skills in a browser game, discover a recipe, and follow successful combinations toward real Gaia registry skills.",
      href: "https://research.gaiaskilltree.com/labs/infinite-skill-craft",
    },
    diet: {
      title: "CONTEXT DIET",
      copy: "Measure an oversized agent-context file, preview a reduction band, and export a SKILL.md proposal. The README says the weighing stays in your browser.",
      href: "https://research.gaiaskilltree.com/labs/context-diet",
    },
  };

  const labExplorer = document.querySelector("[data-lab-explorer]");
  if (labExplorer) {
    const buttons = [...labExplorer.querySelectorAll("[data-lab]")];
    const output = labExplorer.querySelector("#lab-output");
    const renderLab = (key) => {
      const lab = researchLabs[key];
      if (!lab || !output) return;
      buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.lab === key)));
      const copyBlock = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = lab.title;
      const description = document.createElement("p");
      description.textContent = lab.copy;
      copyBlock.append(title, description);
      const link = document.createElement("a");
      link.href = lab.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(document.createTextNode("Open this live lab "));
      const hint = document.createElement("span");
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = "↗";
      link.append(hint);
      const newTab = document.createElement("span");
      newTab.className = "sr-only";
      newTab.textContent = " (opens in a new tab)";
      link.append(newTab);
      output.replaceChildren(copyBlock, link);
    };
    buttons.forEach((button) => button.addEventListener("click", () => renderLab(button.dataset.lab)));
  }

  const protocolFlows = {
    readonly: [
      ["Client", "Requests a Rock report through MCP."],
      ["OAuth", "The bearer token is validated and resolved to a caller."],
      ["Read-only tool", "The request receives read tools only; this portfolio never executes it."],
    ],
    write: [
      ["Client", "Proposes a change through an MCP tool."],
      ["Authorization", "Scope and caller role are checked before any write-capable tool is exposed."],
      ["Commit gate", "Mutations default to dry-run; a persisted write needs explicit commit and a reason, then audit."],
    ],
  };

  const protocolExplorer = document.querySelector("[data-protocol-explorer]");
  if (protocolExplorer) {
    const buttons = [...protocolExplorer.querySelectorAll("[data-protocol-mode]")];
    const steps = protocolExplorer.querySelector("#protocol-steps");
    const render = (mode) => {
      const flow = protocolFlows[mode];
      if (!flow || !steps) return;
      buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.protocolMode === mode)));
      steps.replaceChildren(...flow.map(([title, copy]) => {
        const item = document.createElement("li");
        const heading = document.createElement("strong");
        heading.textContent = title;
        const description = document.createElement("span");
        description.textContent = copy;
        item.append(heading, description);
        return item;
      }));
    };
    buttons.forEach((button) => button.addEventListener("click", () => render(button.dataset.protocolMode)));
  }

  const terminalFrames = [
    "CPU  18%   GPU  12%   RAM  8.4 / 16 GB\nNET  ↓ 1.2 MB/s   ↑ 0.4 MB/s\nLOAD 0.72  0.81  0.75   UPTIME 2d 04h",
    "CPU  31%   GPU  24%   RAM  9.1 / 16 GB\nNET  ↓ 0.8 MB/s   ↑ 0.6 MB/s\nLOAD 1.04  0.93  0.88   UPTIME 2d 04h",
    "CPU  12%   GPU   8%   RAM  8.2 / 16 GB\nNET  ↓ 1.6 MB/s   ↑ 0.2 MB/s\nLOAD 0.64  0.77  0.82   UPTIME 2d 04h",
  ];
  const terminalOutput = document.getElementById("terminal-output");
  const terminalRefresh = document.getElementById("terminal-refresh");
  if (terminalOutput && terminalRefresh) {
    let frame = 0;
    terminalRefresh.addEventListener("click", () => {
      frame = (frame + 1) % terminalFrames.length;
      terminalOutput.textContent = terminalFrames[frame];
    });
  }
})();
