import { describe, expect, test } from "bun:test";
import { translations } from "../src/translations";

// Words and marks this page must never use (claims rules). Case-insensitive.
export const BANNED =
  /dividend|stablecoin|pegged|backed|guaranteed|risk-free|zero interest|tokenized|NFT|\bmint\b|automatic|free\b|\u2014/i;

// Spanish equivalents of the same claims, so the ES copy cannot drift past the rules.
const BANNED_ES =
  /dividendo|respaldad|garantizad|sin riesgo|tasa cero|cero inter[eé]s|tokenizad|autom[aá]tic|gratis|gratuit/i;

type Tree = string | readonly Tree[] | { readonly [k: string]: Tree };

function keyPaths(node: Tree, prefix = ""): string[] {
  if (typeof node === "string") return [prefix];
  if (Array.isArray(node)) return node.flatMap((child, i) => keyPaths(child, `${prefix}[${i}]`));
  return Object.entries(node).flatMap(([k, v]) => keyPaths(v as Tree, prefix ? `${prefix}.${k}` : k));
}

function strings(node: Tree, prefix = ""): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  if (Array.isArray(node)) return node.flatMap((child, i) => strings(child, `${prefix}[${i}]`));
  return Object.entries(node).flatMap(([k, v]) => strings(v as Tree, prefix ? `${prefix}.${k}` : k));
}

const en = translations.en as unknown as Tree;
const es = translations.es as unknown as Tree;

describe("translations", () => {
  test("en and es have identical keys", () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });

  test("no value is empty", () => {
    for (const [path, value] of [...strings(en), ...strings(es)]) {
      expect({ path, empty: value.trim() === "" }).toEqual({ path, empty: false });
    }
  });

  for (const lang of ["en", "es"] as const) {
    test(`${lang} has no banned words`, () => {
      const hits = strings(translations[lang] as unknown as Tree).filter(([, v]) => BANNED.test(v));
      expect(hits).toEqual([]);
    });

    test(`${lang} has no exclamation marks`, () => {
      const hits = strings(translations[lang] as unknown as Tree).filter(([, v]) => /[!¡]/.test(v));
      expect(hits).toEqual([]);
    });
  }

  test("es has no Spanish equivalents of banned words", () => {
    const hits = strings(es).filter(([, v]) => BANNED_ES.test(v));
    expect(hits).toEqual([]);
  });

  test("no disputes, dockets or arbitration anywhere", () => {
    const pattern = /disput|docket|arbitr|award|laudo|expediente/i;
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang] as unknown as Tree)
        .filter(([, v]) => pattern.test(v))
        .map(([path]) => path);
      expect(hits).toEqual([]);
    }
  });

  test("no APY anywhere", () => {
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang] as unknown as Tree).filter(([, v]) => /\bAPY\b/i.test(v));
      expect(hits).toEqual([]);
    }
  });

  test("the footer carries only the company name, no disclaimer line", () => {
    for (const lang of ["en", "es"] as const) {
      expect(translations[lang].footer.powered).toBe("Softlaw SA de CV");
      expect("disclaimer" in translations[lang].footer).toBe(false);
      const hits = strings(translations[lang] as unknown as Tree)
        .filter(([, v]) => /not an offer|no es una oferta|Soft\.Law|S\.A\. de C\.V\./i.test(v))
        .map(([path]) => path);
      expect(hits).toEqual([]);
    }
  });

  test("hero and nav labels carry no devnet wording", () => {
    for (const lang of ["en", "es"] as const) {
      const t = translations[lang];
      const hits = [...strings(t.hero as unknown as Tree), ...strings(t.nav as unknown as Tree)].filter(([, v]) => /devnet/i.test(v));
      expect(hits).toEqual([]);
    }
  });

  test("owner removals stay removed", () => {
    const removed =
      /real money|dinero real|government partnership|alianza con ning|written-off loan|pr[eé]stamo perdido|next steps|siguientes pasos|counts only when repaid|solo cuenta cuando/i;
    for (const lang of ["en", "es"] as const) {
      const t = translations[lang];
      const hits = strings(t as unknown as Tree)
        .filter(([, v]) => removed.test(v))
        .map(([path]) => path);
      expect(hits).toEqual([]);
      expect("honesty" in t).toBe(false);
      expect("writeOff" in t.flow).toBe(false);
      expect("cardLabel" in t.pool).toBe(false);
      expect("caption" in t.pool).toBe(false);
      expect("where" in t).toBe(false);
      expect(Object.keys(t.lines).sort()).toEqual(["body", "title"]);
    }
  });

  test("credit lines are described as government-supported, never backed or named", () => {
    expect(translations.en.lines.body).toContain("government support");
    expect(translations.es.lines.body).toContain("apoyo de gobierno");
    for (const lang of ["en", "es"] as const) {
      const { title, body } = translations[lang].lines;
      expect(`${title} ${body}`).not.toMatch(/back|guarant|respald|garantiz|municip|ayuntamiento|gobierno de |government of /i);
    }
  });

  test("the meeting photos carry the owner's caption and claim nothing more", () => {
    expect(translations.en.meeting.caption).toBe(
      "Early conversations with the municipal team in Playas de Rosarito, Baja California, 2026. No agreement has been signed.",
    );
    expect(translations.es.meeting.caption).toBe(
      "Primeras conversaciones con el equipo municipal de Playas de Rosarito, Baja California, 2026. No hay ningún acuerdo firmado.",
    );
    for (const lang of ["en", "es"] as const) {
      const text = Object.values(translations[lang].meeting).join(" ");
      expect(text).not.toMatch(/program|grant|subsid|convenio|beca|endorse|aval|\$|MXN|%/i);
    }
  });

  test("the agreement section uses the auto-executable framing", () => {
    expect(translations.en.agreement.title).toBe("Programmable Loan Contracts");
    expect(translations.es.agreement.title).toBe("Contratos de préstamo programables");
    expect(translations.en.agreement.body).toContain("Auto-executable legal contracts");
    expect(translations.es.agreement.body).toContain("Contratos legales autoejecutables");
    for (const lang of ["en", "es"] as const) {
      expect(translations[lang].agreement.demo.steps).toHaveLength(5);
    }
  });

  test("the pool headline is one short line with both facts", () => {
    for (const lang of ["en", "es"] as const) {
      const title = translations[lang].pool.title;
      expect(title).not.toMatch(/[.;?]/);
      expect(title.length).toBeLessThanOrEqual(60);
      expect(title).toMatch(/100/);
    }
  });

  test("the hero says every line has government support, not some", () => {
    expect(translations.en.hero.sub).toContain(", with government support.");
    expect(translations.es.hero.sub).toContain(", con apoyo de gobierno.");
    expect(translations.en.hero.sub).not.toMatch(/some with/i);
    expect(translations.es.hero.sub).not.toMatch(/algunas con/i);
  });

  test("hero copy is the owner's", () => {
    expect(`${translations.en.hero.titleA} ${translations.en.hero.titleB}`).toBe("Mexican loans on Solana.");
    expect(`${translations.es.hero.titleA} ${translations.es.hero.titleB}`).toBe("Préstamos mexicanos en Solana.");
    expect([translations.en.hero.invest, translations.en.hero.borrow]).toEqual(["Invest", "Borrow"]);
    expect([translations.es.hero.invest, translations.es.hero.borrow]).toEqual(["Invertir", "Pedir crédito"]);
  });

  test("the landing always calls tMXN a test token, in either language", () => {
    const hint = { en: /test tokens?/i, es: /tokens? de prueba/i } as const;
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang] as unknown as Tree)
        .filter(([, v]) => /tMXN/.test(v) && !hint[lang].test(v))
        .map(([path]) => path);
      expect(hits).toEqual([]);
    }
  });

  test("the landing never says mint or Polkadot", () => {
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang] as unknown as Tree)
        .filter(([, v]) => /\bmint|acu[nñ]a|polkadot/i.test(v))
        .map(([path]) => path);
      expect(hits).toEqual([]);
    }
  });

  test("the app subtree exists in both languages", () => {
    for (const lang of ["en", "es"] as const) {
      expect(keyPaths(translations[lang].app as unknown as Tree).length).toBeGreaterThan(20);
    }
  });

  test("app copy names devnet only in the header badge", () => {
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang].app as unknown as Tree, "app")
        .filter(([, v]) => /devnet/i.test(v))
        .map(([path]) => path);
      expect(hits).toEqual(["app.header.network"]);
    }
  });

  test("app copy always calls tMXN a test token", () => {
    const hint = { en: /test tokens?/i, es: /tokens? de prueba/i } as const;
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang].app as unknown as Tree, "app")
        .filter(([, v]) => /tMXN/.test(v) && !hint[lang].test(v))
        .map(([path]) => path);
      expect(hits).toEqual([]);
    }
  });

  test("app copy never says mint, in either language", () => {
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang].app as unknown as Tree, "app")
        .filter(([, v]) => /mint|acu[nñ]a/i.test(v))
        .map(([path]) => path);
      expect(hits).toEqual([]);
    }
  });
});
