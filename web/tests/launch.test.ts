import { describe, expect, test } from "bun:test";
import { Matrix4, Quaternion, Vector3 } from "three";
import {
  FIELD_COB_SCALE_MAX,
  FIELD_COUNT,
  fieldBuryDepth,
  fieldHuskGeometry,
  fieldKernelGeometry,
  triangleCount,
} from "../src/shared/cob";
import {
  BEAT_MS,
  GROUND_MIX_FULL,
  GROUND_MIX_REST,
  RIM,
  TOTAL_MS,
  beatAt,
  cobOffset,
  glowAt,
  groundMixAt,
  hoverEnabled,
  railAt,
  riseAt,
  riseDelay,
  rimAt,
} from "../src/shared/launch";
import { translations } from "../src/translations";

describe("launch story timeline", () => {
  test("beat boundaries", () => {
    expect(beatAt(-1)).toBe(0);
    expect(beatAt(0)).toBe(1);
    expect(beatAt(BEAT_MS - 1)).toBe(1);
    expect(beatAt(BEAT_MS)).toBe(2);
    expect(beatAt(BEAT_MS * 2)).toBe(3);
    expect(beatAt(BEAT_MS * 3)).toBe(4);
    expect(beatAt(TOTAL_MS - 1)).toBe(4);
    expect(beatAt(TOTAL_MS)).toBe(5);
    expect(TOTAL_MS).toBe(9600);
  });

  test("the starting frame: empty rail, bare ground, no elotes, base rim", () => {
    const rail = railAt(-1);
    expect(rail.scale).toBe(0);
    expect(rail.track).toBe(1);
    expect(groundMixAt(-1)).toBe(0);
    expect(riseAt(-1, 0)).toBe(0);
    expect(glowAt(-1, 0)).toBe(0);
    expect(rimAt(-1)).toEqual({ main: RIM.main[0], fill: RIM.fill[0] });
  });

  test("beat 1 fills the rail at a constant rate, beat 2 drains it and hides the track", () => {
    expect(railAt(200 + 800).scale).toBeCloseTo(0.5, 5);
    expect(railAt(BEAT_MS - 1).scale).toBe(1);
    expect(railAt(BEAT_MS).flash).toBe(1);
    expect(railAt(BEAT_MS).origin).toBe("center");
    expect(railAt(BEAT_MS * 2 - 1).scale).toBe(0);
    expect(railAt(BEAT_MS * 2 - 1).track).toBe(0);
  });

  test("the ground fills to 0.55 in beat 2 and settles at 0.35 in beat 3", () => {
    expect(groundMixAt(BEAT_MS * 2 - 1)).toBeCloseTo(GROUND_MIX_FULL, 5);
    expect(groundMixAt(TOTAL_MS)).toBeCloseTo(GROUND_MIX_REST, 5);
  });

  test("every cob is standing by the end of beat 3, front row first", () => {
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const delay = riseDelay(row, col, row === 9 ? 1 : 0.5);
        expect(riseAt(BEAT_MS * 3 - 1, delay)).toBeCloseTo(1, 3);
      }
    }
    expect(riseDelay(0, 0, 0.5)).toBeLessThan(riseDelay(1, 0, 0.5));
    expect(hoverEnabled(BEAT_MS * 3 - 1)).toBe(false);
    expect(hoverEnabled(BEAT_MS * 3)).toBe(true);
  });

  test("the final state is the glowing field (the reduced-motion still frame)", () => {
    expect(glowAt(TOTAL_MS, 9)).toBe(1);
    expect(rimAt(TOTAL_MS)).toEqual({ main: RIM.main[1], fill: RIM.fill[1] });
    expect(railAt(TOTAL_MS).track).toBe(0);
    expect(railAt(TOTAL_MS).scale).toBe(0);
  });

  test("rise sums with the hover lift", () => {
    expect(cobOffset(0, 3, 0)).toBe(-3);
    expect(cobOffset(1, 3, 0.8)).toBeCloseTo(0.8, 6);
    expect(cobOffset(0.5, 3, 0.8)).toBeCloseTo(-1.5 + 0.8, 6);
  });
});

describe("pool field budget and burial", () => {
  test("100 cobs plus the two rail boxes stay under 60k triangles", () => {
    const perCob = triangleCount(fieldKernelGeometry()) + triangleCount(fieldHuskGeometry());
    expect(perCob * FIELD_COUNT + 2 * 12).toBeLessThan(60_000);
  });

  test("a buried cob shows nothing above the ground, at any yaw or lean", () => {
    const kernels = fieldKernelGeometry();
    const husks = fieldHuskGeometry();
    const depth = fieldBuryDepth(kernels, husks);
    const m = new Matrix4();
    const v = new Vector3();
    for (const geo of [kernels, husks]) {
      const pos = geo.getAttribute("position");
      for (const lean of [-0.12, 0, 0.12]) {
        const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 1).normalize(), lean);
        m.compose(new Vector3(0, cobOffset(0, depth, 0), 0), q, new Vector3().setScalar(FIELD_COB_SCALE_MAX));
        let top = -Infinity;
        for (let i = 0; i < pos.count; i++) top = Math.max(top, v.fromBufferAttribute(pos, i).applyMatrix4(m).y);
        expect(top).toBeLessThan(0);
      }
    }
  });
});

describe("pool copy", () => {
  // Extra bans for this section on top of tests/i18n.test.ts.
  const EN = /\b(yield|returns?|earn\w*|devnet|apy|mint|nft|tokenized|backed|guaranteed|dividend|stablecoin|risk-free|zero interest|automatic|free)\b|\u2014|\u2013|!/i;
  const ES = /rendimiento|\brinde\b|ganar|ganancia|respaldad|garantizad|gratis|autom[aá]tic|devnet|\u2014|\u2013|[!¡]/i;

  const strings = (node: unknown): string[] =>
    typeof node === "string" ? [node] : Array.isArray(node) ? node.flatMap(strings) : Object.values(node as object).flatMap(strings);

  test("en and es pool keys match", () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "string" ? [k] : keys(v as object).map((x) => `${k}.${x}`)));
    expect(keys(translations.es.pool).sort()).toEqual(keys(translations.en.pool).sort());
  });

  test("no banned words in the pool strings", () => {
    expect(strings(translations.en.pool).filter((s) => EN.test(s))).toEqual([]);
    expect(strings(translations.es.pool).filter((s) => ES.test(s) || EN.test(s.replace(/tMXN/g, "")))).toEqual([]);
  });

  test("four steps and four chips", () => {
    for (const lang of ["en", "es"] as const) {
      expect(translations[lang].pool.steps).toHaveLength(4);
      expect(translations[lang].pool.chips).toHaveLength(4);
    }
  });
});
