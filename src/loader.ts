// Loading overlay: an "acquisition" reticle drawn where the planet will land. The planet itself stays
// hidden until its textures are decoded and uploaded, so nothing half-textured is ever shown.
const R = 78;                          // progress ring radius in viewBox units (the planet's limb is at 80)
const CIRC = 2 * Math.PI * R;

const MARKUP = `
<svg viewBox="-120 -120 240 240" aria-hidden="true">
  <defs>
    <radialGradient id="ld-core" cx="38%" cy="34%" r="75%">
      <stop offset="0" stop-color="#7fb6ff" stop-opacity="0.16"/>
      <stop offset="0.55" stop-color="#3a6cc8" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ld-arc" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#bfe0ff"/>
      <stop offset="1" stop-color="#5aa2ff"/>
    </linearGradient>
    <filter id="ld-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="ld-halo-a"><stop offset="0" stop-color="#eaf4ff"/><stop offset="0.28" stop-color="#a9d0ff" stop-opacity="0.55"/><stop offset="1" stop-color="#a9d0ff" stop-opacity="0"/></radialGradient>
    <radialGradient id="ld-halo-b"><stop offset="0" stop-color="#fff0d8"/><stop offset="0.28" stop-color="#ffc98a" stop-opacity="0.5"/><stop offset="1" stop-color="#ffc98a" stop-opacity="0"/></radialGradient>
    <path id="ld-orbit-a" d="M -106 0 A 106 46 0 1 1 106 0 A 106 46 0 1 1 -106 0"/>
    <path id="ld-orbit-b" d="M 98 0 A 98 40 0 1 0 -98 0 A 98 40 0 1 0 98 0"/>
  </defs>
  <circle r="80" fill="url(#ld-core)"/>
  <circle class="ld-ticks" r="88" fill="none" stroke="#dfe6f0" stroke-opacity="0.34" stroke-width="3" stroke-dasharray="0.5 6.41"/>
  <circle r="${R}" fill="none" stroke="#dfe6f0" stroke-opacity="0.12" stroke-width="0.8"/>
  <g class="ld-sweep" filter="url(#ld-glow)">
    <circle r="${R}" fill="none" stroke="#9cc8ff" stroke-opacity="0.55" stroke-width="1.1" stroke-linecap="round" stroke-dasharray="46 ${CIRC - 46}"/>
  </g>
  <circle class="ld-progress" r="${R}" fill="none" stroke="url(#ld-arc)" stroke-width="1.8" stroke-linecap="round"
    stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}" transform="rotate(-90)" filter="url(#ld-glow)"/>
  <g transform="rotate(-24)">
    <use href="#ld-orbit-a" fill="none" stroke="#dfe6f0" stroke-opacity="0.16" stroke-width="0.5"/>
    <circle class="ld-sat" r="6.5" fill="url(#ld-halo-a)" data-rx="106" data-ry="46" data-period="3.4" data-phase="0.6"/>
  </g>
  <g transform="rotate(17)">
    <use href="#ld-orbit-b" fill="none" stroke="#dfe6f0" stroke-opacity="0.11" stroke-width="0.5"/>
    <circle class="ld-sat" r="5" fill="url(#ld-halo-b)" data-rx="98" data-ry="40" data-period="-5.2" data-phase="3.9"/>
  </g>
</svg>
<div class="ld-readout">
  <div class="ld-kicker">Acquiring</div>
  <div class="ld-name"></div>
  <div class="ld-pct"><span class="ld-num">0</span><span class="ld-unit">%</span></div>
</div>`;

export type Loader = {
  /** Show the overlay for a body. Safe to call every frame. */
  show(name: string): void;
  /** Target progress, 0..1. The displayed value eases toward it. */
  progress(p: number): void;
  /** Centre and planet radius in CSS pixels. */
  place(x: number, y: number, radius: number): void;
  /** Advance the eased readout; call once per frame while visible. */
  tick(dt: number): void;
  /** Seconds since it was shown, 0 when hidden. */
  shownFor(): number;
  /** True once the readout has caught up with a finished load. */
  settled(): boolean;
  /** Play the exit and remove from view. */
  done(): void;
};

export function createLoader(): Loader {
  const el = document.createElement("div");
  el.id = "loader"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
  el.innerHTML = MARKUP; el.hidden = true;
  document.body.appendChild(el);
  const arc = el.querySelector<SVGCircleElement>(".ld-progress")!;
  const num = el.querySelector<HTMLSpanElement>(".ld-num")!;
  const nameEl = el.querySelector<HTMLDivElement>(".ld-name")!;
  const sats = [...el.querySelectorAll<SVGCircleElement>(".ld-sat")].map((node) => ({ node, rx: +node.dataset.rx!, ry: +node.dataset.ry!, period: +node.dataset.period!, phase: +node.dataset.phase! }));
  let visible = false, shownAt = 0, target = 0, shown = 0, lastPct = -1, hideTimer = 0, clock = 0;
  function orbit() { for (const s of sats) { const a = s.phase + (clock / s.period) * Math.PI * 2; s.node.setAttribute("cx", (s.rx * Math.cos(a)).toFixed(2)); s.node.setAttribute("cy", (s.ry * Math.sin(a)).toFixed(2)); } }
  orbit();

  function paint() {
    arc.style.strokeDashoffset = String(CIRC * (1 - shown));
    const pct = Math.round(shown * 100);
    if (pct !== lastPct) { lastPct = pct; num.textContent = String(pct); }
  }
  return {
    show(name) {
      if (nameEl.textContent !== name) nameEl.textContent = name;
      if (visible) return;
      clearTimeout(hideTimer);
      visible = true; shownAt = performance.now(); target = 0; shown = 0; lastPct = -1;
      el.hidden = false; el.classList.remove("done");
      el.setAttribute("aria-label", `Loading ${name}`);
      paint();
      // next frame, so the entrance transition runs from the hidden state
      requestAnimationFrame(() => el.classList.add("on"));
    },
    progress(p) { target = Math.max(target, Math.min(1, p)); },
    place(x, y, radius) {
      // the SVG's planet limb sits at 80 of 120 viewBox units
      const size = (radius * 2 * 120) / 80;
      el.style.setProperty("--ld-x", `${x}px`); el.style.setProperty("--ld-y", `${y}px`); el.style.setProperty("--ld-size", `${size}px`);
    },
    tick(dt) {
      if (!visible) return;
      clock += dt; orbit();
      // Texture loads report no byte progress, so progress arrives in a few coarse steps. Ease toward
      // the real value and creep a little past it, so the ring keeps moving without ever claiming
      // more than the next step.
      const creep = target < 1 ? Math.min(target + 0.16, 0.97) : 1;
      const rate = target >= 1 ? 9 : shown < target ? 5 : 0.35;
      shown += (creep - shown) * Math.min(1, rate * dt);
      if (target >= 1 && 1 - shown < 0.004) shown = 1;
      paint();
    },
    shownFor() { return visible ? (performance.now() - shownAt) / 1000 : 0; },
    settled() { return !visible || shown >= 1; },
    done() {
      if (!visible) return;
      visible = false; el.classList.remove("on"); el.classList.add("done");
      hideTimer = window.setTimeout(() => { el.hidden = true; el.classList.remove("done"); }, 700);
    },
  };
}
