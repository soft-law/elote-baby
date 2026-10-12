// Procedural elote geometry shared by the hero mark (CornScene) and the pool field
// (FieldScene). three.js only, no React: imported by the lazy scene chunks, never by the
// prerendered landing.
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Palette keyed to the landing tokens (src/index.css): kernels warm down from corn-100 (#FFF1C9),
// nothing as saturated as a cartoon yellow; husks a muted sage between the system's
// greens and teals (green-700 is reserved for success); neon only as a night rim.
export const PALETTE = {
  kernel: "#E6C072", // muted kernel gold
  kernelLight: "#F7DFA2",
  cream: "#FFF1C9", // corn-100
  core: "#7A5B2C", // muted umber
  husk: "#8AA585", // sage
  huskDark: "#668A72",
  neon: "#6AE1E7", // night only
  night: "#131313", // night
};

// Cob profile: radius as a function of height. Fuller near the base, tapering to the tip.
export const COB_HALF = 1.25;
export function cobRadius(y: number): number {
  const t = Math.min(1, Math.max(0, (y + COB_HALF) / (2 * COB_HALF))); // 0 base .. 1 tip
  const bottom = Math.sqrt(Math.sin((Math.PI / 2) * Math.min(1, t / 0.1)));
  const tip = 1 - 0.85 * Math.pow(Math.max(0, (t - 0.42) / 0.58), 2.4);
  return Math.max(0.04, 0.48 * bottom * tip);
}

/** Deterministic hash in [0, 1): stable across renders and screenshots (no Math.random). */
export function hash01(i: number): number {
  const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return h - Math.floor(h);
}

// One husk leaf: a strip wrapped around the cob that peels outward toward its tip.
// U x V quads; the hero uses the full 6 x 14, the field a 3 x 6 low-poly cut.
export function huskGeometry(span: number, height: number, peel: number, U = 6, V = 14): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const yBase = -COB_HALF - 0.3;
  for (let v = 0; v <= V; v++) {
    const t = v / V;
    const y = yBase + t * (height + 0.18);
    // wide wrap at the base, closing to a point at the tip
    const width = span * Math.min(1, 0.55 + t * 3) * (1 - Math.pow(t, 1.7));
    // hug the cob, pinch into the stem below it, peel away toward the tip
    const hug = cobRadius(Math.max(y, -COB_HALF + 0.15)) + 0.06;
    const p = Math.min(1, Math.max(0, (y + COB_HALF + 0.3) / 0.45));
    const pinch = p * p * (3 - 2 * p);
    const r = 0.13 + (hug - 0.13) * pinch + peel * Math.pow(t, 2.2);
    const lean = 0.18 * Math.pow(t, 2); // tips curl slightly sideways
    for (let u = 0; u <= U; u++) {
      const s = u / U - 0.5;
      const a = s * width + lean;
      // slight cupping across the leaf so it is not a flat ribbon
      const cup = 1 + 0.08 * (1 - Math.abs(s) * 2);
      pos.push(Math.cos(a) * r * cup, y + Math.abs(s) * 0.12 * t, Math.sin(a) * r * cup);
    }
  }
  for (let v = 0; v < V; v++) {
    for (let u = 0; u < U; u++) {
      const a = v * (U + 1) + u;
      const b = a + U + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---- Field cob (the pool section): one low-poly elote drawn 100 times ----

/** One cob per credit line in the first pool. */
export const FIELD_COUNT = 100;

/** Height that lifts a field cob so its stem sits on y = 0. */
export const FIELD_BASE = COB_HALF + 0.44;
const AROUND = 12;
const ALONG = 15;

/**
 * Kernel body as a faceted lathe: each quad is one kernel, rows run straight up the cob like
 * on a real elote, alternate kernels take a slightly deeper tone and every other ring sits a
 * little lower, so flat shading reads as kernels at field distance. Non-indexed, so every face
 * keeps its own vertex colour.
 */
export function fieldKernelGeometry(): BufferGeometry {
  const y0 = -COB_HALF + 0.06;
  const y1 = COB_HALF - 0.02;
  const ring = (j: number) => {
    const y = y0 + ((y1 - y0) * j) / ALONG;
    const r = cobRadius(y) * (j % 2 ? 1.015 : 0.97);
    const pts: [number, number, number][] = [];
    for (let k = 0; k < AROUND; k++) {
      const a = (k / AROUND) * Math.PI * 2 + j * 0.03; // the gentle spiral of the hero cob
      pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    return pts;
  };
  const rings = Array.from({ length: ALONG + 1 }, (_, j) => ring(j));
  const pos: number[] = [];
  const col: number[] = [];
  const light = [1, 1, 1];
  const shade = [0.9, 0.84, 0.72];
  // Every face is wound outward: flip it when its normal points into the cob.
  const tri = (a: number[], b: number[], c: number[], tone: number[]) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const nz = ux * vy - uy * vx;
    const out = nx * (a[0] + b[0] + c[0]) + nz * (a[2] + b[2] + c[2]) >= 0;
    pos.push(...a, ...(out ? b : c), ...(out ? c : b));
    for (let n = 0; n < 3; n++) col.push(...tone);
  };
  for (let j = 0; j < ALONG; j++) {
    const lo = rings[j];
    const hi = rings[j + 1];
    for (let k = 0; k < AROUND; k++) {
      const k1 = (k + 1) % AROUND;
      const tone = (k + j) % 2 ? light : shade;
      tri(lo[k], hi[k], lo[k1], tone);
      tri(lo[k1], hi[k], hi[k1], tone);
    }
  }
  // Tip cap: a small cone to a point.
  const top = rings[ALONG];
  const tipY = y1 + 0.1;
  for (let k = 0; k < AROUND; k++) tri(top[(k + 1) % AROUND], top[k], [0, tipY, 0], light);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.translate(0, FIELD_BASE, 0);
  return g;
}

/** Three low-poly husk leaves and the stem, merged into one indexed geometry. */
export function fieldHuskGeometry(): BufferGeometry {
  const leaves = [
    { g: huskGeometry(1.55, 1.75, 0.38, 3, 6), rot: Math.PI * 0.5 },
    { g: huskGeometry(1.45, 1.4, 0.5, 3, 6), rot: Math.PI * 0.5 + 2.2 },
    { g: huskGeometry(1.4, 1.6, 0.44, 3, 6), rot: Math.PI * 0.5 - 2.1 },
  ].map(({ g, rot }) => g.rotateY(rot));
  const stem = new CylinderGeometry(0.12, 0.16, 0.3, 6, 1, true);
  stem.deleteAttribute("uv");
  stem.translate(0, -COB_HALF - 0.28, 0);
  const merged = mergeGeometries([...leaves, stem]);
  if (!merged) throw new Error("husk merge failed");
  merged.computeVertexNormals();
  merged.translate(0, FIELD_BASE, 0);
  return merged;
}

export function triangleCount(g: BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute("position").count) / 3;
}
