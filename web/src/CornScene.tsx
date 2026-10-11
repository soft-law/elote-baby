// Three.js scene for CornMark. Imported lazily by CornMark.tsx only; never import it
// statically, or three + R3F land in the entry chunk.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  Object3D,
  SphereGeometry,
  Vector2,
} from "three";

export type CornTheme = "night" | "light";

export interface CornSceneProps {
  theme: CornTheme;
  /** false = render one still frame and stop (reduced motion). */
  animate: boolean;
  /** false = stop the render loop entirely (offscreen or tab hidden). */
  active: boolean;
  onReady?: () => void;
  onError?: () => void;
}

// Palette keyed to the landing tokens (src/index.css): kernels warm down from corn-100 (#FFF1C9),
// nothing as saturated as a cartoon yellow; husks a muted sage between the system's
// greens and teals (green-700 is reserved for success); neon only as a night rim.
const PALETTE = {
  kernel: "#E6C072", // muted kernel gold
  kernelLight: "#F7DFA2",
  cream: "#FFF1C9", // corn-100
  core: "#7A5B2C", // muted umber
  husk: "#8AA585", // sage
  huskDark: "#668A72",
  neon: "#6AE1E7", // night only
};

// Cob profile: radius as a function of height. Fuller near the base, tapering to the tip.
const COB_HALF = 1.25;
function cobRadius(y: number): number {
  const t = Math.min(1, Math.max(0, (y + COB_HALF) / (2 * COB_HALF))); // 0 base .. 1 tip
  const bottom = Math.sqrt(Math.sin((Math.PI / 2) * Math.min(1, t / 0.1)));
  const tip = 1 - 0.85 * Math.pow(Math.max(0, (t - 0.42) / 0.58), 2.4);
  return Math.max(0.04, 0.48 * bottom * tip);
}

const ROWS_AROUND = 16;
const ROWS_ALONG = 22;
const TWIST = 0.045; // radians per row: the gentle spiral

function Kernels() {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new SphereGeometry(1, 6, 4), []);
  const count = ROWS_AROUND * ROWS_ALONG;

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const c = new Color();
    const base = new Color(PALETTE.kernel);
    const light = new Color(PALETTE.kernelLight);
    const cream = new Color(PALETTE.cream);
    const y0 = -COB_HALF + 0.12;
    const y1 = COB_HALF - 0.08;
    const step = (y1 - y0) / (ROWS_ALONG - 1);
    let i = 0;
    for (let j = 0; j < ROWS_ALONG; j++) {
      const y = y0 + j * step;
      const r = cobRadius(y);
      const shrink = Math.min(1, r / 0.45);
      for (let k = 0; k < ROWS_AROUND; k++) {
        const a = (k + (j % 2) * 0.5) / ROWS_AROUND * Math.PI * 2 + j * TWIST;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        dummy.position.set(ca * r, y, sa * r);
        dummy.lookAt(ca * r * 2, y, sa * r * 2);
        const w = ((Math.PI * 2 * r) / ROWS_AROUND) * 0.56;
        dummy.scale.set(w, step * 0.56 * (0.6 + 0.4 * shrink), 0.075 * (0.5 + 0.5 * shrink));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        // Deterministic jitter (no Math.random): stable across renders and screenshots.
        const h = Math.sin(i * 12.9898) * 43758.5453;
        const n = h - Math.floor(h);
        c.copy(base).lerp(n > 0.9 ? cream : light, n > 0.9 ? 0.25 : n * 0.5);
        mesh.setColorAt(i, c);
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, count]}>
      <meshStandardMaterial flatShading roughness={0.42} metalness={0} />
    </instancedMesh>
  );
}

function Core() {
  const geometry = useMemo(() => {
    const pts: Vector2[] = [];
    for (let s = 0; s <= 14; s++) {
      const y = -COB_HALF + (s / 14) * 2 * COB_HALF;
      pts.push(new Vector2(cobRadius(y) * 0.93, y));
    }
    return new LatheGeometry(pts, 16);
  }, []);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={PALETTE.core} flatShading roughness={0.7} />
    </mesh>
  );
}

// One husk leaf: a strip wrapped around the cob that peels outward toward its tip.
function huskGeometry(span: number, height: number, peel: number): BufferGeometry {
  const U = 6;
  const V = 14;
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

function Husks() {
  const leaves = useMemo(
    () => [
      { geo: huskGeometry(1.55, 1.75, 0.38), rot: Math.PI * 0.5, color: PALETTE.husk },
      { geo: huskGeometry(1.45, 1.4, 0.5), rot: Math.PI * 0.5 + 2.2, color: PALETTE.huskDark },
      { geo: huskGeometry(1.4, 1.6, 0.44), rot: Math.PI * 0.5 - 2.1, color: PALETTE.husk },
    ],
    [],
  );
  return (
    <group>
      {leaves.map((l, i) => (
        <mesh key={i} geometry={l.geo} rotation={[0, l.rot, 0]}>
          <meshStandardMaterial color={l.color} side={DoubleSide} flatShading roughness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, -COB_HALF - 0.28, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.3, 8]} />
        <meshStandardMaterial color={PALETTE.huskDark} flatShading roughness={0.85} />
      </mesh>
    </group>
  );
}

function Rig({ animate, active }: { animate: boolean; active: boolean }) {
  const group = useRef<Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    if (!animate) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [animate]);

  // A still frame is needed whenever motion or visibility changes.
  useLayoutEffect(() => {
    invalidate();
  }, [animate, active, invalidate]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || !animate) return;
    const d = Math.min(dt, 0.05);
    g.rotation.y += d * 0.35; // slow idle spin
    const k = 1 - Math.exp(-d * 3); // frame-rate independent easing
    g.rotation.x += (pointer.current.y * 0.18 - g.rotation.x) * k;
    g.position.x += (pointer.current.x * 0.12 - g.position.x) * k;
  });

  return (
    <group rotation={[0, 0, -0.22]} position={[-0.08, 0.05, 0]}>
      <group ref={group} rotation={[0, 0.6, 0]}>
        <Core />
        <Kernels />
        <Husks />
      </group>
    </group>
  );
}

function Lights({ theme }: { theme: CornTheme }) {
  const night = theme === "night";
  return (
    <>
      <hemisphereLight args={[night ? "#FFF6E0" : "#FFFFFF", night ? "#1C2A2B" : "#D9D2BF", night ? 1.1 : 1.4]} />
      <directionalLight position={[-3, 4, 4]} intensity={night ? 2.2 : 2.4} color="#FFF3DA" />
      <directionalLight position={[2, -2, 4]} intensity={0.6} color="#FFE7B0" />
      {/* Neon rim, night only (brand rule: glow on night). */}
      <pointLight position={[2.2, 0.8, -2.2]} intensity={night ? 10 : 0} distance={8} color={PALETTE.neon} />
      <pointLight position={[-2.4, -1.2, -1.8]} intensity={night ? 5 : 0} distance={8} color={PALETTE.neon} />
    </>
  );
}

export default function CornScene({ theme, animate, active, onReady, onError }: CornSceneProps) {
  const frameloop = !active || !animate ? "demand" : "always";
  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, 1.5]}
      camera={{ fov: 30, position: [0, -0.05, 6.9], near: 0.1, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power", failIfMajorPerformanceCaveat: false }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.domElement.addEventListener("webglcontextlost", () => onError?.(), { once: true });
        requestAnimationFrame(() => onReady?.());
      }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    >
      <Lights theme={theme} />
      <Rig animate={animate && active} active={active} />
    </Canvas>
  );
}

