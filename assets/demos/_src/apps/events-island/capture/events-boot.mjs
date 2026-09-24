/* Events (name pending) -- the Under Construction stage.
 *
 * One authored moment: the house is dark, a follow-spot strikes (with its sound), the
 * footlights come up left to right, haze fills the room, then the operator sweeps the word.
 *
 * Sound is synthesized with Web Audio -- nothing to fetch, nothing to cache-bust. Browsers
 * refuse audio before a gesture, so the strike tries once on landing and stays silent if
 * refused; the "Replay with sound" pill is the gesture that plays it. Muting is remembered
 * per viewer. Reduced motion gets the lit end state, no strike and no sound.
 */

const SOUND_KEY = "favor.events.sound";

function readPref() {
  try { return localStorage.getItem(SOUND_KEY); } catch { return null; }
}
function writePref(value) {
  try { localStorage.setItem(SOUND_KEY, value); } catch { /* private mode: fine */ }
}

let audio = null;
function context() {
  if (!audio) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  return audio;
}

/* A carbon-arc follow-spot: the shutter's mechanical clunk, the arc's crackle, a short hum. */
function playStrike(ctx) {
  const t = ctx.currentTime + 0.01;
  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  // clunk: a low sine thump with a fast pitch drop
  const thump = ctx.createOscillator();
  const thumpGain = ctx.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(110, t);
  thump.frequency.exponentialRampToValueAtTime(42, t + 0.18);
  thumpGain.gain.setValueAtTime(0.0001, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.9, t + 0.008);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  thump.connect(thumpGain).connect(master);
  thump.start(t);
  thump.stop(t + 0.35);

  // crackle: band-passed noise bursts that follow the visual stutter
  const length = Math.floor(ctx.sampleRate * 0.7);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 2400;
  band.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  const g = noiseGain.gain;
  g.setValueAtTime(0.0001, t);
  [[0.0, 0.5], [0.07, 0.05], [0.14, 0.35], [0.21, 0.06], [0.28, 0.22]].forEach(([at, v]) => {
    g.exponentialRampToValueAtTime(v, t + at + 0.006);
  });
  g.exponentialRampToValueAtTime(0.0001, t + 0.62);
  noise.connect(band).connect(noiseGain).connect(master);
  noise.start(t);
  noise.stop(t + 0.7);

  // hum: the lamp settling, felt more than heard
  const hum = ctx.createOscillator();
  const humFilter = ctx.createBiquadFilter();
  const humGain = ctx.createGain();
  hum.type = "sawtooth";
  hum.frequency.value = 120;
  humFilter.type = "lowpass";
  humFilter.frequency.value = 320;
  humGain.gain.setValueAtTime(0.0001, t + 0.3);
  humGain.gain.exponentialRampToValueAtTime(0.05, t + 0.5);
  humGain.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  hum.connect(humFilter).connect(humGain).connect(master);
  hum.start(t + 0.3);
  hum.stop(t + 2.5);
}

async function trySound({ gesture }) {
  const ctx = context();
  if (!ctx) return false;
  if (ctx.state !== "running") {
    try { await ctx.resume(); } catch { /* refused */ }
  }
  if (ctx.state !== "running") return false;
  playStrike(ctx);
  return true;
}

function boot(root) {
  const stage = root.querySelector(".ev-stage");
  const lit = root.querySelector(".ev-lit");
  const bulbs = Array.from(root.querySelectorAll(".ev-foot b"));
  const button = root.querySelector(".ev-sound");
  const label = button?.querySelector(".ev-sound__label");
  if (!stage || !lit) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let tx = 50, ty = 50, x = 50, y = 50, lastMove = -Infinity, t0 = performance.now();
  let sweeping = false;
  let timers = [];

  function place(px, py) {
    stage.style.setProperty("--x", px + "%");
    stage.style.setProperty("--y", py + "%");
    // the lit word's mask shares the cone's centre, measured in the word's own box
    const sr = stage.getBoundingClientRect();
    const wr = lit.getBoundingClientRect();
    lit.style.setProperty("--lx", (sr.left + (sr.width * px) / 100 - wr.left).toFixed(1) + "px");
    lit.style.setProperty("--ly", (sr.top + (sr.height * py) / 100 - wr.top).toFixed(1) + "px");
  }

  function setSoundUi(on) {
    if (!button) return;
    button.setAttribute("aria-pressed", on ? "true" : "false");
    if (label) label.textContent = on ? "Sound on" : "Replay with sound";
  }

  function lightsOn({ withSound }) {
    timers.forEach(clearTimeout);
    timers = [];
    sweeping = false;
    stage.classList.remove("is-lit", "is-striking");
    stage.style.setProperty("--power", "0");
    bulbs.forEach((b) => b.classList.remove("is-on"));
    tx = x = 50; ty = y = 50;
    place(50, 50);

    const at = (ms, fn) => timers.push(setTimeout(fn, ms));
    at(380, () => {
      void stage.offsetWidth; // restart the strike keyframes on replay
      stage.style.setProperty("--power", "1");
      stage.classList.add("is-striking");
      if (withSound) trySound({ gesture: false }).then((ok) => setSoundUi(ok));
    });
    bulbs.forEach((b, i) => at(820 + i * 110, () => b.classList.add("is-on")));
    at(1100, () => stage.classList.add("is-lit"));
    at(2500, () => { sweeping = true; t0 = performance.now(); });
  }

  if (reduce) {
    stage.style.setProperty("--power", "1");
    stage.style.setProperty("--r", "40rem");
    stage.classList.add("is-lit");
    bulbs.forEach((b) => b.classList.add("is-on"));
    place(50, 50);
    if (button) button.hidden = true;
    return;
  }

  const muted = readPref() === "off";
  setSoundUi(false);
  lightsOn({ withSound: !muted });

  button?.addEventListener("click", async () => {
    if (button.getAttribute("aria-pressed") === "true") {
      writePref("off");
      setSoundUi(false);
      return;
    }
    writePref("on");
    const ctx = context();
    if (ctx && ctx.state !== "running") { try { await ctx.resume(); } catch { /* ignore */ } }
    lightsOn({ withSound: true });
  });

  stage.addEventListener("pointermove", (event) => {
    if (!sweeping) return;
    const r = stage.getBoundingClientRect();
    tx = ((event.clientX - r.left) / r.width) * 100;
    ty = ((event.clientY - r.top) / r.height) * 100;
    lastMove = performance.now();
  });

  (function loop(now) {
    if (sweeping) {
      if (now - lastMove > 1800) { // idle: the operator sweeps a slow figure-eight
        const s = (now - t0) / 1000;
        tx = 50 + Math.sin(s * 0.42) * 34;
        ty = 50 + Math.sin(s * 0.84) * 16;
      }
      x += (tx - x) * 0.06;
      y += (ty - y) * 0.06;
      place(x.toFixed(2), y.toFixed(2));
    }
    requestAnimationFrame(loop);
  })(t0);
}

const root = document.getElementById("events-island");
if (root) boot(root);
