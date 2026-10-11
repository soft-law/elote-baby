import { useCallback, useEffect, useState, type ReactNode } from "react";
import { APP_URL, BRAND, PRIVACY_URL, TERMS_URL } from "./config";
import { META } from "./meta";
import { CornMark } from "./CornMark";
import { translations, type Card, type Copy, type Lang } from "./translations";
import {
  CheckDot,
  IconArrowRight,
  IconBriefcase,
  IconCheckCircle,
  IconClose,
  IconDoc,
  IconDownload,
  IconLayers,
  IconMenu,
  IconPhoneCheck,
  IconShop,
  IconUpload,
  MinusDot,
} from "./icons";

const LANGS: Lang[] = ["en", "es"];

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
        <PoolSection t={t} />
        <Audiences t={t} />
        <Flow t={t} />
        <Agreement t={t} />
        <Honesty t={t} />
        <TwoLines t={t} />
        <WhereWeAre t={t} />
      </main>
      <Footer t={t} />
    </div>
  );
}

function Logo({ height, alt }: { height: number; alt: string }) {
  // The logo is only ever shown on night (#131313). 1208x300 source ratio.
  const width = Math.round((height * 1208) / 300);
  return (
    <picture>
      <source srcSet="/logo.webp" type="image/webp" />
      <img src="/logo.png" alt={alt} width={width} height={height} className="block h-auto" style={{ width, maxWidth: "100%" }} />
    </picture>
  );
}

function LangToggle({ t, lang, setLang }: { t: Copy; lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div role="group" aria-label={t.nav.language} className="inline-flex rounded-full border-[1.5px] border-night-line p-[2px]">
      {LANGS.map((l) => {
        const active = l === lang;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={active}
            onClick={() => setLang(l)}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full font-display text-[14px] font-semibold ${
              active ? "bg-white text-night" : "text-[#DDE6E6] hover:bg-white/10"
            }`}
          >
            {l.toUpperCase()}
            <span className="sr-only"> {translations[l].nav.languageName}</span>
          </button>
        );
      })}
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
      <nav aria-label={t.nav.label} className="mx-auto flex min-h-[68px] max-w-[1200px] items-center justify-between gap-3 px-4 md:min-h-[80px] md:px-8">
        <a href="#top" className="flex min-h-[44px] items-center">
          <span className="md:hidden">
            <Logo height={30} alt={t.nav.home} />
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
            <a href="#pool" className="btn btn-neon sm:min-w-[180px]">
              {t.hero.invest}
              <IconArrowRight size={20} />
            </a>
            <a href={APP_URL} className="btn btn-ghost sm:min-w-[180px]">
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
    <section id="pool" aria-labelledby="pool-title" className="mx-auto grid max-w-[1200px] grid-cols-1 gap-10 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
      <div className="flex flex-col gap-5">
        <h2 id="pool-title" className="m-0 text-[30px] font-bold leading-[1.12] tracking-[-0.02em] md:text-[44px]">
          {p.title}
        </h2>
        <p className="m-0 max-w-[34ch] text-[18px] leading-[1.6] text-ink-soft md:text-[21px]">{p.body}</p>
      </div>
      <figure className="m-0 flex flex-col gap-3">
        <div className="rounded-[24px] border-[1.5px] border-line bg-white p-5 shadow-[var(--shadow-soft)] md:p-7">
          <span className="label inline-flex rounded-full bg-mist px-3 py-1 text-ink-soft">{p.cardLabel}</span>
          <h3 className="mt-4 mb-1 text-[26px] font-bold leading-tight md:text-[30px]">{p.line}</h3>
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
        <figcaption className="text-[15px] leading-[1.5] text-ink-soft">{p.caption}</figcaption>
      </figure>
    </section>
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
        icons={[IconUpload, IconLayers, IconDownload]}
        headIcon={IconBriefcase}
        panel="border-[1.5px] border-line bg-white"
        card="bg-mist"
        chip="bg-teal-50"
      />
      <AudienceRow
        id="entrepreneurs"
        title={t.entrepreneurs.title}
        cards={t.entrepreneurs.cards}
        icons={[IconPhoneCheck, IconCheckCircle, IconShop]}
        headIcon={IconShop}
        panel="bg-corn-100"
        card="bg-white"
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
  card,
  chip,
}: {
  id: string;
  title: string;
  cards: Card[];
  icons: IconC[];
  headIcon: IconC;
  panel: string;
  card: string;
  chip: string;
}) {
  return (
    <div id={id} className={`flex flex-col gap-5 rounded-[24px] p-5 md:gap-6 md:p-8 ${panel}`}>
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className={`flex size-12 flex-none items-center justify-center rounded-[18px] md:size-14 ${chip}`}>
          <Head size={28} />
        </span>
        <h2 className="m-0 text-[26px] font-bold leading-[1.15] md:text-[34px]">{title}</h2>
      </div>
      <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-3 md:gap-4">
        {cards.map((c, i) => {
          const Icon = icons[i];
          return (
            <li key={c.title} className={`flex gap-3.5 rounded-[18px] p-4 md:flex-col md:gap-3 md:p-5 ${card}`}>
              <Icon size={28} className="flex-none text-teal-700" />
              <div className="flex flex-col gap-1">
                <h3 className="m-0 text-[19px] font-semibold leading-tight md:text-[21px]">{c.title}</h3>
                <p className="m-0 text-[17px] leading-[1.5] text-ink-soft">{c.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
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
        <p className="m-0 flex items-start gap-3 text-[17px] leading-[1.5] text-ink">
          <MinusDot />
          <span>{t.flow.writeOff}</span>
        </p>
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
  const icons = [IconDoc, IconPhoneCheck, IconLayers];
  return (
    <section aria-labelledby="agreement-title" className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-14 md:gap-10 md:px-8 md:py-20">
      <h2 id="agreement-title" className="m-0 text-[30px] font-bold leading-[1.12] tracking-[-0.02em] md:text-[44px]">
        {t.agreement.title}
      </h2>
      <ol className="m-0 grid list-none grid-cols-1 gap-0 overflow-hidden rounded-[24px] border-[1.5px] border-line bg-white p-0 md:grid-cols-3">
        {t.agreement.steps.map((s, i) => {
          const Icon = icons[i];
          return (
            <li
              key={s.title}
              className={`flex gap-4 p-5 md:flex-col md:p-8 ${i > 0 ? "border-t-[1.5px] border-line md:border-t-0 md:border-l-[1.5px]" : ""}`}
            >
              <span aria-hidden="true" className="flex size-12 flex-none items-center justify-center rounded-[14px] bg-teal-50 text-teal-700 md:size-14 md:rounded-[18px]">
                <Icon size={26} />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="m-0 text-[20px] font-semibold leading-tight md:text-[24px]">
                  <span className="text-teal-700">{i + 1}.</span> {s.title}
                </h3>
                <p className="m-0 text-[17px] leading-[1.55] text-ink-soft">{s.body}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Honesty({ t }: { t: Copy }) {
  const h = t.honesty;
  return (
    <section id="onchain" aria-labelledby="onchain-title" className="border-y border-line bg-mist">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-14 md:gap-10 md:px-8 md:py-20">
        <h2 id="onchain-title" className="m-0 text-[30px] font-bold leading-[1.12] tracking-[-0.02em] md:text-[44px]">
          {h.title}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <div className="overflow-hidden rounded-[24px] border-[1.5px] border-teal-700 bg-white">
            <h3 className="label m-0 bg-teal-50 px-5 py-4 text-teal-700 md:px-8">{h.onLabel}</h3>
            <ul className="m-0 flex list-none flex-col gap-3 px-5 py-5 text-[18px] leading-[1.5] md:px-8 md:py-6 md:text-[19px]">
              {h.on.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckDot />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="overflow-hidden rounded-[24px] border-[1.5px] border-ink bg-white">
            <h3 className="label m-0 bg-corn-100 px-5 py-4 text-ink md:px-8">{h.offLabel}</h3>
            <ul className="m-0 flex list-none flex-col gap-3 px-5 py-5 text-[18px] leading-[1.5] md:px-8 md:py-6 md:text-[19px]">
              {h.off.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <MinusDot />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function TwoLines({ t }: { t: Copy }) {
  const l = t.lines;
  return (
    <section id="lines" aria-labelledby="lines-title" className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-14 md:gap-10 md:px-8 md:py-20">
      <h2 id="lines-title" className="m-0 text-[30px] font-bold leading-[1.12] tracking-[-0.02em] md:text-[44px]">
        {l.title}
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <article className="flex flex-col gap-4 rounded-[24px] bg-teal-50 p-5 md:p-8">
          <h3 className="m-0 text-[24px] font-semibold leading-[1.2] md:text-[30px]">{l.govTitle}</h3>
          <p className="m-0 text-[18px] leading-[1.5] md:text-[19px]">{l.govBody}</p>
          <span className="inline-flex self-start rounded-full border-[1.5px] border-teal-700 bg-white px-3 py-0.5 font-display text-[15px] font-semibold text-teal-700">
            {l.chip}
          </span>
        </article>
        <article className="flex flex-col gap-4 rounded-[24px] bg-corn-100 p-5 md:p-8">
          <h3 className="m-0 text-[24px] font-semibold leading-[1.2] md:text-[30px]">{l.smeTitle}</h3>
          <p className="m-0 text-[18px] leading-[1.5] md:text-[19px]">{l.smeBody}</p>
        </article>
      </div>
    </section>
  );
}

function WhereWeAre({ t }: { t: Copy }) {
  const w = t.where;
  return (
    <section id="where" aria-labelledby="where-title" className="border-t border-line bg-mist">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 py-14 md:px-8 md:py-20">
        <h2 id="where-title" className="m-0 text-[30px] font-bold leading-[1.12] tracking-[-0.02em] md:text-[44px]">
          {w.title}
        </h2>
        <p className="m-0 max-w-[38em] text-[18px] leading-[1.6] text-ink-soft md:text-[21px]">{w.body}</p>
        <div className="flex flex-col gap-3">
          <h3 className="label m-0 text-ink-soft">{w.nextLabel}</h3>
          <ul className="m-0 flex list-none flex-wrap gap-2.5 p-0">
            {w.chips.map((c) => (
              <li key={c} className="inline-flex min-h-[44px] items-center rounded-full border-[1.5px] border-line bg-white px-4 text-[16px] md:px-5 md:text-[17px]">
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Footer({ t }: { t: Copy }) {
  const f = t.footer;
  return (
    <footer className="on-night bg-night text-white">
      <div className="mx-auto flex max-w-[1200px] flex-col flex-wrap justify-between gap-8 px-4 py-10 md:flex-row md:px-8 md:py-12">
        <div className="flex flex-col gap-3">
          <Logo height={40} alt={BRAND} />
          <p className="m-0 text-[16px] leading-[1.6] text-fog">{f.powered}</p>
        </div>
        <div className="flex flex-col items-start gap-1 md:items-end">
          <nav aria-label={f.legal} className="-mx-2.5 flex gap-2">
            <a href={TERMS_URL} className="inline-flex min-h-[44px] items-center px-2.5 text-[16px] font-bold text-neon">
              {f.terms}
            </a>
            <a href={PRIVACY_URL} className="inline-flex min-h-[44px] items-center px-2.5 text-[16px] font-bold text-neon">
              {f.privacy}
            </a>
          </nav>
          <p className="m-0 text-[15px] leading-[1.5] text-fog">{f.disclaimer}</p>
        </div>
      </div>
    </footer>
  );
}
