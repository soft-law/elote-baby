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

  test("no disputes, dockets or arbitration outside the roadmap chip", () => {
    const pattern = /disput|docket|arbitr|award|laudo|expediente/i;
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang] as unknown as Tree)
        .filter(([, v]) => pattern.test(v))
        .map(([path]) => path);
      expect(hits).toEqual(["where.chips[3]"]);
    }
  });

  test("no APY anywhere", () => {
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang] as unknown as Tree).filter(([, v]) => /\bAPY\b/i.test(v));
      expect(hits).toEqual([]);
    }
  });

  test("the compliance line lives in the footer only", () => {
    expect(translations.en.footer.disclaimer).toBe("Devnet demo with test assets. Not an offer of securities.");
    expect(translations.es.footer.disclaimer).toBe("Demo en devnet con activos de prueba. No es una oferta de valores.");
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang] as unknown as Tree)
        .filter(([, v]) => /not an offer|no es una oferta/i.test(v))
        .map(([path]) => path);
      expect(hits).toEqual(["footer.disclaimer"]);
    }
  });

  test("hero and nav labels carry no devnet wording", () => {
    for (const lang of ["en", "es"] as const) {
      const t = translations[lang];
      const hits = [...strings(t.hero as unknown as Tree), ...strings(t.nav as unknown as Tree)].filter(([, v]) => /devnet/i.test(v));
      expect(hits).toEqual([]);
    }
  });

  test("owner removals stay removed (not-on-chain devnet line, partnership note)", () => {
    for (const lang of ["en", "es"] as const) {
      const hits = strings(translations[lang] as unknown as Tree)
        .filter(([, v]) => /real money|dinero real|government partnership|alianza con ning/i.test(v))
        .map(([path]) => path);
      expect(hits).toEqual([]);
      expect(translations[lang].honesty.off).toHaveLength(2);
      expect("note" in translations[lang].lines).toBe(false);
    }
  });

  test("hero copy is the owner's", () => {
    expect(`${translations.en.hero.titleA} ${translations.en.hero.titleB}`).toBe("Mexican loans on Solana.");
    expect(`${translations.es.hero.titleA} ${translations.es.hero.titleB}`).toBe("Préstamos mexicanos en Solana.");
    expect([translations.en.hero.invest, translations.en.hero.borrow]).toEqual(["Invest", "Borrow"]);
    expect([translations.es.hero.invest, translations.es.hero.borrow]).toEqual(["Invertir", "Pedir crédito"]);
  });

  test("the example card is labeled as an example", () => {
    expect(translations.en.pool.cardLabel).toBe("Example");
    expect(translations.es.pool.cardLabel).toBe("Ejemplo");
    expect(translations.en.pool.caption).toBe("Interest is fixed when the line opens and counts only when repaid.");
  });
});
