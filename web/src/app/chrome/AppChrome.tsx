// App chrome: the 64 px header row, the tab bar (from md), the bottom bar (below md) and the one-line
// footer. Presentational only: the configuration screen renders the header outside the wallet and
// query providers, so nothing here may call a data hook. The landing keeps chrome.tsx.
import type { ReactNode } from "react";
import { NavLink, type To } from "react-router";
import { BRAND, PRIVACY_URL, TERMS_URL } from "../../config";
import { translations, type Copy, type Lang } from "../../translations";

const LANGS: Lang[] = ["en", "es"];

/** One section of the app: a route link with a live sub-line (empty while unknown). */
export type AppTab = {
  to: To;
  label: string;
  /** Sub-line from live data ("4 lines"), or null while it is not known: then nothing shows. */
  sub: string | null;
  /** Shorter visible sub-line for the bottom bar; the full sub-line stays for screen readers. */
  subShort?: string | null;
};

export function AppLangToggle({ t, lang, setLang }: { t: Copy; lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div role="group" aria-label={t.nav.language} className="app-seg">
      {LANGS.map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={l === lang} onClick={() => setLang(l)}>
          <span aria-hidden="true">{l.toUpperCase()}</span>
          <span className="sr-only">{translations[l].nav.languageName}</span>
        </button>
      ))}
    </div>
  );
}

export function AppHeader({
  t,
  lang,
  setLang,
  actions,
}: {
  t: Copy;
  lang: Lang;
  setLang: (l: Lang) => void;
  actions?: ReactNode;
}) {
  const home = lang === "es" ? "/?lang=es" : "/";
  return (
    <header className="app-hdr">
      <div className="app-wrap flex h-full items-center gap-1 md:gap-3">
        <a href={home} className="app-lockup" aria-label={t.app.nav.backToSite}>
          <span className="app-logo-tile">
            <img src="/corn-mark.png" alt="" width={34} height={34} />
          </span>
          <span aria-hidden="true" className="hidden md:inline">
            {BRAND}
          </span>
        </a>
        <span className="app-badge">{t.app.header.network}</span>
        <span className="grow" />
        <AppLangToggle t={t} lang={lang} setLang={setLang} />
        {actions}
      </div>
    </header>
  );
}

function SubLine({ tab, short }: { tab: AppTab; short: boolean }) {
  if (tab.sub === null) return <small />;
  const visible = short && tab.subShort ? tab.subShort : tab.sub;
  if (visible === tab.sub) return <small>{tab.sub}</small>;
  return (
    <small>
      <span aria-hidden="true">{visible}</span>
      <span className="sr-only">{tab.sub}</span>
    </small>
  );
}

/** Desktop sections: route links with aria-current, under the header from md. */
export function TabBar({ tabs, label }: { tabs: AppTab[]; label: string }) {
  return (
    <nav aria-label={label} className="app-tabs hidden md:block">
      <ul className="app-wrap m-0 flex list-none gap-1 py-0">
        {tabs.map((tab) => (
          <li key={tab.label}>
            <NavLink to={tab.to} className="app-tab">
              {tab.label}
              <SubLine tab={tab} short={false} />
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Mobile sections: fixed at the bottom below md, 56 px plus the safe-area inset. */
export function BottomBar({ tabs, label }: { tabs: AppTab[]; label: string }) {
  return (
    <nav aria-label={label} className="app-bbar">
      {tabs.map((tab) => (
        <NavLink key={tab.label} to={tab.to}>
          {tab.label}
          <SubLine tab={tab} short />
        </NavLink>
      ))}
    </nav>
  );
}

export function AppFooter({ t }: { t: Copy }) {
  const f = t.footer;
  return (
    <footer className="app-footer">
      <div className="app-wrap flex min-h-[var(--footer-height)] items-center gap-4 md:gap-5">
        <span>{f.powered}</span>
        <nav aria-label={f.legal} className="flex items-center gap-4 md:gap-5">
          <a href={TERMS_URL}>{f.terms}</a>
          <a href={PRIVACY_URL}>{f.privacy}</a>
        </nav>
      </div>
    </footer>
  );
}
