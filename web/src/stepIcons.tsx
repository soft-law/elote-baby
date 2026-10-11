// Icons for the "If you invest / If you borrow" steps, drawn in the language of the 3D corn mark
// (CornScene.tsx): flat-shaded kernel facets in the mark's gold, sage husks, umber depth, and a
// teal action stroke. One 48 grid, one 2.5 px action stroke, one light direction (top left).
// Always decorative: each icon sits beside its step title, so it is hidden from assistive tech.
import { useId, type ReactNode } from "react";

// The mark's palette (CornScene.tsx PALETTE) plus the landing teal for actions.
const C = {
  kernel: "#E6C072",
  kernelLight: "#F7DFA2",
  cream: "#FFF1C9",
  core: "#7A5B2C",
  husk: "#8AA585",
  huskDark: "#668A72",
  teal: "#0B6A70",
};

type Ids = { kernel: string; husk: string; paper: string };

function Frame({ size = 40, className, children }: { size?: number; className?: string; children: (ids: Ids) => ReactNode }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ids = { kernel: `k${raw}`, husk: `h${raw}`, paper: `p${raw}` };
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <linearGradient id={ids.kernel} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.kernelLight} />
          <stop offset="1" stopColor={C.kernel} />
        </linearGradient>
        <linearGradient id={ids.husk} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={C.husk} />
          <stop offset="1" stopColor={C.huskDark} />
        </linearGradient>
        <linearGradient id={ids.paper} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor={C.cream} />
        </linearGradient>
      </defs>
      {children(ids)}
    </svg>
  );
}

const ACTION = { stroke: C.teal, strokeWidth: 2.5, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;

// A faceted token: an octagon in kernel gold with a lit facet and a shaded facet, like one
// flat-shaded kernel of the mark seen face on.
function Token({ x, y, r, ids }: { x: number; y: number; r: number; ids: Ids }) {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (Math.PI / 4) * i + Math.PI / 8;
    return [x + r * Math.cos(a), y + r * Math.sin(a)] as const;
  });
  const d = (p: ReadonlyArray<readonly [number, number]>) => `M${p.map(([px, py]) => `${px.toFixed(2)} ${py.toFixed(2)}`).join("L")}Z`;
  return (
    <g>
      <path d={d(pts)} fill={`url(#${ids.kernel})`} />
      <path d={d([[x, y], pts[4], pts[5], pts[6]])} fill={C.cream} opacity="0.75" />
      <path d={d([[x, y], pts[0], pts[1], pts[2]])} fill={C.core} opacity="0.22" />
      <path d={d(pts)} stroke={C.core} strokeOpacity="0.45" strokeWidth="1.2" />
    </g>
  );
}

// One kernel of the cob: a rounded lozenge, lit on top.
function Kernel({ x, y, w = 9, h = 7, ids }: { x: number; y: number; w?: number; h?: number; ids: Ids }) {
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h / 2.4} fill={`url(#${ids.kernel})`} stroke={C.core} strokeOpacity="0.4" strokeWidth="1" />
      <path d={`M${x - w / 2 + 2} ${y - h / 2 + 1.8}H${x + w / 2 - 2.5}`} stroke={C.cream} strokeWidth="1.4" strokeLinecap="round" />
    </g>
  );
}

// The pool: a sage bowl, shaded on the far side.
function Bowl({ ids }: { ids: Ids }) {
  return (
    <g>
      <path d="M8 31h32a16 11 0 0 1-32 0z" fill={`url(#${ids.husk})`} />
      <path d="M24 31h16a16 11 0 0 1-16 11z" fill={C.huskDark} opacity="0.55" />
      <ellipse cx="24" cy="31" rx="16" ry="3" fill={C.huskDark} />
    </g>
  );
}

type IconProps = { size?: number; className?: string };

// If you invest 1: deposit and hold a share token.
export const StepDeposit = (p: IconProps) => (
  <Frame {...p}>
    {(ids) => (
      <>
        <Bowl ids={ids} />
        <Token x={24} y={12} r={8} ids={ids} />
        <path d="M24 22.5v5.5M21 25.5l3 3 3-3" {...ACTION} />
      </>
    )}
  </Frame>
);

// If you invest 2: the share is worth more after a repayment with interest.
export const StepGrow = (p: IconProps) => (
  <Frame {...p}>
    {(ids) => (
      <>
        <Kernel x={11} y={39} ids={ids} />
        <Kernel x={24} y={39} ids={ids} />
        <Kernel x={24} y={31} ids={ids} />
        <Kernel x={37} y={39} ids={ids} />
        <Kernel x={37} y={31} ids={ids} />
        <Kernel x={37} y={23} ids={ids} />
        <path d="M8 26c6-1 12-5 17-11 2.5-3 5-5 9-7" {...ACTION} />
        <path d="M29 7.5l5.5.5-1.5 5.3" {...ACTION} />
      </>
    )}
  </Frame>
);

// If you invest 3: redeem shares when the pool has enough on hand.
export const StepRedeem = (p: IconProps) => (
  <Frame {...p}>
    {(ids) => (
      <>
        <Bowl ids={ids} />
        <Token x={24} y={12} r={8} ids={ids} />
        <path d="M24 29v-6M21 26l3-3 3 3" {...ACTION} />
      </>
    )}
  </Frame>
);

// If you borrow 1: sign the line (both parties sign).
export const StepSign = (p: IconProps) => (
  <Frame {...p}>
    {(ids) => (
      <>
        <path d="M9 6h20l8 8v28H9z" fill={`url(#${ids.paper})`} stroke={C.core} strokeOpacity="0.5" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M29 6v8h8" fill={C.kernelLight} stroke={C.core} strokeOpacity="0.5" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M14 17h11M14 22h15" stroke={C.core} strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M13.5 34c2.5-4 4-4 4.5-1.5s1.5 2.5 3.5-.5 3-2 3.5 0 2 1.5 4-1" {...ACTION} />
        {/* the pen is a husk leaf */}
        <path d="M44 17c-3 6-7 11-12 15l-2.5-2.5c4-5 9-9 14.5-12.5z" fill={`url(#${ids.husk})`} />
        <path d="M29.5 29.5l-1.5 4 4-1.5" fill={C.huskDark} />
      </>
    )}
  </Frame>
);

// If you borrow 2: draw the loan to your wallet.
export const StepDraw = (p: IconProps) => (
  <Frame {...p}>
    {(ids) => (
      <>
        <rect x="6" y="20" width="36" height="22" rx="5" fill={`url(#${ids.husk})`} />
        <path d="M6 25.5a5 5 0 0 1 5-5.5h26l-3-5H12a6 6 0 0 0-6 6z" fill={C.huskDark} />
        <rect x="29" y="27" width="13" height="9" rx="3" fill={C.huskDark} />
        <circle cx="34" cy="31.5" r="1.8" fill={C.cream} />
        <Token x={19} y={9.5} r={6.5} ids={ids} />
        <path d="M19 18.5v6.5M16 22l3 3 3-3" {...ACTION} stroke={C.cream} />
      </>
    )}
  </Frame>
);

// If you borrow 3: repay, or let anyone pay for you.
export const StepRepay = (p: IconProps) => (
  <Frame {...p}>
    {(ids) => (
      <>
        <Token x={24} y={24} r={9} ids={ids} />
        <path d="M38 17a15.5 15.5 0 0 0-26.5-2.5" {...ACTION} />
        <path d="M11 9.5l.5 5.5 5.3-1.4" {...ACTION} />
        <path d="M10 31a15.5 15.5 0 0 0 26.5 2.5" {...ACTION} />
        <path d="M37 38.5l-.5-5.5-5.3 1.4" {...ACTION} />
      </>
    )}
  </Frame>
);

// Row heads. Investors: a small cob, the mark itself. Borrowers: a shop under a husk awning.
export const HeadInvest = (p: IconProps) => (
  <Frame {...p}>
    {(ids) => (
      <>
        <path d="M24 4c6 0 9 7 9 17s-3 17-9 17-9-7-9-17 3-17 9-17z" fill={`url(#${ids.kernel})`} />
        <path d="M24 4c-6 0-9 7-9 17s3 17 9 17z" fill={C.cream} opacity="0.55" />
        {[11, 17, 23, 29].map((y) => (
          <path key={y} d={`M16.5 ${y}c5 1.4 10 1.4 15 0`} stroke={C.core} strokeOpacity="0.35" strokeWidth="1.1" strokeLinecap="round" />
        ))}
        <path d="M24 21v-17" stroke={C.core} strokeOpacity="0.3" strokeWidth="1.1" />
        <path d="M12 18c4 4 9 12 10 26-6-3-12-11-10-26z" fill={`url(#${ids.husk})`} />
        <path d="M37 22c-1 9-5 17-12 22 1-9 6-17 12-22z" fill={C.huskDark} />
      </>
    )}
  </Frame>
);

export const HeadBorrow = (p: IconProps) => (
  <Frame {...p}>
    {(ids) => (
      <>
        <rect x="9" y="20" width="30" height="22" rx="2" fill={`url(#${ids.paper})`} stroke={C.core} strokeOpacity="0.45" strokeWidth="1.4" />
        <rect x="20" y="29" width="8" height="13" rx="1.5" fill={`url(#${ids.kernel})`} />
        <path d="M6 20l4-12h28l4 12z" fill={`url(#${ids.husk})`} />
        <path d="M16 8l-2 12M24 8v12M32 8l2 12" stroke={C.cream} strokeOpacity="0.8" strokeWidth="1.4" />
        <path d="M6 20a4.5 4.5 0 0 0 9 0 4.5 4.5 0 0 0 9 0 4.5 4.5 0 0 0 9 0 4.5 4.5 0 0 0 9 0" fill={C.huskDark} />
      </>
    )}
  </Frame>
);
