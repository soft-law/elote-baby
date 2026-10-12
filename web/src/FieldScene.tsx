// Three.js field for the pool section: one hundred elotes, one per planned credit line, and the
// launch story told on them (src/shared/launch.ts): a Meteora curve fills, the raise pours into
// the pool, the elotes rise, repayments make the field glow. Loaded lazily through CornMark's
// `load` prop; never import it statically, or three + R3F land in the entry chunk.
// Draw calls: kernels, husks (both instanced), ground, rail track, rail fill.
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Color,
  DirectionalLight,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Plane,
  Quaternion,
  Vector2,
  Vector3,
} from "three";
import type { CornSceneProps } from "./CornScene";
import {
  FIELD_COB_SCALE,
  FIELD_COUNT,
  PALETTE,
  fieldBuryDepth,
  fieldHuskGeometry,
  fieldKernelGeometry,
  hash01,
} from "./shared/cob";
import {
  GLOW_LERP,
  RIM,
  TOTAL_MS,
  beatAt,
  cobOffset,
  glowAt,
  glowTweening,
  groundMixAt,
  hoverEnabled,
  railAt,
  riseAt,
  riseDelay,
  rimAt,
  type RailState,
  type RimState,
} from "./shared/launch";

/** Story controls on top of the shared scene props; the hero mark (CornScene) has none. */
export interface FieldSceneProps extends CornSceneProps {
  /** true once the card is half on screen: the story clock may start. */
  start?: boolean;
  /** Stops the story clock, the wind and the camera drift. */
  paused?: boolean;
  /** Increment to replay the story from its starting frame. */
  run?: number;
  /** Called on each beat change: 1..4, then 5 when the story has finished. */
  onBeat?: (beat: number) => void;
}

const SIDE = 10; // 10 x 10 = FIELD_COUNT
const SPACING = 1.75;
const HALF = ((SIDE - 1) * SPACING) / 2;
const HOVER_LIFT = 0.8;
const GROUND = new Color("#1B201F"); // a step above night so the rows have a floor
const TEAL = new Color("#084F54"); // teal-800: the pool's vault filling
const CORN = new Color(PALETTE.cream); // corn-100
const NEON = new Color(PALETTE.neon);
const CAM_Y = 16;
const CAM_Z = 30;
const DRIFT_X = 0.6;
const LOOK = new Vector3(-0.9, 0.6, -0.6);
// The curve: a rail lying just in front of the front row, rising 5% over its length. It is
// square to the camera, not turned with the field: turned, perspective drops its right end and
// the nearly flat curve would read as falling.
const RAIL_LEN = 12;
const RAIL_Z = 8; // along the front row; it has drained before the elotes rise
const RAIL_TILT = Math.atan2(0.05 * RAIL_LEN, RAIL_LEN);
// Centre height: the low end stays above the ground disc.
const RAIL_Y = 0.12 + 0.025 * RAIL_LEN + 0.1;

interface Cob {
  x: number;
  z: number;
  yaw: number;
  leanX: number;
  leanZ: number;
  scale: number;
  phase: number;
  /** 0 = the row nearest the camera. */
  frontRow: number;
  /** ms into beat 3 when this cob starts to rise. */
  delay: number;
  /** Kernel colour it warms toward in beat 4. */
  cream: boolean;
}

function layout(): Cob[] {
  const cobs: Cob[] = [];
  for (let i = 0; i < FIELD_COUNT; i++) {
    const row = Math.floor(i / SIDE);
    const col = i % SIDE;
    const frontRow = SIDE - 1 - row; // larger z is nearer the camera
    // Small deterministic offsets: a planted field, not a lattice.
    cobs.push({
      x: col * SPACING - HALF + (hash01(i * 3 + 1) - 0.5) * 0.4,
      z: row * SPACING - HALF + (hash01(i * 3 + 2) - 0.5) * 0.4,
      yaw: hash01(i * 7 + 3) * Math.PI * 2,
      leanX: (hash01(i * 5 + 4) - 0.5) * 0.1,
      leanZ: (hash01(i * 5 + 6) - 0.5) * 0.1,
      scale: FIELD_COB_SCALE * (0.9 + hash01(i * 11 + 5) * 0.2),
      phase: hash01(i * 13 + 7) * Math.PI * 2,
      frontRow,
      delay: riseDelay(frontRow, col, hash01(i * 23 + 11)),
      cream: hash01(i * 29 + 13) > 0.8,
    });
  }
  return cobs;
}

interface FieldProps {
  animate: boolean;
  active: boolean;
  start: boolean;
  paused: boolean;
  run: number;
  onBeat?: (beat: number) => void;
}

function Field({ animate, active, start, paused, run, onBeat }: FieldProps) {
  const group = useRef<Group>(null);
  const kernels = useRef<InstancedMesh>(null);
  const husks = useRef<InstancedMesh>(null);
  const ground = useRef<MeshStandardMaterial>(null);
  const track = useRef<Mesh>(null);
  const fill = useRef<Mesh>(null);
  const rimMain = useRef<DirectionalLight>(null);
  const rimFill = useRef<DirectionalLight>(null);
  const kernelGeo = useMemo(fieldKernelGeometry, []);
  const huskGeo = useMemo(fieldHuskGeometry, []);
  const depth = useMemo(() => fieldBuryDepth(kernelGeo, huskGeo), [kernelGeo, huskGeo]);
  const cobs = useMemo(layout, []);
  const lift = useMemo(() => new Float32Array(FIELD_COUNT), []);
  const baseColors = useMemo(() => new Float32Array(FIELD_COUNT * 3), []);
  const { gl, camera, raycaster, invalidate } = useThree();

  // Story clock (ms; -1 = waiting for the trigger) and wind clock (s). Refs, never state.
  const clock = useRef({ ms: -1, wind: 0, beat: -1, glowKey: -1, pointerIn: false, run });
  const beatCb = useRef(onBeat);
  beatCb.current = onBeat;

  const tmp = useMemo(
    () => ({
      m: new Matrix4(),
      q: new Quaternion(),
      e: new Euler(),
      p: new Vector3(),
      s: new Vector3(),
      c: new Color(),
      target: new Color(),
      hit: new Vector3(),
      ndc: new Vector2(),
      plane: new Plane(new Vector3(0, 1, 0), -1.6),
      kernelLight: new Color(PALETTE.kernelLight),
      cream: new Color(PALETTE.cream),
      rail: { scale: 0, origin: "left", flash: 0, track: 1 } as RailState,
      rim: { main: 0, fill: 0 } as RimState,
    }),
    [],
  );

  /** Writes the whole frame for story time `ms` and wind time `wind`. */
  const apply = (ms: number, wind: number, forceColors = false) => {
    const k = kernels.current;
    const h = husks.current;
    if (!k || !h) return;
    const { m, q, e, p, s, c, target } = tmp;
    const sway = animate && wind > 0;
    for (let i = 0; i < FIELD_COUNT; i++) {
      const cob = cobs[i];
      // Wind: a slow wave rolling across the rows plus a small per-cob flutter.
      const wave = sway ? Math.sin(wind * 0.9 - cob.x * 0.32 - cob.z * 0.18) : 0;
      const flutter = sway ? Math.sin(wind * 2.1 + cob.phase) : 0;
      e.set(cob.leanX + wave * 0.035 + flutter * 0.01, cob.yaw, cob.leanZ + wave * 0.06 + flutter * 0.015);
      q.setFromEuler(e);
      p.set(cob.x, cobOffset(riseAt(ms, cob.delay), depth, lift[i]), cob.z);
      s.setScalar(cob.scale);
      m.compose(p, q, s);
      k.setMatrixAt(i, m);
      h.setMatrixAt(i, m);
    }
    k.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;

    // Beat 4: kernels warm row by row. Upload colours only while they change.
    const glowKey = glowTweening(ms, SIDE) ? 1 : ms > 0 && beatAt(ms) >= 4 ? 2 : 0;
    if (forceColors || glowKey === 1 || glowKey !== clock.current.glowKey) {
      for (let i = 0; i < FIELD_COUNT; i++) {
        c.fromArray(baseColors, i * 3);
        target.copy(cobs[i].cream ? tmp.cream : tmp.kernelLight);
        c.lerp(target, GLOW_LERP * glowAt(ms, cobs[i].frontRow));
        k.setColorAt(i, c);
      }
      if (k.instanceColor) k.instanceColor.needsUpdate = true;
      clock.current.glowKey = glowKey;
    }

    ground.current?.color.copy(GROUND).lerp(TEAL, groundMixAt(ms));

    const rail = railAt(ms, tmp.rail);
    const f = fill.current;
    if (f) {
      f.visible = rail.scale > 0.002;
      f.scale.x = Math.max(rail.scale, 0.002);
      f.position.x = rail.origin === "left" ? (-RAIL_LEN / 2) * (1 - rail.scale) : 0;
      const mat = f.material as MeshStandardMaterial;
      mat.color.copy(CORN).lerp(NEON, rail.flash);
      mat.emissive.copy(CORN).lerp(NEON, rail.flash);
      mat.emissiveIntensity = 0.5 + rail.flash * 0.6;
    }
    const t = track.current;
    if (t) {
      t.visible = rail.track > 0.002;
      (t.material as MeshStandardMaterial).opacity = rail.track;
    }

    const rim = rimAt(ms, tmp.rim);
    if (rimMain.current) rimMain.current.intensity = rim.main;
    if (rimFill.current) rimFill.current.intensity = rim.fill;
  };

  const emitBeat = (ms: number) => {
    const b = beatAt(ms);
    if (b !== clock.current.beat) {
      clock.current.beat = b;
      if (b > 0) beatCb.current?.(b);
    }
  };

  // Base kernel colours, stored once: beat 4 overwrites instanceColor and replay restores it.
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
      c.copy(gold).lerp(light, hash01(i * 17 + 9) * 0.35);
      c.toArray(baseColors, i * 3);
      k.setColorAt(i, c);
      c.copy(sage).lerp(sageDark, hash01(i * 19 + 2));
      h.setColorAt(i, c);
    }
    if (k.instanceColor) k.instanceColor.needsUpdate = true;
    if (h.instanceColor) h.instanceColor.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reduced motion: one still frame, and it is the final one (the whole field, glowing).
  useLayoutEffect(() => {
    const st = clock.current;
    if (!animate) {
      lift.fill(0);
      st.ms = TOTAL_MS;
      st.wind = 0;
    } else if (st.ms >= 0 && !start) {
      st.ms = -1;
    }
    apply(st.ms, st.wind, true);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  // The trigger (card half on screen): start from beat 1 even if the scene mounted late.
  useLayoutEffect(() => {
    const st = clock.current;
    if (animate && start && st.ms < 0) {
      st.ms = 0;
      emitBeat(0);
      invalidate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, start]);

  // Replay: back to the starting frame, then run again.
  useLayoutEffect(() => {
    const st = clock.current;
    if (run === st.run) return;
    st.run = run;
    if (!animate) return;
    lift.fill(0);
    st.ms = start ? 0 : -1;
    st.beat = -1;
    apply(st.ms, st.wind, true);
    emitBeat(st.ms);
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  // Pause and visibility changes need a fresh still frame in demand mode.
  useLayoutEffect(() => {
    invalidate();
  }, [paused, active, invalidate]);

  // Pointer over the canvas lifts the nearest cob, once the elotes stand. Motion only.
  useLayoutEffect(() => {
    if (!animate) return;
    const el = gl.domElement;
    const st = clock.current;
    const onMove = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      tmp.ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      st.pointerIn = true;
    };
    const onLeave = () => {
      st.pointerIn = false;
    };
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [animate, gl, tmp]);

  useFrame((_, dt) => {
    if (!animate || !active || paused) return;
    const st = clock.current;
    const d = Math.min(dt, 0.05);
    st.wind += d;
    if (start && st.ms >= 0 && st.ms < TOTAL_MS) st.ms = Math.min(TOTAL_MS, st.ms + d * 1000);

    // Gentle camera drift around the field.
    camera.position.set(Math.sin(st.wind * 0.11) * DRIFT_X, CAM_Y + Math.sin(st.wind * 0.07) * 0.35, CAM_Z);
    camera.lookAt(LOOK);

    if (hoverEnabled(st.ms)) {
      let nearest = -1;
      const g = group.current;
      if (st.pointerIn && g) {
        raycaster.setFromCamera(tmp.ndc, camera);
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
    }
    apply(st.ms, st.wind);
    emitBeat(st.ms);
  });

  return (
    <>
      <hemisphereLight args={["#FFF6E0", "#1C2A2B", 0.9]} />
      {/* Warm key from the front left, like late sun. */}
      <directionalLight position={[-8, 12, 10]} intensity={2.3} color="#FFF3DA" />
      {/* Neon rim from behind (brand rule: glow on night); it strengthens in beat 4. */}
      <directionalLight ref={rimMain} position={[12, 4, -6]} intensity={RIM.main[0]} color={PALETTE.neon} />
      <directionalLight ref={rimFill} position={[-12, 3, -8]} intensity={RIM.fill[0]} color={PALETTE.neon} />
      <group ref={group} rotation={[0, -0.32, 0]}>
        <instancedMesh ref={kernels} args={[kernelGeo, undefined, FIELD_COUNT]} frustumCulled={false}>
          <meshStandardMaterial vertexColors flatShading roughness={0.45} metalness={0} />
        </instancedMesh>
        <instancedMesh ref={husks} args={[huskGeo, undefined, FIELD_COUNT]} frustumCulled={false}>
          <meshStandardMaterial side={DoubleSide} flatShading roughness={0.8} metalness={0} />
        </instancedMesh>
        {/* Opaque ground: it hides the elotes waiting below it. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <circleGeometry args={[70, 48]} />
          <meshStandardMaterial ref={ground} color={GROUND} roughness={1} metalness={0} />
        </mesh>
      </group>
      {/* The Meteora curve, nearly flat; out of the fog so beat 1 is the brightest thing. */}
      <group position={[LOOK.x - 0.6, RAIL_Y, RAIL_Z]} rotation={[0, 0, RAIL_TILT]}>
        <mesh ref={track}>
          <boxGeometry args={[RAIL_LEN, 0.2, 0.2]} />
          <meshStandardMaterial color="#4A5455" roughness={0.9} metalness={0} transparent fog={false} />
        </mesh>
        <mesh ref={fill}>
          <boxGeometry args={[RAIL_LEN, 0.26, 0.26]} />
          <meshStandardMaterial color={PALETTE.cream} emissive={PALETTE.cream} emissiveIntensity={0.35} roughness={0.6} metalness={0} fog={false} />
        </mesh>
      </group>
    </>
  );
}

export default function FieldScene({ animate, active, onReady, onError, start = false, paused = false, run = 0, onBeat }: FieldSceneProps) {
  // The story starts only once the card is half on screen AND the first frame is up (onReady).
  const [ready, setReady] = useState(false);
  const frameloop = animate && active && !paused ? "always" : "demand";
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
        requestAnimationFrame(() => {
          setReady(true);
          onReady?.();
        });
      }}
      style={{ position: "absolute", inset: 0 }}
      aria-hidden
    >
      <fog attach="fog" args={[PALETTE.night, 30, 56]} />
      <Field animate={animate} active={active} start={start && ready} paused={paused} run={run} onBeat={onBeat} />
    </Canvas>
  );
}
