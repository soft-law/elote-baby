import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Vector3 } from "three";
import { FIELD_BASE, FIELD_COUNT, fieldHuskGeometry, fieldKernelGeometry, triangleCount } from "../src/shared/cob";

const root = join(import.meta.dir, "..");

describe("pool field scene", () => {
  test("one hundred cobs stay under 60k triangles", () => {
    const perCob = triangleCount(fieldKernelGeometry()) + triangleCount(fieldHuskGeometry());
    expect(FIELD_COUNT).toBe(100);
    expect(perCob * FIELD_COUNT).toBeLessThan(60_000);
  });

  test("kernel faces point outward and the stem stands on the ground", () => {
    const g = fieldKernelGeometry();
    const pos = g.getAttribute("position");
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i);
      b.fromBufferAttribute(pos, i + 1);
      c.fromBufferAttribute(pos, i + 2);
      const n = b.clone().sub(a).cross(c.clone().sub(a));
      const centre = a.clone().add(b).add(c);
      expect(n.x * centre.x + n.z * centre.z).toBeGreaterThanOrEqual(0);
    }
    const husk = fieldHuskGeometry();
    husk.computeBoundingBox();
    expect(husk.boundingBox!.min.y).toBeGreaterThan(-0.05);
    expect(husk.boundingBox!.min.y).toBeLessThan(0.1);
    expect(FIELD_BASE).toBeGreaterThan(0);
  });

  test("the landing never imports three.js or the scene statically", () => {
    for (const file of ["src/App.tsx", "src/CornMark.tsx"]) {
      const source = readFileSync(join(root, file), "utf8");
      // Type-only imports are erased; anything else would pull three.js into the entry chunk.
      expect(/^import (?!type )[^;]*from\s+["'](three|@react-three\/fiber)/m.test(source)).toBe(false);
      expect(/^import (?!type )[^;]*from\s+["']\.\/(FieldScene|CornScene|shared\/cob)["']/m.test(source)).toBe(false);
    }
  });
});
