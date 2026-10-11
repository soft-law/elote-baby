// The app follows the landing's ?lang convention: English by default, ?lang=es for Spanish.
// The query lives in the router's location, so it survives navigation between app pages.
import { useCallback } from "react";
import { useSearchParams, type To } from "react-router";
import { translations, type Copy, type Lang } from "../translations";

export function langFromSearch(search: string): Lang {
  return new URLSearchParams(search).get("lang") === "es" ? "es" : "en";
}

export function useLang(): { lang: Lang; t: Copy; setLang: (lang: Lang) => void; to: (pathname: string) => To } {
  const [params, setParams] = useSearchParams();
  const lang: Lang = params.get("lang") === "es" ? "es" : "en";
  const setLang = useCallback(
    (next: Lang) =>
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev);
          if (next === "en") out.delete("lang");
          else out.set("lang", next);
          return out;
        },
        { replace: true },
      ),
    [setParams],
  );
  const to = useCallback((pathname: string): To => ({ pathname, search: lang === "es" ? "?lang=es" : "" }), [lang]);
  return { lang, t: translations[lang], setLang, to };
}
