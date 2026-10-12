// Three.js field for the pool section: one hundred elotes, one per credit line in the first
// pool. Loaded lazily through CornMark's `load` prop; never import it statically, or three +
// R3F land in the entry chunk. Two InstancedMeshes (kernels, husks) = two draw calls.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, Euler, Group, InstancedMesh, Matrix4, Plane, Quaternion, Vector2, Vector3 } from "three";
import type { CornSceneProps } from "./CornScene";
import { FIELD_COUNT, PALETTE, fieldHuskGeometry, fieldKernelGeometry, hash01 } from "./shared/cob";

const SIDE = 10; // 10 x 10 = FIELD_COUNT
const SPACING = 1.75;
const COB_SCALE = 0.92;
const HOVER_LIFT = 0.8;
const GROUND = "#1B201F"; // a step above night so the rows have a floor
const CAM_Y = 16;
const CAM_Z = 27;
const LOOK = new Vector3(-0.9, 0.6, -0.6);

interface Cob {
  x: number;
  z: number;
  yaw: number;
  leanX: number;
  leanZ: number;
  scale: number;
  phase: number;
}

function layout(): Cob[] {
  const cobs: Cob[] = [];
  const half = ((SIDE - 1) * SPACING) / 2;
  for (let i = 0; i < FIELD_COUNT; i++) {
    const row = Math.floor(i / SIDE);
    const col = i % SIDE;
    // Small deterministic offsets: a planted field, not a lattice.
    cobs.push({
      x: col * SPACING - half + (hash01(i * 3 + 1) - 0.5) * 0.4,
      z: row * SPACING - half + (hash01(i * 3 + 2) - 0.5) * 0.4,
      yaw: hash01(i * 7 + 3) * Math.PI * 2,
      leanX: (hash01(i * 5 + 4) - 0.5) * 0.1,
      leanZ: (hash01(i * 5 + 6) - 0.5) * 0.1,
      scale: COB_SCALE * (0.9 + hash01(i * 11 + 5) * 0.2),
      phase: hash01(i * 13 + 7) * Math.PI * 2,
    });
  }
  return cobs;
}

function Field({ animate }: { animate: boolean }) {
  const group = useRef<Group>(null);
  const kernels = useRef<InstancedMesh>(null);
  const husks = useRef<InstancedMesh>(null);
  const kernelGeo = useMemo(fieldKernelGeometry, []);
  const huskGeo = useMemo(fieldHuskGeometry, []);
  const cobs = useMemo(layout, []);
  const lift = useMemo(() => new Float32Array(FIELD_COUNT), []);
  const pointer = useRef<Vector2 | null>(null);
  const { gl, camera, raycaster, invalidate } = useThree();

  const tmp = useMemo(
    () => ({
      m: new Matrix4(),
      q: new Quaternion(),
      e: new Euler(),
      p: new Vector3(),
      s: new Vector3(),
      hit: new Vector3(),
      plane: new Plane(new Vector3(0, 1, 0), -1.6),
    }),
    [],
  );

  const write = (t: number) => {
    const k = kernels.current;
    const h = husks.current;
    if (!k || !h) return;
    const { m, q, e, p, s } = tmp;
    for (let i = 0; i < FIELD_COUNT; i++) {
      const c = cobs[i];
      // Wind: a slow wave rolling across the rows plus a small per-cob flutter.
      const wave = animate ? Math.sin(t * 0.9 - c.x * 0.32 - c.z * 0.18) : 0;
      const flutter = animate ? Math.sin(t * 2.1 + c.phase) : 0;
      e.set(c.leanX + wave * 0.035 + flutter * 0.01, c.yaw, c.leanZ + wave * 0.06 + flutter * 0.015);
      q.setFromEuler(e);
      p.set(c.x, lift[i], c.z);
      s.setScalar(c.scale);
      m.compose(p, q, s);
      k.setMatrixAt(i, m);
      h.setMatrixAt(i, m);
    }
    k.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    const k = kernels.current;
    const h = husks.current;
    if (!k || !h) return;
    const c = new Color();
    const gold = new Color(PALETTE.kernel);
    const light = new Color(PALETTE.kernelLight);
    const sage = new Color(PALETTE.husk);
    const sageDark = new Color(PALETTE.huskDark);
    for (let i = 0; i < FIELD_COUNT; i++) {
      c.copy(gold).lerp(light, hash01(i * 17 + 9) * 0.55);
      k.setColorAt(i, c);
      c.copy(sage).lerp(sageDark, hash01(i * 19 + 2));
      h.setColorAt(i, c);
    }
    if (k.instanceColor) k.instanceColor.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
    write(0);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  // Pointer over the canvas lifts the nearest cob. Motion only; reduced motion stays still.
  useLayoutEffect(() => {
    if (!animate) return;
    const el = gl.domElement;
    const onMove = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.current = new Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    };
    const onLeave = () => {
      pointer.current = null;
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [animate, gl]);

  useFrame((state, dt) => {
    if (!animate) return;
    const t = state.clock.elapsedTime;
    const d = Math.min(dt, 0.05);
    // Gentle camera drift around the field.
    camera.position.set(Math.sin(t * 0.11) * 1.2, CAM_Y + Math.sin(t * 0.07) * 0.4, CAM_Z);
    camera.lookAt(LOOK);

    let nearest = -1;
    const g = group.current;
    if (pointer.current && g) {
      raycaster.setFromCamera(pointer.current, camera);
      if (raycaster.ray.intersectPlane(tmp.plane, tmp.hit)) {
        g.worldToLocal(tmp.hit);
        let best = SPACING * SPACING * 0.8;
        for (let i = 0; i < FIELD_COUNT; i++) {
          const dx = cobs[i].x - tmp.hit.x;
          const dz = cobs[i].z - tmp.hit.z;
          const dd = dx * dx + dz * dz;
          if (dd < best) {
            best = dd;
            nearest = i;
          }
        }
      }
    }
    const k = 1 - Math.exp(-d * 8);
    for (let i = 0; i < FIELD_COUNT; i++) lift[i] += ((i === nearest ? HOVER_LIFT : 0) - lift[i]) * k;
    write(t);
  });

  return (
    <group ref={group} rotation={[0, -0.32, 0]}>
      <instancedMesh ref={kernels} args={[kernelGeo, undefined, FIELD_COUNT]} frustumCulled={false}>
        <meshStandardMaterial vertexColors flatShading roughness={0.45} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={husks} args={[huskGeo, undefined, FIELD_COUNT]} frustumCulled={false}>
        <meshStandardMaterial side={DoubleSide} flatShading roughness={0.8} metalness={0} />
      </instancedMesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[70, 48]} />
        <meshStandardMaterial color={GROUND} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

function Lights() {
  return (
    <>
      <hemisphereLight args={["#FFF6E0", "#1C2A2B", 0.9]} />
      {/* Warm key from the front left, like late sun. */}
      <directionalLight position={[-8, 12, 10]} intensity={2.3} color="#FFF3DA" />
      {/* Neon rim from behind (brand rule: glow on night). */}
      <directionalLight position={[12, 4, -6]} intensity={3} color={PALETTE.neon} />
      <directionalLight position={[-12, 3, -8]} intensity={1.2} color={PALETTE.neon} />
    </>
  );
}

function Invalidate({ deps }: { deps: unknown[] }) {
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return null;
}

export default function FieldScene({ animate, active, onReady, onError }: CornSceneProps) {
  const frameloop = !active || !animate ? "demand" : "always";
  const run = animate && active;
  return (
    <Canvas
      frameloop={frameloop}
      dpr={[1, 1.5]}
      camera={{ fov: 32, position: [0, CAM_Y, CAM_Z], near: 1, far: 80 }}
      gl={{ antialias: true, alpha: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: false }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(PALETTE.night, 1);
        camera.lookAt(LOOK);
        gl.domElement.addEventListener("webglcontextlost", () => onError?.(), { once: true });
        requestAnimationFrame(() => onReady?.());
      }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    >
      <fog attach="fog" args={[PALETTE.night, 30, 56]} />
      <Lights />
      <Field animate={run} />
      <Invalidate deps={[run, active]} />
    </Canvas>
  );
}
