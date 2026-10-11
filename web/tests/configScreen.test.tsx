import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { ConfigView } from "../src/app/ConfigScreen";
import { BRAND } from "../src/config";
import { translations, type Lang } from "../src/translations";
import type { ConfigProblem } from "../src/app/config";

const problems: ConfigProblem[] = [
  { key: "VITE_POOL_ADDRESS", reason: "missing" },
  { key: "VITE_ASSET_MINT", reason: "invalid" },
];

function render(lang: Lang, showDetails: boolean): string {
  return renderToString(
    <ConfigView t={translations[lang]} lang={lang} setLang={() => {}} problems={problems} showDetails={showDetails} />,
  );
}

describe("configuration screen", () => {
  test("public view (production) is generic: no variable names, no code", () => {
    for (const lang of ["en", "es"] as const) {
      const html = render(lang, false);
      expect(html).not.toContain("VITE_");
      expect(html).not.toContain("<code");
      expect(html).not.toMatch(/mint/i);
      expect(html).not.toContain(translations[lang].app.configDev.body);
      expect(html).toContain(translations[lang].app.config.title);
      expect(html).toContain(translations[lang].app.config.body);
      expect(html).toContain(translations[lang].app.config.back);
    }
  });

  test("public copy is the approved wording", () => {
    const en = translations.en.app.config;
    const es = translations.es.app.config;
    expect(`${en.title}. ${en.body}`).toBe("The app is not available right now. Please try again later.");
    expect(`${es.title}. ${es.body}`).toBe("La app no está disponible por ahora. Inténtalo más tarde.");
    expect(en.back).toBe(`Back to ${BRAND}`);
    expect(es.back).toBe(`Volver a ${BRAND}`);
  });

  test("back link goes to the site and keeps Spanish", () => {
    expect(render("en", false)).toContain('href="/"');
    expect(render("es", false)).toContain('href="/?lang=es"');
  });

  test("development view lists each problem", () => {
    const html = render("en", true);
    expect(html).toContain(translations.en.app.configDev.body);
    expect(html).toContain("<code");
    expect(html).toContain("VITE_POOL_ADDRESS");
    expect(html).toContain("VITE_ASSET_MINT");
    expect(html).toContain(translations.en.app.configDev.missing);
    expect(html).toContain(translations.en.app.configDev.invalid);
  });
});
