// App layout: header (logo, devnet badge, language, wallet), page, footer. Frame also wraps the
// configuration screen, which renders outside the wallet providers, so the wallet control comes
// in through the `actions` slot.
import { useEffect, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { LangToggle, Logo, SiteFooter } from "../chrome";
import type { Copy, Lang } from "../translations";
import { PendingTransactionNotice } from "../tx/PendingTransactionNotice";
import { ConnectButton } from "../wallet/ConnectButton";
import { useLang } from "./lang";
import { ToastProvider } from "./toast/Toast";

export function Frame({
  t,
  lang,
  setLang,
  nav,
  actions,
  children,
}: {
  t: Copy;
  lang: Lang;
  setLang: (l: Lang) => void;
  nav?: ReactNode;
  /** Header controls after the language toggle (the wallet button in the app). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    document.documentElement.lang = t.meta.lang;
    document.title = t.app.meta.title;
  }, [t]);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-[14px] focus:bg-white focus:px-4 focus:py-3 focus:text-ink"
      >
        {t.meta.skip}
      </a>
      <header className="on-night bg-night text-white">
        <div className="mx-auto flex min-h-[68px] max-w-[1200px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 md:min-h-[80px] md:px-8">
          <div className="flex items-center gap-3">
            <a href="/" className="flex min-h-[44px] items-center">
              <span className="md:hidden">
                <Logo height={28} alt={t.app.nav.backToSite} />
              </span>
              <span className="hidden md:block">
                <Logo height={40} alt={t.app.nav.backToSite} />
              </span>
            </a>
            <span className="label rounded-full border-[1.5px] border-neon px-2.5 py-0.5 text-neon">{t.app.header.network}</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <LangToggle t={t} lang={lang} setLang={setLang} />
            {actions}
          </div>
        </div>
        {nav}
      </header>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter t={t} />
    </div>
  );
}

function AppNav({ t, to }: { t: Copy; to: ReturnType<typeof useLang>["to"] }) {
  const links = [
    { path: "/", label: t.app.nav.home, end: true },
    { path: "/pool", label: t.app.nav.pool, end: false },
    { path: "/invest", label: t.app.nav.invest, end: false },
    { path: "/borrow", label: t.app.nav.borrow, end: false },
  ];
  return (
    <nav aria-label={t.app.nav.label} className="border-t border-night-line/60">
      <ul className="m-0 mx-auto flex max-w-[1200px] list-none gap-1 overflow-x-auto px-2 py-1 md:px-6">
        {links.map((l) => (
          <li key={l.path}>
            <NavLink
              to={to(l.path)}
              end={l.end}
              className={({ isActive }) =>
                `inline-flex min-h-[44px] items-center whitespace-nowrap rounded-[10px] px-3.5 text-[17px] no-underline transition-colors hover:bg-white/10 ${
                  isActive ? "font-bold text-neon" : "text-[#DDE6E6] hover:text-white"
                }`
              }
            >
              {l.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Layout route: every app page renders inside it. */
export function Shell() {
  const { lang, t, setLang, to } = useLang();
  return (
    <Frame t={t} lang={lang} setLang={setLang} nav={<AppNav t={t} to={to} />} actions={<ConnectButton t={t} />}>
      <ToastProvider t={t}>
        <Outlet />
      </ToastProvider>
      <PendingTransactionNotice t={t} />
    </Frame>
  );
}

/** Title block shared by the app pages. */
export function PageHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 text-[32px] font-bold leading-[1.1] tracking-[-0.02em] md:text-[44px]">{title}</h1>
      <p className="m-0 max-w-[52ch] text-[18px] leading-[1.6] text-ink-soft md:text-[20px]">{sub}</p>
    </div>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-10 md:px-8 md:py-14">{children}</div>;
}
