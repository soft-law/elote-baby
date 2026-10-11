// Brand pieces shared by the landing page and the app: logo lockup, language toggle and footer.
// Pure render, no window access, so the prerender of the landing can import them.
import { BRAND, PRIVACY_URL, TERMS_URL } from "./config";
import { translations, type Copy, type Lang } from "./translations";

const LANGS: Lang[] = ["en", "es"];

// Lockup: the corn mark as the icon, the brand as Lexend text. Only ever shown on night (#131313).
// `height` is the icon height; the wordmark scales with it. `alt` names the whole lockup (it is
// usually the only content of a home link), so the visible wordmark is hidden from assistive tech.
export function Logo({ height, alt }: { height: number; alt: string }) {
  const width = Math.round((height * 60) / 96); // public/corn-icon.* is 60x96
  return (
    <span className="inline-flex items-center" style={{ gap: Math.round(height * 0.24) }}>
      <picture className="flex-none">
        <source srcSet="/corn-icon.webp" type="image/webp" />
        <img src="/corn-icon.png" alt={alt} width={width} height={height} className="block" style={{ width, height }} />
      </picture>
      <span
        aria-hidden="true"
        className="font-display font-bold leading-none tracking-[-0.02em] whitespace-nowrap text-white"
        style={{ fontSize: Math.round(height * 0.6) }}
      >
        {BRAND}
      </span>
    </span>
  );
}

export function LangToggle({ t, lang, setLang }: { t: Copy; lang: Lang; setLang: (l: Lang) => void }) {
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

export function SiteFooter({ t }: { t: Copy }) {
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
        </div>
      </div>
    </footer>
  );
}
