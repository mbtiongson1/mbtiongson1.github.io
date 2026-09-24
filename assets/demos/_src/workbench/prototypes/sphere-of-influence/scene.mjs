import { Scene, PerspectiveCamera, WebGLRenderer, Group, Color, Vector2, Vector3,
  BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineDashedMaterial, LineSegments,
  Mesh, MeshStandardMaterial, SphereGeometry, IcosahedronGeometry, AmbientLight, DirectionalLight,
  Raycaster, QuadraticBezierCurve3, SRGBColorSpace, TOUCH } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* The renderer receives projected data. It never infers leadership or development.
 * Direct touch: one-finger orbit, two-finger dolly/pan, tap picking. No camera-button UI. */
export function createScene({ host, labels, onSelect, onFailure }) {
  const scene = new Scene(), camera = new PerspectiveCamera(38, 1, .1, 150);
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer:coarse)').matches ? 1.25 : 1.5));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setClearColor(0x070b0e, 0);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'group');
  canvas.setAttribute('aria-label', 'Interactive sphere. Drag to orbit, pinch or scroll to zoom, two-finger drag to pan. Keyboard arrows orbit, plus and minus zoom, Shift arrows pan, zero resets. Select relationships using the adjacent list.');
  host.append(canvas);
  // The common surface owns gestures, including those beginning on a DOM label.
  const surface = host.parentElement;
  const controls = new OrbitControls(camera, surface);
  controls.enableDamping = false; controls.enablePan = true; controls.enableZoom = true;
  controls.screenSpacePanning = true; controls.rotateSpeed = .65; controls.zoomSpeed = .8; controls.panSpeed = .7;
  controls.touches.ONE = TOUCH.ROTATE; controls.touches.TWO = TOUCH.DOLLY_PAN;
  controls.minDistance = 3; controls.maxDistance = 70;
  scene.add(new AmbientLight(0xbedce5, 2.1));
  const light = new DirectionalLight(0xffd0af, 4.5); light.position.set(-4, 6, 7); scene.add(light);
  const rim = new DirectionalLight(0x56c2e8, 2); rim.position.set(4, -2, -4); scene.add(rim);
  let objects = new Group(), targets = [], labelNodes = [], edgeMarks = [];
  let disposed = false, pending = 0, visible = true, paused = false;
  let activeId = null, rootId = null, lastStart = null, renderCount = 0, radius = 4.55;
  const activePointers = new Set(), raycaster = new Raycaster(), pointer = new Vector2();
  scene.add(objects);
  function requestRender() {
    if (!pending && !disposed && visible && !paused && !document.hidden) pending = requestAnimationFrame(paint);
  }
  function paint() {
    pending = 0;
    if (disposed || !visible || paused || document.hidden) return;
    renderer.render(scene, camera); renderCount++;
    const w = host.clientWidth, h = host.clientHeight, occupied = [];
    const cap = matchMedia('(pointer:coarse)').matches ? 4 : 12;
    const priority = n => n.element === document.activeElement ? -3 : n.id === activeId ? -2 : n.id === rootId ? -1 : n.depth;
    for (const item of [...labelNodes].sort((a, b) => priority(a) - priority(b))) {
      const p = item.position.clone().project(camera);
      const x = (p.x * .5 + .5) * w, y = (-p.y * .5 + .5) * h - 30;
      const width = item.width, rect = { left: x - width / 2, right: x + width / 2, top: y - 23, bottom: y + 23 };
      const collision = occupied.some(r => rect.left < r.right + 6 && rect.right > r.left - 6 && rect.top < r.bottom + 5 && rect.bottom > r.top - 5);
      const hidden = p.z < -1 || p.z > 1 || rect.left < 3 || rect.right > w - 3 || rect.top < 3 || rect.bottom > h - 3 || collision || occupied.length >= cap;
      item.element.hidden = hidden;
      if (!hidden) { occupied.push(rect); item.element.style.left = `${x}px`; item.element.style.top = `${y}px`; }
    }
    // Value-free instrumentation: no identity or graph snapshot exposed to diagnostics.
    host.dataset.renderCount = String(renderCount);
    host.dataset.cameraDistance = camera.position.distanceTo(controls.target).toFixed(3);
    host.dataset.cameraPose = [...camera.position.toArray(), ...controls.target.toArray()].map(n => n.toFixed(3)).join(',');
  }
  controls.addEventListener('change', requestRender);
  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); requestRender();
  };
  const ro = new ResizeObserver(resize); ro.observe(host);
  const io = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) requestRender(); }); io.observe(host);
  const visibility = () => requestRender(); document.addEventListener('visibilitychange', visibility);
  function pick(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(targets, false)[0];
  }
  const down = e => {
    activePointers.add(e.pointerId);
    lastStart = activePointers.size === 1 && e.button === 0 ? [e.clientX, e.clientY, e.target.closest('.node-label')?.dataset.nodeId] : null;
  };
  const up = e => {
    const tap = activePointers.size === 1 && lastStart && Math.hypot(e.clientX - lastStart[0], e.clientY - lastStart[1]) <= 6;
    const labelId = lastStart?.[2];
    activePointers.delete(e.pointerId); lastStart = null;
    if (tap) {
      if (labelId) onSelect(labelId);
      else { const hit = pick(e); if (hit) onSelect(hit.object.userData.nodeId); }
    }
  };
  const cancel = e => { activePointers.delete(e.pointerId); lastStart = null; };
  const doubleTap = e => { if (!pick(e)) { e.preventDefault(); reset(); } };
  const lost = e => { e.preventDefault(); onFailure('The graphics context was interrupted. Your selection and complete relationship reading are preserved.'); };
  function orbit(horizontal, vertical = 0) {
    const offset = camera.position.clone().sub(controls.target);
    offset.applyAxisAngle(new Vector3(0, 1, 0), horizontal * .18);
    if (vertical) {
      const right = new Vector3().crossVectors(offset.clone().normalize(), camera.up).normalize();
      const candidate = offset.clone().applyAxisAngle(right, vertical * .12);
      if (Math.abs(candidate.clone().normalize().y) < .97) offset.copy(candidate);
    }
    camera.position.copy(controls.target).add(offset); controls.update(); requestRender();
  }
  function zoom(direction) {
    const offset = camera.position.clone().sub(controls.target).multiplyScalar(direction > 0 ? .87 : 1.13);
    offset.clampLength(controls.minDistance, controls.maxDistance);
    camera.position.copy(controls.target).add(offset); controls.update(); requestRender();
  }
  const key = e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (directions[e.key]) {
      e.preventDefault(); const [x, y] = directions[e.key];
      if (e.shiftKey) {
        const delta = new Vector3(x * .35, y * .35, 0).applyQuaternion(camera.quaternion);
        camera.position.add(delta); controls.target.add(delta); controls.update(); requestRender();
      } else orbit(x, y);
    } else if (['+', '=', '-', '_'].includes(e.key)) { e.preventDefault(); zoom(e.key === '+' || e.key === '=' ? 1 : -1); }
    else if (e.key === '0' || e.key === 'Home') { e.preventDefault(); reset(); }
  };
  for (const [event, fn] of Object.entries({ pointerdown: down, pointerup: up, pointercancel: cancel, dblclick: doubleTap, keydown: key })) surface.addEventListener(event, fn);
  canvas.addEventListener('webglcontextlost', lost);
  function clear() {
    const disposedAssets = new Set();
    objects.traverse(o => {
      for (const resource of [o.geometry, ...(Array.isArray(o.material) ? o.material : [o.material])]) {
        if (resource && !disposedAssets.has(resource)) { resource.dispose(); disposedAssets.add(resource); }
      }
    });
    scene.remove(objects); objects = new Group(); scene.add(objects);
    targets = []; edgeMarks = []; labels.replaceChildren(); labelNodes = [];
  }
  function lines(points, color, opacity, dashed = false) {
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    const material = dashed ? new LineDashedMaterial({ color, opacity, transparent: true, dashSize: .1, gapSize: .065 }) : new LineBasicMaterial({ color, opacity, transparent: true });
    const mesh = new LineSegments(geometry, material); if (dashed) mesh.computeLineDistances(); objects.add(mesh); return mesh;
  }
  function shell(r) {
    // Three orthogonal coordinate circles: guides, not unrecorded people or generations.
    for (let plane = 0; plane < 3; plane++) {
      const points = [];
      for (let i = 0; i < 144; i++) for (const t of [i / 144 * Math.PI * 2, (i + 1) / 144 * Math.PI * 2]) {
        const a = Math.cos(t) * r, b = Math.sin(t) * r;
        points.push(...(plane === 0 ? [a, 0, b] : plane === 1 ? [a, b, 0] : [0, a, b]));
      }
      lines(points, 0x466574, .38);
    }
  }
  function setView(view, positions) {
    clear(); rootId = view.root; activeId = view.root;
    radius = [1.5, 2.55, 4.55, 6.35][view.depth];
    for (let d = 1; d <= view.depth; d++) shell([0, 2.55, 4.55, 6.35][d]);
    for (const e of view.edges) {
      const start = new Vector3(...positions.get(e.source)), end = new Vector3(...positions.get(e.target));
      const mid = start.clone().lerp(end, .5); mid.z += .4;
      const samples = new QuadraticBezierCurve3(start, mid, end).getPoints(28), pts = [];
      for (let i = 0; i < samples.length - 1; i++) pts.push(...samples[i].toArray(), ...samples[i + 1].toArray());
      const mesh = lines(pts, e.evidence === 'explicit' ? 0x86d8b7 : 0x56c2e8, .8, e.evidence === 'structural');
      edgeMarks.push({ mesh, source: e.source, target: e.target });
    }
    // Geometry shared by each mark class; no assets or identity records fetched by Three.
    const cohortGeometry = new SphereGeometry(.19, 12, 8), leaderGeometry = new IcosahedronGeometry(.17, 0);
    for (const node of view.nodes) {
      const root = node.id === view.root, aggregate = node.kind === 'aggregate';
      const geometry = aggregate ? cohortGeometry : root ? new SphereGeometry(.29, 24, 16) : leaderGeometry;
      const color = root ? 0xff7a33 : aggregate ? 0x93a8b3 : view.lens === 'structural' ? 0x56c2e8 : 0x86d8b7;
      const material = new MeshStandardMaterial({ color, roughness: .4, metalness: .25, emissive: new Color(color), emissiveIntensity: .12, wireframe: aggregate });
      const mesh = new Mesh(geometry, material); mesh.position.set(...positions.get(node.id)); mesh.userData.nodeId = node.id;
      objects.add(mesh); targets.push(mesh);
      if (aggregate) continue;
      const button = document.createElement('button'); button.className = `node-label${root ? ' root' : ''}`;
      button.textContent = node.label; button.setAttribute('aria-label', `Inspect ${node.label}`);
      button.dataset.nodeId = node.id;
      button.addEventListener('click', e => { if (e.detail === 0) onSelect(node.id); }); labels.append(button);
      labelNodes.push({ element: button, width: button.offsetWidth || Math.min(260, 24 + node.label.length * 8), position: mesh.position.clone(), id: node.id, depth: node.depth });
    }
    // Dispose unused shared geometries too (an empty/root-only slice is valid).
    if (!view.nodes.some(n => n.kind === 'aggregate')) cohortGeometry.dispose();
    if (!view.nodes.some(n => n.kind === 'leader' && n.id !== view.root)) leaderGeometry.dispose();
    resize();
  }
  function select(id) {
    activeId = id;
    for (const label of labelNodes) label.element.classList.toggle('selected', label.id === id);
    for (const mesh of targets) mesh.material.emissiveIntensity = mesh.userData.nodeId === id ? .55 : .12;
    for (const edge of edgeMarks) edge.mesh.material.opacity = id === rootId || edge.source === id || edge.target === id ? .85 : .2;
    requestRender();
  }
  function reset() {
    resize();
    const distance = radius / (Math.sin(camera.fov * Math.PI / 360) * Math.min(camera.aspect, 1)) * 1.16;
    camera.position.copy(new Vector3(.24, .17, 1).normalize().multiplyScalar(Math.min(65, distance)));
    controls.target.set(0, 0, 0); controls.update(); requestRender();
  }
  function pause(value) { paused = value; if (!value) { resize(); requestRender(); } }
  function destroy() {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(pending); ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', visibility); controls.dispose();
    for (const [event, fn] of Object.entries({ pointerdown: down, pointerup: up, pointercancel: cancel, dblclick: doubleTap, keydown: key })) surface.removeEventListener(event, fn);
    canvas.removeEventListener('webglcontextlost', lost);
    clear(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
  }
  return { setView, select, reset, pause, destroy };
}
