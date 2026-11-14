// Loading overlay: a thin progress bar where the planet will land. The planet itself stays hidden
// until its textures are decoded and uploaded, so nothing half-textured is ever shown.
const MARKUP = `
<div class="ld-name"></div>
<div class="ld-track"><div class="ld-fill"><div class="ld-sheen"></div></div></div>
<div class="ld-pct"><span class="ld-num">0</span>%</div>`;

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
  el.id = "loader"; el.setAttribute("role", "progressbar"); el.setAttribute("aria-valuemin", "0"); el.setAttribute("aria-valuemax", "100");
  el.innerHTML = MARKUP; el.hidden = true;
  document.body.appendChild(el);
  const fill = el.querySelector<HTMLDivElement>(".ld-fill")!;
  const num = el.querySelector<HTMLSpanElement>(".ld-num")!;
  const nameEl = el.querySelector<HTMLDivElement>(".ld-name")!;
  let visible = false, shownAt = 0, target = 0, shown = 0, lastPct = -1, hideTimer = 0;

  function paint() {
    // width is driven every frame from the eased value, so the bar glides instead of stepping
    fill.style.transform = `scaleX(${shown.toFixed(4)})`;
    const pct = Math.round(shown * 100);
    if (pct !== lastPct) { lastPct = pct; num.textContent = String(pct); el.setAttribute("aria-valuenow", String(pct)); }
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
      el.style.setProperty("--ld-x", `${x}px`); el.style.setProperty("--ld-y", `${y}px`);
      el.style.setProperty("--ld-w", `${Math.round(Math.max(160, Math.min(radius * 0.8, 300)))}px`);
    },
    tick(dt) {
      if (!visible) return;
      // Progress follows the bytes downloaded. Glide toward it rather than jumping, and drift a
      // touch past it so the bar does not freeze while a finished file is decoded and uploaded.
      const goal = target < 1 ? Math.min(target + 0.03, 0.985) : 1;
      const rate = target >= 1 ? 7 : shown < target ? 4 : 0.3;
      shown += (goal - shown) * Math.min(1, rate * dt);
      if (target >= 1 && 1 - shown < 0.004) shown = 1;
      paint();
    },
    shownFor() { return visible ? (performance.now() - shownAt) / 1000 : 0; },
    settled() { return !visible || shown >= 1; },
    done() {
      if (!visible) return;
      visible = false; el.classList.remove("on"); el.classList.add("done");
      hideTimer = window.setTimeout(() => { el.hidden = true; el.classList.remove("done"); }, 600);
    },
  };
}
