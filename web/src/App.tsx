import { useCallback, useEffect, useState, type ReactNode } from "react";
import { APP_URL } from "./config";
import { LangToggle, Logo, SiteFooter } from "./chrome";
import { META } from "./meta";
import { CornMark } from "./CornMark";
import { translations, type Card, type Copy, type Lang } from "./translations";
import { IconArrowRight, IconClose, IconMenu } from "./icons";
import { HeadBorrow, HeadInvest, StepDeposit, StepDraw, StepGrow, StepRedeem, StepRepay, StepSign } from "./stepIcons";
import { AgreementDemo } from "./AgreementDemo";

function queryLang(): Lang | null {
  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  return fromQuery === "es" || fromQuery === "en" ? fromQuery : null;
}

export function App() {
  // English is the prerendered default; ?lang=es switches after hydration.
  const [lang, setLang] = useState<Lang>("en");
  const t = translations[lang];

  useEffect(() => {
    const fromQuery = queryLang();
    if (fromQuery) setLang(fromQuery);
  }, []);

  useEffect(() => {
    document.documentElement.lang = t.meta.lang;
    document.title = META.title;
    const url = new URL(window.location.href);
    if (lang === "en") url.searchParams.delete("lang");
    else url.searchParams.set("lang", lang);
    window.history.replaceState(null, "", url);
  }, [lang, t.meta.lang]);

  return (
    <div className="min-h-[100dvh] flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-[14px] focus:bg-white focus:px-4 focus:py-3 focus:text-ink"
      >
        {t.meta.skip}
      </a>
      <div className="on-night bg-night text-white">
        <Header t={t} lang={lang} setLang={setLang} />
        <Hero t={t} />
      </div>
      <main id="main" className="flex-1">
        <Agreement t={t} />
        <PoolSection t={t} />
        <Audiences t={t} />
        <Flow t={t} />
        <TwoLines t={t} />
      </main>
      <SiteFooter t={t} />
    </div>
  );
}

function Header({ t, lang, setLang }: { t: Copy; lang: Lang; setLang: (l: Lang) => void }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const links = [
    { href: "#pool", label: t.nav.pool },
    { href: "#entrepreneurs", label: t.nav.entrepreneurs },
    { href: "#flow", label: t.nav.flow },
  ];

  return (
    <header>
      {/* Full-bleed bar: the lockup sits on the page gutter, not inside the 1200 px content column. */}
      <nav aria-label={t.nav.label} className="flex min-h-[68px] items-center justify-between gap-3 px-4 md:min-h-[80px] md:px-8">
        <a href="#top" className="flex min-h-[44px] items-center">
          <span className="md:hidden">
            <Logo height={34} alt={t.nav.home} />
          </span>
          <span className="hidden md:block">
            <Logo height={44} alt={t.nav.home} />
          </span>
        </a>
        <ul className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="inline-flex min-h-[44px] items-center rounded-[10px] px-3.5 text-[17px] text-[#DDE6E6] no-underline transition-colors hover:bg-white/10 hover:text-white"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2 md:gap-3">
          <LangToggle t={t} lang={lang} setLang={setLang} />
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-[12px] border-[1.5px] border-night-line px-3 font-display text-[14px] font-semibold text-white lg:hidden"
          >
            {open ? <IconClose size={20} /> : <IconMenu size={20} />}
            {open ? t.nav.close : t.nav.menu}
          </button>
        </div>
      </nav>
      <div id="mobile-menu" hidden={!open} className="border-t border-night-line/60 px-4 pb-6 pt-2 lg:hidden">
        <ul className="flex flex-col">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={close} className="flex min-h-[48px] items-center text-[18px] text-white no-underline">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

// App links keep the chosen language (the app reads the same ?lang convention).
function appHref(path: string, lang: string): string {
  return `${APP_URL}${path}${lang === "es" ? "?lang=es" : ""}`;
}

function Hero({ t }: { t: Copy }) {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="mx-auto max-w-[1200px] px-4 pb-16 pt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10 md:px-8 md:pb-20 md:pt-14"
    >
      <div className="min-w-0">
        <h1
          id="hero-title"
          className="m-0 font-display font-bold tracking-[-0.04em] text-white"
          style={{ fontSize: "clamp(44px, 6.6vw, 104px)", lineHeight: 1.02 }}
        >
          <span className="block">{t.hero.titleA}</span>
          <span className="block text-neon [text-shadow:0_0_30px_rgb(106_225_231/0.45)]">{t.hero.titleB}</span>
        </h1>
        <div className="mt-6 flex flex-col gap-8 md:mt-8 md:gap-10">
          <p className="m-0 max-w-[36ch] text-[20px] leading-[1.5] text-fog md:text-[24px]">{t.hero.sub}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <a href={appHref("/invest", t.meta.lang)} className="btn btn-neon sm:min-w-[180px]">
              {t.hero.invest}
              <IconArrowRight size={20} />
            </a>
            <a href={appHref("/borrow", t.meta.lang)} className="btn btn-ghost sm:min-w-[180px]">
              {t.hero.borrow}
            </a>
          </div>
        </div>
      </div>
      {/* Decorative 3D mark, desktop only: while hidden it never downloads three.js. */}
      <CornMark
        size="clamp(220px, 26vw, 360px)"
        theme="night"
        label=""
        fallbackMedia="(min-width: 1024px)"
        className="hidden lg:block"
      />
    </section>
  );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      role="img"
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-line"
    >
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US");

function PoolSection({ t }: { t: Copy }) {
  const p = t.pool;
  const principal = 25000;
  const drawn = 25000;
  const due = 28000; // principal plus 12% fixed interest
  const repaid = 6200;
  return (
    <section id="pool" aria-labelledby="pool-title" className="mx-auto grid max-w-[1200px] grid-cols-1 gap-6 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start lg:gap-x-16 lg:gap-y-10">
      <h2 id="pool-title" className="m-0 max-w-[26ch] text-[30px] font-bold leading-[1.12] tracking-[-0.02em] md:text-[40px] lg:col-span-2 lg:max-w-none">
        {p.title}
      </h2>
      <div className="flex flex-col gap-6 md:gap-8">
        <p className="m-0 max-w-[34ch] text-[18px] leading-[1.6] text-ink-soft md:text-[21px]">{p.body}</p>
        <PoolField label={p.fieldLabel} />
      </div>
      <div>
        <div className="rounded-[24px] border-[1.5px] border-line bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
          <h3 className="m-0 mb-1 text-[26px] font-bold leading-tight md:text-[30px]">{p.line}</h3>
          <dl className="m-0 mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field term={p.entrepreneur} value={p.entrepreneurValue} wide />
            <Field term={p.principal} value={fmt(principal)} mono />
            <Field term={p.interest} value={p.interestValue} />
            <Field term={p.term} value={p.termValue} />
            <Field term={p.status} value={p.statusValue} tone="text-teal-700" />
          </dl>
          <div className="mt-6 flex flex-col gap-4 border-t border-line pt-5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className="text-ink-soft">{p.drawn}</span>
                <span className="num text-[15px] text-ink">
                  {fmt(drawn)} / {fmt(principal)}
                </span>
              </div>
              <Bar value={drawn} max={principal} color="var(--color-ink-soft)" label={`${p.drawn} ${fmt(drawn)} / ${fmt(principal)}`} />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-[15px]">
                <span className="text-ink-soft">{p.repaid}</span>
                <span className="num text-[15px] text-ink">
                  {fmt(repaid)} / {fmt(due)}
                </span>
              </div>
              <Bar value={repaid} max={due} color="var(--color-teal-700)" label={`${p.repaid} ${fmt(repaid)} / ${fmt(due)}`} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// One hundred elotes, one per credit line. three.js loads only in the browser, after load,
// once the box is on screen; the prerender and no-WebGL browsers keep the night card.
const loadFieldScene = () => import("./FieldScene");

function PoolField({ label }: { label: string }) {
  return (
    <CornMark
      size="100%"
      aspect="4 / 3"
      theme="night"
      label={label}
      load={loadFieldScene}
      className="overflow-hidden rounded-[24px] bg-night"
      placeholder={
        <div className="flex h-full w-full items-center justify-center">
          <picture>
            <source srcSet="/corn-icon.webp" type="image/webp" />
            <img src="/corn-icon.png" alt="" width={40} height={64} decoding="async" draggable={false} className="block h-16 w-10 opacity-80" />
          </picture>
        </div>
      }
    />
  );
}

function Field({ term, value, mono, wide, tone }: { term: string; value: string; mono?: boolean; wide?: boolean; tone?: string }) {
  return (
    <div className={wide ? "col-span-2 sm:col-span-3" : undefined}>
      <dt className="text-[15px] leading-[1.4] text-ink-soft">{term}</dt>
      <dd className={`m-0 text-[18px] font-bold leading-[1.4] ${mono ? "num" : ""} ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

function Audiences({ t }: { t: Copy }) {
  return (
    <section aria-label={`${t.investors.title}, ${t.entrepreneurs.title}`} className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 pb-14 md:gap-6 md:px-8 md:pb-20">
      <AudienceRow
        id="investors"
        title={t.investors.title}
        cards={t.investors.cards}
        icons={[StepDeposit, StepGrow, StepRedeem]}
        headIcon={HeadInvest}
        panel="border-[1.5px] border-line bg-white"
        rule="border-line"
        chip="bg-teal-50"
      />
      <AudienceRow
        id="entrepreneurs"
        title={t.entrepreneurs.title}
        cards={t.entrepreneurs.cards}
        icons={[StepSign, StepDraw, StepRepay]}
        headIcon={HeadBorrow}
        panel="bg-corn-100"
        rule="border-corn-300"
        chip="bg-white"
      />
    </section>
  );
}

type IconC = (p: { size?: number; className?: string }) => ReactNode;

function AudienceRow({
  id,
  title,
  cards,
  icons,
  headIcon: Head,
  panel,
  rule,
  chip,
}: {
  id: string;
  title: string;
  cards: Card[];
  icons: IconC[];
  headIcon: IconC;
  panel: string;
  rule: string;
  chip: string;
}) {
  return (
    <div id={id} className={`flex flex-col gap-5 rounded-[24px] p-5 md:gap-6 md:p-8 ${panel}`}>
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className={`flex size-12 flex-none items-center justify-center rounded-[18px] md:size-14 ${chip}`}>
          <Head size={36} />
        </span>
        <h2 className="m-0 text-[26px] font-bold leading-[1.15] md:text-[34px]">{title}</h2>
      </div>
      <ol className={`steps m-0 grid list-none grid-cols-1 p-0 md:grid-cols-3 ${rule}`}>
        {cards.map((c, i) => {
          const Icon = icons[i];
          return (
            <li key={c.title} className="flex gap-3.5 md:flex-col md:gap-3">
              <Icon size={48} className="flex-none" />
              <div className="flex flex-col gap-1">
                <h3 className="m-0 text-[19px] font-semibold leading-tight md:text-[21px]">{c.title}</h3>
                <p className="m-0 text-[17px] leading-[1.5] text-ink-soft">{c.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Flow({ t }: { t: Copy }) {
  const n = t.flow.nodes.length;
  return (
    <section id="flow" aria-labelledby="flow-title" className="border-y border-line bg-mist">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-14 md:gap-10 md:px-8 md:py-20">
        <h2 id="flow-title" className="m-0 max-w-[20ch] text-[30px] font-bold leading-[1.12] tracking-[-0.02em] md:text-[44px]">
          {t.flow.title}
        </h2>
        <ol className="m-0 grid list-none grid-cols-1 gap-2 p-0 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch lg:gap-2">
          {t.flow.nodes.map((node, i) => (
            <FlowNode key={i} index={i} name={node} tag={t.flow.tags[i]} last={i === n - 1} />
          ))}
        </ol>
      </div>
    </section>
  );
}

const NODE_TONE = [
  "border-line bg-white",
  "border-teal-700 bg-teal-50",
  "border-line bg-white",
  "border-line bg-white",
  "border-line bg-white",
];

function FlowNode({ index, name, tag, last }: { index: number; name: string; tag: string; last: boolean }) {
  return (
    <>
      <li className={`flex flex-col justify-center gap-1 rounded-[18px] border-[1.5px] px-5 py-4 lg:px-4 lg:py-5 ${NODE_TONE[index]}`}>
        <span className="font-display text-[19px] font-semibold leading-tight md:text-[20px]">{name}</span>
        <span className="font-mono text-[14px] leading-[1.4] text-teal-800">{tag}</span>
      </li>
      {!last && (
        <li aria-hidden="true" className="flex items-center justify-center text-teal-700">
          <IconArrowRight size={24} className="rotate-90 lg:rotate-0" />
        </li>
      )}
    </>
  );
}

function Agreement({ t }: { t: Copy }) {
  const a = t.agreement;
  return (
    <section id="agreement" aria-labelledby="agreement-title" className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-14 md:gap-10 md:px-8 md:py-20">
      <div className="flex max-w-[44rem] flex-col gap-4">
        <h2 id="agreement-title" className="m-0 text-[30px] font-bold leading-[1.12] tracking-[-0.02em] md:text-[44px]">
          {a.title}
        </h2>
        <p className="m-0 text-[18px] leading-[1.6] text-ink-soft md:text-[21px]">{a.body}</p>
      </div>
      <AgreementDemo d={a.demo} />
    </section>
  );
}

// Intrinsic sizes of the processed files in public/photos.
const PHOTOS = [
  { src: "/photos/rosarito-1.webp", w: 1200, h: 1600 },
  { src: "/photos/rosarito-2.webp", w: 1280, h: 960 },
];

function TwoLines({ t }: { t: Copy }) {
  const l = t.lines;
  const m = t.meeting;
  return (
    <section id="lines" aria-labelledby="lines-title" className="mx-auto max-w-[1200px] px-4 pb-14 md:px-8 md:pb-20">
      <div className="flex flex-col gap-3 rounded-[24px] bg-teal-50 p-6 md:gap-4 md:p-10">
        <h2 id="lines-title" className="m-0 text-[28px] font-bold leading-[1.15] tracking-[-0.02em] md:text-[40px]">
          {l.title}
        </h2>
        <p className="m-0 max-w-[40em] text-[18px] leading-[1.55] text-ink md:text-[21px]">{l.body}</p>
        <figure className="m-0 mt-3 flex flex-col gap-3 md:mt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[9fr_16fr] md:gap-4">
            {PHOTOS.map((p, i) => (
              <img
                key={p.src}
                src={p.src}
                alt={i === 0 ? m.photoA : m.photoB}
                width={p.w}
                height={p.h}
                loading="lazy"
                decoding="async"
                className="block h-auto w-full rounded-[18px] bg-white"
              />
            ))}
          </div>
          <figcaption className="text-[16px] leading-[1.5] text-ink-soft">{m.caption}</figcaption>
        </figure>
      </div>
    </section>
  );
}

