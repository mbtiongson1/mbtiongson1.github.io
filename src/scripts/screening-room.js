(() => {
  const selectedProject = document.getElementById("selected-project");
  const filmstripFallback = document.getElementById("filmstrip-fallback");
  const filmstripControls = document.getElementById("filmstrip-controls");
  const archiveFallback = document.getElementById("project-notes");
  const announcement = document.getElementById("screen-announce");
  const projectCount = document.getElementById("project-count");

  if (!selectedProject || !filmstripFallback || !filmstripControls || !archiveFallback || !announcement) return;

  const create = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const externalLink = (href, label) => {
    if (typeof href !== "string" || !/^https:\/\/[a-z0-9.-]+(?:\/[a-z0-9/?#&=._~%-]*)?$/i.test(href)) return null;
    const link = create("a", "artifact-open", label);
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(makeExternalIcon());
    const hint = create("span", "sr-only", " (opens in a new tab)");
    link.append(hint);
    return link;
  };

  const localPath = (href) => {
    if (typeof href !== "string" || !href.startsWith("/")) return null;
    try {
      const url = new URL(href, window.location.origin);
      return url.origin === window.location.origin ? url.href : null;
    } catch {
      return null;
    }
  };

  const makeExternalIcon = () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 15 15 5M6 5h9v9");
    svg.append(path);
    return svg;
  };

  const projectStatus = (project) => {
    if (project.demo) return "Interactive local prototype";
    if (project.media && project.live) return "Static artwork with a live-site link";
    if (project.media) return "Static project artifact";
    if (project.live) return "Public site · live link";
    if (project.caseStudy || project.links?.length) return "Project story and source links";
    return "Project record";
  };

  const screenStatus = (project) => {
    if (project.demo) return "local interactive prototype";
    if (project.live && project.media) return "static artwork · live site";
    if (project.live) return "live public site · no local preview";
    if (project.media) return "static project artifact";
    return "case study · source links";
  };

  const createFilmstripButton = (project, index) => {
    const button = create("button", "filmstrip-button");
    button.type = "button";
    button.dataset.projectId = project.id;
    button.setAttribute("aria-pressed", index === 0 ? "true" : "false");
    button.setAttribute("aria-label", `Show ${project.title} — ${projectStatus(project)}`);

    const number = create("span", "film-number", String(index + 1).padStart(2, "0"));
    number.setAttribute("aria-hidden", "true");
    const copy = create("span", "film-copy");
    copy.append(create("span", "film-title", project.title));
    copy.append(create("span", "film-kind", project.kind));
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.setAttribute("viewBox", "0 0 20 20");
    arrow.setAttribute("class", "filmstrip-arrow");
    arrow.setAttribute("aria-hidden", "true");
    const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "M2 10h15m-6-6 6 6-6 6");
    arrow.append(arrowPath);
    button.append(number, copy, arrow);
    return button;
  };

  const addProjectLinks = (container, project) => {
    const links = create("div", "project-actions");
    let count = 0;

    if (project.demo) {
      const href = localPath(project.demo.url);
      if (href) {
        const link = create("a", "artifact-open", project.demo.label);
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(makeExternalIcon());
        const hint = create("span", "sr-only", " (opens in a new tab)");
        link.append(hint);
        links.append(link);
        count += 1;
      }
    }

    if (project.media) {
      const href = localPath(project.media.src);
      if (href) {
        const link = create("a", "artifact-open", "View full-size image");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.append(makeExternalIcon());
        const hint = create("span", "sr-only", " (opens in a new tab)");
        link.append(hint);
        links.append(link);
        count += 1;
      }
    }

    if (project.live) {
      const link = externalLink(project.live.url, project.live.label);
      if (link) {
        links.append(link);
        count += 1;
      }
    }

    if (project.caseStudy) {
      const href = localPath(project.caseStudy.url);
      if (href && project.caseStudy.label) {
        const link = create("a", "artifact-open", project.caseStudy.label);
        link.href = href;
        link.append(makeExternalIcon());
        links.append(link);
        count += 1;
      }
    }

    if (Array.isArray(project.links)) {
      project.links.forEach((item) => {
        if (!item || typeof item.url !== "string" || typeof item.label !== "string") return;
        const link = externalLink(item.url, item.label);
        if (link) {
          links.append(link);
          count += 1;
        }
      });
    }

    if (count) container.append(links);
  };

  const createArtifact = (project) => {
    if (project.demo) {
      const href = localPath(project.demo.url);
      if (href) {
        const windowBox = create("div", "demo-window");
        const bar = create("div", "demo-window-bar");
        bar.append(create("span", "", project.demo.frameLabel || "Local interactive prototype"));
        bar.append(create("span", "", "Sandboxed local HTML"));
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
      const href = localPath(project.media.src);
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
    note.append(create("span", "note-label", project.live ? "External public site / no local preview" : "Public source / no live service"));
    note.append(create("strong", "", project.title));
    note.append(create("p", "", project.live
      ? "The public product opens at its own site. This portfolio does not embed or proxy that external service."
      : "Read the public project source. This portfolio does not connect to a running service or private system."));
    return note;
  };

  const renderProject = (project, index) => {
    const section = create("section", "project-section project-section--lead");
    section.setAttribute("aria-labelledby", `screen-title-${project.id}`);

    const heading = create("div", "project-heading");
    const headingCopy = create("div");
    headingCopy.append(create("h2", "", project.title));
    headingCopy.lastChild.id = `screen-title-${project.id}`;
    headingCopy.append(create("p", "project-kind", project.kind));
    heading.append(headingCopy);
    addProjectLinks(heading, project);
    section.append(heading);
    if (project.role) section.append(create("p", "project-role", project.role));

    const disclosure = create("p", "disclosure");
    disclosure.append(create("strong", "", "About this artifact "));
    disclosure.append(document.createTextNode(project.disclosure));
    section.append(disclosure);

    section.append(createArtifact(project));
    section.append(create("p", "project-summary", project.summary));
    section.append(create("p", "project-context", project.context));
    selectedProject.replaceChildren(section);
    announcement.textContent = `${project.title} · ${screenStatus(project)}.`;
  };

  let projectCatalog = [];
  let selectedIndex = 0;

  const selectProject = (index, moveFocus = false) => {
    if (index < 0 || index >= projectCatalog.length) return;
    selectedIndex = index;
    [...filmstripControls.querySelectorAll(".filmstrip-button")].forEach((button, buttonIndex) => {
      const selected = buttonIndex === index;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
      if (selected && moveFocus) button.focus();
      if (selected && window.matchMedia("(max-width: 560px)").matches) {
        button.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    });
    const updateProjection = () => renderProject(projectCatalog[index], index);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion && typeof document.startViewTransition === "function") {
      try {
        document.startViewTransition(updateProjection);
      } catch {
        updateProjection();
      }
    } else {
      updateProjection();
    }
  };

  const init = async () => {
    try {
      const response = await fetch("/data/projects.json", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Catalog request failed with ${response.status}`);
      const catalog = await response.json();
      if (!Array.isArray(catalog.projects) || !catalog.projects.length) throw new Error("Project catalog is empty");
      projectCatalog = catalog.projects.filter((project) => project.visibility === "public");
      if (!projectCatalog.length) throw new Error("No public projects are available");
      if (projectCount) {
        projectCount.textContent = `${String(projectCatalog.length).padStart(2, "0")} / reel`;
        projectCount.setAttribute("aria-label", `${projectCatalog.length} projects in the reel`);
      }

      const buttons = projectCatalog.map(createFilmstripButton);
      filmstripControls.replaceChildren(...buttons);
      renderProject(projectCatalog[0], 0);
      filmstripFallback.hidden = true;
      filmstripControls.hidden = false;
      archiveFallback.hidden = true;

      filmstripControls.addEventListener("click", (event) => {
        const button = event.target.closest(".filmstrip-button");
        if (!button) return;
        const index = projectCatalog.findIndex((project) => project.id === button.dataset.projectId);
        selectProject(index);
      });

      filmstripControls.addEventListener("keydown", (event) => {
        const currentButton = event.target.closest(".filmstrip-button");
        if (!currentButton) return;
        let next = selectedIndex;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (selectedIndex + 1) % projectCatalog.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (selectedIndex - 1 + projectCatalog.length) % projectCatalog.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = projectCatalog.length - 1;
        else return;
        event.preventDefault();
        selectProject(next, true);
      });
    } catch (error) {
      console.warn("Screening Room: keeping the server-rendered project archive active.", error);
    }
  };

  init();
})();
