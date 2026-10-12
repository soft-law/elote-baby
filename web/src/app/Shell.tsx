// App layout: one 64 px header row (lockup, devnet badge, language, wallet), the section tabs
// (a tab bar from md, a fixed bottom bar below), the page and a one-line footer. Night is the page;
// paper is only for content surfaces. Frame also wraps the configuration screen, which renders
// outside the wallet and query providers, so it takes the wallet control and the tabs as slots
// and calls no data hook itself.
import { useEffect, type ReactNode } from "react";
import { Outlet } from "react-router";
import { formatAmount } from "../pool/format";
import type { Copy, Lang } from "../translations";
import { PendingTransactionNotice } from "../tx/PendingTransactionNotice";
import { ConnectButton } from "../wallet/ConnectButton";
import { useWallet } from "../wallet/useWallet";
import { useBalancesQuery } from "./balances";
import { AppFooter, AppHeader, BottomBar, TabBar, type AppTab } from "./chrome/AppChrome";
import { useLang } from "./lang";
import { useLinesQuery, usePoolQuery } from "./queries";
import { ToastProvider } from "./toast/Toast";

export function Frame({
  t,
  lang,
  setLang,
  nav,
  bottomNav,
  actions,
  children,
}: {
  t: Copy;
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Section tab bar, shown from md. */
  nav?: ReactNode;
  /** Section bottom bar and anything fixed above it, shown below md. */
  bottomNav?: ReactNode;
  /** Header controls after the language switch (the wallet control in the app). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.lang = t.meta.lang;
    document.title = t.app.meta.title;
  }, [t]);
  useEffect(() => {
    document.documentElement.classList.add("app-night");
    return () => document.documentElement.classList.remove("app-night");
  }, []);

  return (
    <div className={`app-shell on-night flex min-h-[100dvh] flex-col ${bottomNav ? "max-md:pb-[calc(var(--bottom-bar-height)+env(safe-area-inset-bottom))]" : ""}`}>
      <a href="#main" className="app-skip">
        {t.meta.skip}
      </a>
      <AppHeader t={t} lang={lang} setLang={setLang} actions={actions} />
      {nav}
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none md:pb-[var(--footer-height)]">
        {children}
      </main>
      <AppFooter t={t} />
      {bottomNav ? <div className="fixed inset-x-0 bottom-0 z-40 md:hidden">{bottomNav}</div> : null}
    </div>
  );
}

function fill(template: string, n: string): string {
  return template.replace("{n}", n);
}

/** The three sections with sub-lines from live reads. Not connected or still loading: no sub-line. */
function useAppTabs(t: Copy, lang: Lang, to: ReturnType<typeof useLang>["to"]): AppTab[] {
  const n = t.app.nav;
  const { status, address } = useWallet();
  const connected = status === "connected" && address !== null;
  const owner = connected ? address : null;
  const pool = usePoolQuery();
  const lineCount = pool.data?.kind === "ok" ? pool.data.pool.lineCount : undefined;
  const balances = useBalancesQuery(owner);
  const lines = useLinesQuery(connected ? lineCount : undefined);
  const count = new Intl.NumberFormat(lang === "es" ? "es-MX" : "en-US");

  const poolSub = lineCount === undefined ? null : fill(lineCount === 1n ? n.lineOne : n.lineMany, count.format(lineCount));

  let investSub: string | null = null;
  let investShort: string | null = null;
  if (owner && balances.data && balances.data.owner === owner) {
    const figure = formatAmount(balances.data.shares, lang, 2);
    investSub = `${figure} ${n.sharesUnit}`;
    // The bottom bar column is narrow: a long sub-line shows the figure, the words stay spoken.
    investShort = investSub.length > 15 ? figure : investSub;
  }

  let borrowSub: string | null = null;
  if (owner && lines.data && lineCount !== undefined) {
    const toRepay = lines.data.filter(
      (r) => r.view.readable && r.view.borrower === owner && (r.view.status === "active" || r.view.status === "inCollection"),
    ).length;
    borrowSub = fill(n.toRepay, count.format(toRepay));
  }

  return [
    { to: to("/pool"), label: n.pool, sub: poolSub },
    { to: to("/invest"), label: n.invest, sub: investSub, subShort: investShort },
    { to: to("/borrow"), label: n.borrow, sub: borrowSub },
  ];
}

export function SectionNav({ placement }: { placement: "top" | "bottom" }) {
  const { t, lang, to } = useLang();
  const tabs = useAppTabs(t, lang, to);
  return placement === "top" ? <TabBar tabs={tabs} label={t.app.nav.label} /> : <BottomBar tabs={tabs} label={t.app.nav.label} />;
}

/** Layout route: every app page renders inside it. */
export function Shell() {
  const { lang, t, setLang } = useLang();
  return (
    <Frame
      t={t}
      lang={lang}
      setLang={setLang}
      nav={<SectionNav placement="top" />}
      bottomNav={<SectionNav placement="bottom" />}
      actions={<ConnectButton t={t} />}
    >
      <ToastProvider t={t}>
        <Outlet />
      </ToastProvider>
      <PendingTransactionNotice t={t} />
    </Frame>
  );
}

/** Title block of a paper page section: an app-scale heading and one line under it. */
export function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="m-0 font-display text-[26px] font-semibold leading-[1.15] tracking-[-0.01em] text-ink md:text-[28px]">{title}</h1>
      <p className="m-0 max-w-[60ch] text-[17px] leading-[1.55] text-ink-soft">{sub}</p>
    </div>
  );
}

/** A page on one paper sheet under the night chrome. */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="app-sheet on-paper mt-4 flex-1 md:mt-6">
      <div className="app-wrap flex flex-col gap-8">{children}</div>
    </div>
  );
}
