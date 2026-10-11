// Scripted ~30 s walkthrough of one credit line under its agreement: draft, sign, hash on chain,
// draw, repay. Sample data only (no real names, signatures, hashes or explorer links).
// One CSS keyframe fills the active progress segment; its animationend advances the step.
// It starts after hydration, pauses offscreen and in hidden tabs, and never autoplays under
// prefers-reduced-motion (the global reduce block also stops the keyframe). The step list is
// the transcript: every step is a button, and choosing one pauses the walkthrough.
import { useEffect, useRef, useState } from "react";
import type { DemoCopy } from "./translations";

const STEP_MS = 6000;
const fmt = (n: number) => n.toLocaleString("en-US");

export function AgreementDemo({ d }: { d: DemoCopy }) {
  const box = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false); // false in the prerender: nothing moves before hydration
  const [onScreen, setOnScreen] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPlaying(!reduce.matches);
    setReduced(reduce.matches);
    const el = box.current;
    let inView = false;
    const sync = () => setOnScreen(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      sync();
    });
    if (el) io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const running = playing && onScreen;
  const n = d.steps.length;
  const choose = (i: number) => {
    setPlaying(false);
    setStep(i);
  };
  const status = step < 3 ? d.statusOpen : step === 3 ? d.statusActive : d.statusRepaid;

  return (
    <div ref={box} role="group" aria-label={d.label} className="overflow-hidden rounded-[24px] border-[1.5px] border-line bg-white shadow-[var(--shadow-soft)]">
      <div className="flex min-h-[70px] items-center justify-between gap-3 border-b-[1.5px] border-line px-5 py-3 md:px-7">
        <span className="label rounded-full bg-corn-100 px-3 py-1 text-ink">{d.sample}</span>
        {/* Under reduced motion the walkthrough is static: the steps are chosen by hand. */}
        {!reduced && (
          <button
            type="button"
            onClick={() => setPlaying((v) => !v)}
            aria-label={playing ? d.pause : d.play}
            className="inline-flex size-11 items-center justify-center rounded-full border-[1.5px] border-teal-700 text-teal-700 transition-colors hover:bg-teal-50"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
              {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
            </svg>
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <ol className="m-0 flex list-none flex-col gap-1 p-3 md:p-4">
          {d.steps.map((s, i) => {
            const active = i === step;
            return (
              <li key={s.title}>
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  onClick={() => choose(i)}
                  className={`flex min-h-[48px] w-full flex-col gap-1 rounded-[14px] px-3.5 py-2.5 text-left transition-colors ${active ? "bg-teal-50" : "hover:bg-mist"}`}
                >
                  <span className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={`num flex size-7 flex-none items-center justify-center rounded-full text-[13px] ${
                        i < step ? "bg-teal-700 text-white" : active ? "border-[1.5px] border-teal-700 text-teal-700" : "border-[1.5px] border-line text-ink-soft"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className={`font-display text-[18px] font-semibold leading-tight ${active ? "text-ink" : "text-ink-soft"}`}>{s.title}</span>
                  </span>
                  <span className={`pl-10 text-[16px] leading-[1.45] text-ink-soft ${active ? "block" : "hidden lg:block"}`}>{s.body}</span>
                  <span aria-hidden="true" className="ml-10 mt-1 block h-[3px] overflow-hidden rounded-full bg-line" style={{ visibility: active || i < step ? "visible" : "hidden" }}>
                    {active ? (
                      <span
                        key={`${step}`}
                        className="demo-fill block h-full rounded-full bg-teal-700"
                        style={{ animationDuration: `${STEP_MS}ms`, animationPlayState: running ? "running" : "paused" }}
                        onAnimationEnd={() => setStep((v) => (v + 1) % n)}
                      />
                    ) : (
                      <span className="block h-full rounded-full bg-teal-700" />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-4 border-t-[1.5px] border-line bg-mist p-5 md:p-7 lg:border-t-0 lg:border-l-[1.5px]">
          <div className="rounded-[18px] border-[1.5px] border-line bg-white p-4 md:p-5">
            <p className="m-0 font-display text-[18px] font-semibold leading-tight">{d.doc}</p>
            <dl className="m-0 mt-3 grid grid-cols-2 gap-x-5 gap-y-2.5 text-[15px] leading-[1.4]">
              <Row term={d.borrower} value={d.borrowerValue} />
              <Row term={d.lender} value={d.lenderValue} />
              <Row term={d.principal} value={d.principalValue} wide />
              <Row term={d.interest} value={d.interestValue} />
              <Row term={d.term} value={d.termValue} />
            </dl>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px] leading-[1.4]">
            <Fact on={step >= 1} term={d.borrower} value={d.signed} check />
            <Fact on={step >= 1} term={d.lender} value={d.signed} check />
            <Fact on={step >= 2} term={d.hash} value={d.hashNote} hash />
            <Fact on={step >= 2} term={d.lineStatus} value={status} />
            <Fact on={step >= 3} term={d.drawn} value={`${fmt(25000)} / ${fmt(25000)} ${d.unit}`} />
            <Fact on={step >= 4} term={d.repaid} value={`${fmt(28000)} / ${fmt(28000)} ${d.unit}`} />
          </ul>
        </div>
      </div>
    </div>
  );
}

function Row({ term, value, wide }: { term: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-ink-soft">{term}</dt>
      <dd className="m-0 font-bold">{value}</dd>
    </div>
  );
}

// A record the line gains at a step. Before that step it is a dimmed placeholder, so the box
// never changes size.
function Fact({ on, term, value, check, hash }: { on: boolean; term: string; value: string; check?: boolean; hash?: boolean }) {
  return (
    <li aria-hidden={on ? undefined : true} className={`flex items-start gap-3 rounded-[14px] bg-white px-3.5 py-2.5 transition-opacity duration-300 ${on ? "opacity-100" : "opacity-30"}`}>
      <span aria-hidden="true" className="mt-0.5 flex size-5 flex-none items-center justify-center rounded-full bg-teal-50 text-teal-700">
        {check ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        ) : hash ? (
          <span className="font-mono text-[11px] font-bold">#</span>
        ) : (
          <span className="block size-1.5 rounded-full bg-teal-700" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-ink-soft">{term}</span>
        <span className="block font-bold text-ink">{value}</span>
      </span>
    </li>
  );
}
