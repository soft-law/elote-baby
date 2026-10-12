// The launch story of the pool section as pure functions of elapsed time (ms). No three.js:
// FieldScene reads every value from here each frame, and the tests pin the beat boundaries.
// Beats: 1 the curve fills, 2 the raise flows into the pool, 3 the elotes rise, 4 the glow.

export const BEAT_MS = 2400;
export const BEATS = 4;
export const TOTAL_MS = BEAT_MS * BEATS;

/** 0 before the story starts (ms < 0), 1..4 during a beat, 5 once it has finished. */
export function beatAt(ms: number): number {
  if (ms < 0) return 0;
  if (ms >= TOTAL_MS) return BEATS + 1;
  return Math.floor(ms / BEAT_MS) + 1;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInCubic = (x: number) => Math.pow(clamp01(x), 3);
export const easeIn = (x: number) => clamp01(x) * clamp01(x);

/** Progress 0..1 of a tween that starts `delay` ms into beat `beat` and lasts `dur` ms. */
function tween(ms: number, beat: number, delay: number, dur: number): number {
  return clamp01((ms - (beat - 1) * BEAT_MS - delay) / dur);
}

export interface RailState {
  /** Fill length as a share of the rail, 0..1. */
  scale: number;
  /** Where the fill is anchored: "left" while it fills, "center" while it drains. */
  origin: "left" | "center";
  /** 0..1 neon flash on the full fill at the start of beat 2. */
  flash: number;
  /** Opacity of the empty track. */
  track: number;
}

export function railAt(ms: number): RailState {
  if (ms < BEAT_MS) {
    // Beat 1: constant-rate fill from the left (linear: it is a progress).
    return { scale: tween(ms, 1, 200, 1600), origin: "left", flash: 0, track: 1 };
  }
  const flashT = tween(ms, 2, 0, 180);
  const flash = flashT >= 1 ? 0 : 1 - easeOutCubic(flashT);
  return {
    scale: 1 - easeInCubic(tween(ms, 2, 200, 700)),
    origin: "center",
    flash: ms < BEAT_MS * 2 ? flash : 0,
    track: 1 - easeIn(tween(ms, 2, 800, 400)),
  };
}

/** Teal mix on the ground: 0 → 0.55 in beat 2, then back to 0.35 in beat 3. */
export const GROUND_MIX_FULL = 0.55;
export const GROUND_MIX_REST = 0.35;
export function groundMixAt(ms: number): number {
  if (ms < BEAT_MS * 2) return GROUND_MIX_FULL * easeOutCubic(tween(ms, 2, 400, 900));
  return GROUND_MIX_FULL - (GROUND_MIX_FULL - GROUND_MIX_REST) * easeOutCubic(tween(ms, 3, 600, 1200));
}

/** Start offset (ms into beat 3) of one cob's rise: front row first, a little jitter. */
export function riseDelay(frontRow: number, col: number, jitter01: number): number {
  return Math.max(0, frontRow * 140 + col * 14 + (jitter01 - 0.5) * 80);
}
export const RISE_MS = 600;

/** 0 = still below ground, 1 = standing. */
export function riseAt(ms: number, delay: number): number {
  return easeOutCubic(tween(ms, 3, delay, RISE_MS));
}

/** Height offset of a cob: below ground by `depth` until it rises, plus the hover lift. */
export function cobOffset(rise: number, depth: number, lift: number): number {
  return -depth * (1 - rise) + lift;
}

/** Hover lifts nothing until the elotes stand (beat 3 finished). */
export function hoverEnabled(ms: number): boolean {
  return ms >= BEAT_MS * 3;
}

/** Kernel glow 0..1 for a row (0 = front), a wave front to back in beat 4. */
export const GLOW_LERP = 0.6;
export function glowAt(ms: number, frontRow: number): number {
  return easeOutCubic(tween(ms, 4, frontRow * 80, 900));
}
/** True while any row is still tweening its colour. */
export function glowTweening(ms: number, rows: number): boolean {
  const t0 = BEAT_MS * 3;
  return ms >= t0 && ms <= t0 + (rows - 1) * 80 + 900;
}

/** Neon rim intensities: 3 → 4.2 and 1.2 → 1.8 in beat 4. */
export const RIM = { main: [3, 4.2], fill: [1.2, 1.8] } as const;
export function rimAt(ms: number): { main: number; fill: number } {
  const k = easeOutCubic(tween(ms, 4, 0, 1200));
  return { main: RIM.main[0] + (RIM.main[1] - RIM.main[0]) * k, fill: RIM.fill[0] + (RIM.fill[1] - RIM.fill[0]) * k };
}
