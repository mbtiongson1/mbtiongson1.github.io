import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/scripts/site.js', import.meta.url), 'utf8');

// A minimal element double: enough surface for site.js, nothing more.
const element = (dataset = {}, attrs = {}) => {
  const listeners = {};
  const classes = new Set();
  return {
    dataset, hidden: attrs.hidden ?? false, src: attrs.src ?? '', alt: attrs.alt ?? '', attrs: { ...attrs },
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) },
    setAttribute(name, value) { this.attrs[name] = value; },
    getAttribute(name) { return this.attrs[name]; },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    fire: (type) => listeners[type]?.(),
    decode: () => Promise.resolve(),
  };
};

const setup = ({ reduced = true, observer = false } = {}) => {
  const buttons = ['age', 'connection', 'gender', 'campus'].map((lens) => element({ lens }, { 'aria-pressed': String(lens === 'age') }));
  const group = element({}, { hidden: true });
  group.hidden = true;
  group.querySelectorAll = () => buttons;
  const image = element({}, { src: '/assets/media/favor/home-favor-by-people-age.webp' });
  const stage = element();
  stage.querySelector = (selector) => (selector === '[data-lens-image]' ? image : group);
  const html = element();
  const document = {
    documentElement: html,
    querySelector: (selector) => (selector === '[data-lens-stage]' ? stage : null),
    querySelectorAll: () => [],
  };
  const window = { matchMedia: () => ({ matches: reduced }), setTimeout: (fn) => fn() };
  if (observer) window.IntersectionObserver = class { observe() {} };
  const context = { document, window, Image: class {}, console };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { buttons, group, image, html };
};

test('marks the document as enhanced and reveals the lens switch', () => {
  const { group, html } = setup();
  assert.equal(html.classList.contains('js'), true);
  assert.equal(group.hidden, false, 'the switch is hidden in HTML and only shown once it can work');
});

test('each lens button swaps to its own capture and updates pressed state and description', () => {
  const { buttons, image } = setup();
  buttons[3].fire('click');
  assert.equal(image.src, '/assets/media/favor/home-favor-by-people-campus.webp');
  assert.match(image.alt, /campus lens/);
  assert.match(image.alt, /Every count is invented/);
  assert.deepEqual(buttons.map((b) => b.attrs['aria-pressed']), ['false', 'false', 'false', 'true']);
  buttons[1].fire('click');
  assert.equal(image.src, '/assets/media/favor/home-favor-by-people-connection.webp');
});

test('the motion path still lands on the right capture', async () => {
  const { buttons, image } = setup({ reduced: false });
  buttons[2].fire('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(image.src, '/assets/media/favor/home-favor-by-people-gender.webp');
  assert.equal(image.classList.contains('is-swapping'), false, 'the swap class is cleared once the new image decodes');
});

test('the script makes no network requests', () => {
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
});

test('without IntersectionObserver the page still works', () => {
  assert.doesNotThrow(() => setup({ observer: false }));
});
