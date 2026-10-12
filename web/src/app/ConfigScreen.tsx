// Shown instead of the app when the VITE_* configuration is missing or invalid. Visitors see a
// generic "not available" page with a way back to the site; the variable names and the fix are
// shown only in development (`showDetails`).
import { useState } from "react";
import { translations, type Copy, type Lang } from "../translations";
import type { ConfigProblem } from "./config";
import { langFromSearch } from "./lang";
import { Frame, PageBody, PageHead } from "./Shell";

/** Outside the router: reads ?lang directly and switches it with history.replaceState. */
export function ConfigScreen({ problems, showDetails }: { problems: ConfigProblem[]; showDetails: boolean }) {
  const [lang, setLangState] = useState<Lang>(() => langFromSearch(window.location.search));
  const setLang = (next: Lang) => {
    setLangState(next);
    const url = new URL(window.location.href);
    if (next === "en") url.searchParams.delete("lang");
    else url.searchParams.set("lang", next);
    window.history.replaceState(null, "", url);
  };
  return <ConfigView t={translations[lang]} lang={lang} setLang={setLang} problems={problems} showDetails={showDetails} />;
}

/** Pure view, rendered in tests with renderToString. */
export function ConfigView({
  t,
  lang,
  setLang,
  problems,
  showDetails,
}: {
  t: Copy;
  lang: Lang;
  setLang: (l: Lang) => void;
  problems: ConfigProblem[];
  showDetails: boolean;
}) {
  const c = t.app.config;
  const d = t.app.configDev;
  return (
    <Frame t={t} lang={lang} setLang={setLang}>
      <PageBody>
        <div role="alert" className="flex flex-col gap-6">
          <PageHead title={c.title} sub={c.body} />
          <div>
            <a href={lang === "es" ? "/?lang=es" : "/"} className="app-btn app-btn-teal">
              {c.back}
            </a>
          </div>
          {showDetails && (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-[17px] text-ink-soft">{d.body}</p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {problems.map((p) => (
                  <li key={p.key} className="flex flex-wrap items-baseline gap-3 rounded-[14px] bg-chili-50 px-4 py-3">
                    <code className="num text-[15px] text-ink">{p.key}</code>
                    <span className="text-[16px] font-bold text-chili-700">{p.reason === "missing" ? d.missing : d.invalid}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </PageBody>
    </Frame>
  );
}
