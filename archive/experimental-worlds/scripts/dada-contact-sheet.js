(() => {
  const list = document.getElementById("project-list");
  const selectedProject = document.getElementById("selected-project");
  const archive = document.getElementById("archive");
  const archiveProjects = document.getElementById("archive-projects");
  const status = document.getElementById("selection-status");

  if (!list || !selectedProject || !archive || !archiveProjects || !status) return;

  const create = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const safeLocalUrl = (value) => {
    if (typeof value !== "string" || !value.startsWith("/")) return null;
    try {
      const url = new URL(value, window.location.origin);
      return url.origin === window.location.origin && !url.pathname.split("/").includes("..") ? url.href : null;
    } catch {
      return null;
    }
  };

  const safeExternalUrl = (value) => {
    if (typeof value !== "string") return null;
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : null;
    } catch {
      return null;
    }
  };

  const externalIcon = () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 15 15 5M6 5h9v9");
    svg.append(path);
    return svg;
  };

  const addNewTabHint = (link) => {
    const hint = create("span", "new-window-note", " (opens in a new tab)");
    hint.classList.add("sr-only");
    link.append(hint);
  };

  const addActionLink = (container, href, label) => {
    const link = create("a", "artifact-open", label);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(externalIcon());
    addNewTabHint(link);
    container.append(link);
    return link;
  };

  const screenStatus = (project) => {
    if (project.demo) return "interactive local prototype";
    if (project.media && project.live) return "static artwork and public site link";
    if (project.media) return "static image";
    return "external public site — no local preview";
  };

  const makeButton = (project, index) => {
    const item = create("li");
    const button = create("button", "scrap-button");
    button.type = "button";
    button.dataset.projectId = project.id;
    button.setAttribute("aria-pressed", index === 0 ? "true" : "false");
    button.setAttribute("aria-label", `Show ${project.title} — ${screenStatus(project)}`);

    const number = create("span", "scrap-number", String(index + 1).padStart(2, "0"));
    number.setAttribute("aria-hidden", "true");
    const copy = create("span", "scrap-copy");
    copy.append(create("span", "scrap-title", project.title));
    copy.append(create("span", "scrap-kind", project.kind));
    button.append(number, copy);
    item.append(button);
    return item;
  };

  const renderArtifact = (project) => {
    if (project.demo) {
      const href = safeLocalUrl(project.demo.url);
      if (href) {
        const windowBox = create("div", "demo-window");
        const bar = create("div", "demo-window-bar");
        bar.append(create("span", "", "Interactive / fictional prototype data"));
        bar.append(create("span", "", "Compiled HTML"));
        const frame = document.createElement("iframe");
        frame.src = href;
        frame.title = `${project.title} — interactive fictional-data prototype`;
        frame.loading = "eager";
        frame.referrerPolicy = "no-referrer";
        frame.setAttribute("sandbox", "allow-scripts allow-downloads");
        windowBox.append(bar, frame);
        return windowBox;
      }
    }

    if (project.media) {
      const href = safeLocalUrl(project.media.src);
      if (href) {
        const figure = create("figure", "image-artifact");
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", `Open full-size image for ${project.title} in a new tab`);
        const image = document.createElement("img");
        image.src = href;
        image.width = Number(project.media.width) || 1200;
        image.height = Number(project.media.height) || 800;
        image.alt = project.media.alt || "";
        image.loading = "eager";
        image.decoding = "async";
        link.append(image);
        figure.append(link, create("figcaption", "", project.media.caption || ""));
        return figure;
      }
    }

    const note = create("div", "live-artifact-note");
    note.append(create("p", "note-label", "External public site / no local preview"));
    note.append(create("h3", "", project.title));
    note.append(create("p", "", "There is no reviewed local image or embedded preview for this record. Open the public site directly."));
    if (project.live) {
      const href = safeExternalUrl(project.live.url);
      if (href) {
        const link = addActionLink(note, href, project.live.label);
        link.classList.add("artifact-open--external");
      }
    }
    return note;
  };

  const renderProject = (project, index) => {
    const section = create("section", "project-section project-section--featured");
    section.id = project.id;
    section.setAttribute("aria-labelledby", `project-title-${project.id}`);

    const heading = create("header", "project-heading");
    const titleGroup = create("div", "project-title-group");
    const title = create("h2", "", project.title);
    title.id = `project-title-${project.id}`;
    titleGroup.append(title, create("p", "project-kind", project.kind));
    heading.append(titleGroup);

    const actions = create("div", "project-actions");
    if (project.demo) {
      const href = safeLocalUrl(project.demo.url);
      if (href) addActionLink(actions, href, project.demo.label);
    }
    if (project.media) {
      const href = safeLocalUrl(project.media.src);
      if (href) addActionLink(actions, href, "View full-size image");
    }
    if (project.live && (project.demo || project.media)) {
      const href = safeExternalUrl(project.live.url);
      if (href) addActionLink(actions, href, project.live.label);
    }
    if (actions.childElementCount) heading.append(actions);
    section.append(heading);

    const disclosure = create("p", "disclosure");
    disclosure.append(create("strong", "", "About this artifact"));
    disclosure.append(document.createTextNode(` ${project.disclosure}`));
    section.append(disclosure, renderArtifact(project));
    section.append(create("p", "project-summary", project.summary));
    section.append(create("p", "project-context", project.context));
    selectedProject.replaceChildren(section);
    status.textContent = `Showing ${project.title} — ${screenStatus(project)}.`;

    [...list.querySelectorAll(".scrap-button")].forEach((button, buttonIndex) => {
      button.setAttribute("aria-pressed", buttonIndex === index ? "true" : "false");
    });
  };

  const projectFromHash = (projects) => {
    const raw = window.location.hash.slice(1);
    if (!raw) return null;
    let id = raw;
    try { id = decodeURIComponent(raw); } catch { /* Keep an invalid fragment unmatched. */ }
    return projects.find((project) => project.id === id) || null;
  };

  const init = async () => {
    try {
      const response = await fetch("/data/projects.json", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Project archive returned ${response.status}`);
      const catalog = await response.json();
      const projects = Array.isArray(catalog.projects)
        ? catalog.projects.filter((project) => project && project.visibility === "public")
        : [];
      if (!projects.length) throw new Error("No public project records are available");

      const buttons = projects.map(makeButton);
      list.replaceChildren(...buttons);
      const initial = projectFromHash(projects) || projects[0];
      archive.hidden = true;
      archiveProjects.replaceChildren();
      renderProject(initial, projects.indexOf(initial));

      list.addEventListener("click", (event) => {
        const button = event.target.closest(".scrap-button");
        if (!button) return;
        const index = projects.findIndex((project) => project.id === button.dataset.projectId);
        if (index < 0) return;
        const project = projects[index];
        renderProject(project, index);
        if (window.location.hash !== `#${encodeURIComponent(project.id)}`) {
          window.history.pushState({ selectedProject: project.id }, "", `#${encodeURIComponent(project.id)}`);
        }
      });

      list.addEventListener("keydown", (event) => {
        const current = event.target.closest(".scrap-button");
        if (!current) return;
        const currentIndex = projects.findIndex((project) => project.id === current.dataset.projectId);
        if (currentIndex < 0) return;
        let nextIndex = currentIndex;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % projects.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + projects.length) % projects.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = projects.length - 1;
        else return;
        event.preventDefault();
        const nextProject = projects[nextIndex];
        renderProject(nextProject, nextIndex);
        list.querySelector(`[data-project-id="${nextProject.id}"]`)?.focus();
        if (window.location.hash !== `#${encodeURIComponent(nextProject.id)}`) {
          window.history.pushState({ selectedProject: nextProject.id }, "", `#${encodeURIComponent(nextProject.id)}`);
        }
      });

      const syncFromLocation = () => {
        const project = projectFromHash(projects) || projects[0];
        renderProject(project, projects.indexOf(project));
      };
      window.addEventListener("popstate", syncFromLocation);
      window.addEventListener("hashchange", syncFromLocation);
    } catch (error) {
      console.warn("Dada Contact Sheet: keeping the server-rendered archive available.", error);
    }
  };

  init();
})();
