// 3D elote mark for the hero. This file is SSR/prerender safe and imports no three.js:
// it reserves the box, shows the static PNG, and only after first paint (idle) loads
// ./CornScene (three + @react-three/fiber) as a separate chunk. Falls back to the PNG
// when WebGL is unavailable, the chunk fails, or the context is lost.
import { Component, type ComponentType, type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import type { CornSceneProps, CornTheme } from "./CornScene";

// P: extra props a scene takes beyond CornSceneProps (the pool field's story clock); the hero has none.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CornMarkProps<P extends object = {}> {
  /** Box edge: px number or any CSS length (e.g. "clamp(220px, 32vw, 420px)"). The box is square. */
  size?: number | string;
  /** "night" adds a faint neon #6AE1E7 rim light (no halo: glow is reserved for the logo, headline word and primary); "light" has none. */
  theme?: CornTheme;
  /** Static image shown before the 3D loads and whenever WebGL is unavailable. */
  fallbackSrc?: string;
  /**
   * Media query the fallback image is fetched under (e.g. "(min-width: 768px)" when the
   * box is display:none below md). Outside it the img gets an inline 1px GIF, so a hidden
   * box downloads nothing. Unset = always fetch (and React preloads it during prerender).
   */
  fallbackMedia?: string;
  /** Accessible name. Default "" = decorative (aria-hidden); pass a localized name if the mark ever stands alone. */
  label?: string;
  className?: string;
  /** Box aspect ratio (CSS). Default "1 / 1". */
  aspect?: string;
  /** Replaces the fallback image (the pool field uses a night card with the mark centred). */
  placeholder?: ReactNode;
  /** Scene chunk loader. Default: the hero mark (./CornScene). Keep the import() literal at the call site. */
  load?: () => Promise<{ default: ComponentType<CornSceneProps & P> }>;
  /** Passed through to the scene as is. */
  sceneProps?: P;
  /** Called with true once the scene is on screen and ready, false if it fails afterwards. */
  onLive?: (live: boolean) => void;
}

const loadCornScene = () => import("./CornScene");

// Transparent 1x1 GIF: the img src outside fallbackMedia, so nothing is fetched there.
const BLANK_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    // Release the probe context now; browsers cap live contexts per page.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

/** The reader asked for less data (Save-Data): keep the static card, skip the three.js chunk. */
function saveData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return c?.saveData === true;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false); // SSR + first client render: false
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function CornMark<P extends object = {}>({
  size = 360,
  theme = "night",
  fallbackSrc = "/corn-mark.png",
  fallbackMedia,
  label = "",
  className,
  aspect = "1 / 1",
  placeholder,
  load: loadScene = loadCornScene as unknown as NonNullable<CornMarkProps<P>["load"]>,
  sceneProps,
  onLive,
}: CornMarkProps<P>) {
  const box = useRef<HTMLDivElement>(null);
  const [Scene, setScene] = useState<ComponentType<CornSceneProps & P> | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);
  const reduced = usePrefersReducedMotion();

  // Load the 3D chunk after first paint, once the box is first on screen (a box hidden
  // with display:none never downloads three.js), when the browser is idle, with WebGL only.
  useEffect(() => {
    const el = box.current;
    if (!el || saveData() || !hasWebGL()) return;
    let cancelled = false;
    let idleId = 0;
    const idle = typeof window.requestIdleCallback === "function";
    const load = () => {
      loadScene()
        .then((m) => {
          if (!cancelled) setScene(() => m.default);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      // Safari has no requestIdleCallback; a short timeout is the fallback.
      idleId = idle ? window.requestIdleCallback(load, { timeout: 2000 }) : window.setTimeout(load, 200);
    });
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
      if (idle) window.cancelIdleCallback(idleId);
      else window.clearTimeout(idleId);
    };
  }, []);

  // Stop rendering while offscreen or while the tab is hidden.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let inView = true;
    const sync = () => setVisible(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const style: CSSProperties = {
    position: "relative",
    width: typeof size === "number" ? `${size}px` : size,
    maxWidth: "100%",
    aspectRatio: aspect,
    contain: "layout paint",
  };
  const showScene = Scene && !failed;
  const live = !!(ready && showScene);
  useEffect(() => {
    onLive?.(live);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const fallback = placeholder ? (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        opacity: ready && showScene ? 0 : 1,
        transition: reduced ? undefined : "opacity 400ms ease",
      }}
    >
      {placeholder}
    </div>
  ) : (
    <img
      src={fallbackMedia ? BLANK_GIF : fallbackSrc}
      alt=""
      decoding="async"
      draggable={false}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        opacity: ready && showScene ? 0 : 1,
        transition: reduced ? undefined : "opacity 400ms ease",
      }}
    />
  );

  return (
    <div
      ref={box}
      className={className}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      data-corn-ready={ready && showScene ? "true" : "false"}
    >
      {fallbackMedia ? (
        <picture>
          <source media={fallbackMedia} srcSet={fallbackSrc} />
          {fallback}
        </picture>
      ) : (
        fallback
      )}
      {showScene && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: ready ? 1 : 0,
            transition: reduced ? undefined : "opacity 400ms ease",
          }}
        >
          <SceneBoundary onError={() => setFailed(true)}>
            <Scene
              {...(sceneProps as P)}
              theme={theme}
              animate={!reduced}
              active={visible}
              onReady={() => setReady(true)}
              onError={() => setFailed(true)}
            />
          </SceneBoundary>
        </div>
      )}
    </div>
  );
}

export default CornMark;
