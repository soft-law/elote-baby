import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { BRAND } from "../src/config";
import { META } from "../src/meta";

const root = join(import.meta.dir, "..");
const html = readFileSync(join(root, "index.html"), "utf8");

describe("page metadata", () => {
  test("title follows the brand constant", () => {
    expect(META.title).toBe(`${BRAND} | Mexican loans on Solana`);
    expect(META.ogTitle).toBe(META.title);
    expect(META.twitterTitle).toBe(META.title);
    expect(html).toContain("<title>%TITLE%</title>");
  });

  test("description, og and twitter tags are present", () => {
    expect(META.description.length).toBeGreaterThan(50);
    expect(META.description.length).toBeLessThanOrEqual(160);
    expect(html).toContain('<meta name="description" content="%DESCRIPTION%" />');
    expect(html).toContain('<meta property="og:title" content="%OG_TITLE%" />');
    expect(html).toContain('<meta property="og:description" content="%OG_DESCRIPTION%" />');
    expect(html).toContain('<meta name="twitter:card" content="%TWITTER_CARD%" />');
    expect(html).toContain('<meta name="twitter:title" content="%TWITTER_TITLE%" />');
    expect(META.twitterCard).toBe("summary");
  });

  test("no og:image until the owner provides one", () => {
    expect(html).not.toContain("og:image");
  });

  test("document language defaults to English", () => {
    expect(html).toContain('<html lang="en">');
  });

  test("fonts load with display=swap", () => {
    expect(html).toContain("display=swap");
  });

  test("built index.html carries the brand title when dist exists", () => {
    let built: string;
    try {
      built = readFileSync(join(root, "dist", "index.html"), "utf8");
    } catch {
      return; // build not run yet; `bun run build` then `bun test` covers this
    }
    expect(built).toContain(`<title>${META.title}</title>`);
    expect(built).not.toContain("%TITLE%");
    expect(built).not.toContain('<div id="root"></div>'); // prerendered
    expect(built).toContain("Mexican loans");
    expect(built).toContain(`<meta name="twitter:title" content="${META.title}" />`);
  });
});

// Source hygiene: no em dashes, no tracking, no hard-coded brand outside config.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe("source hygiene", () => {
  const files = [
    ...walk(join(root, "src")),
    ...walk(join(root, "tests")),
    ...walk(join(root, "scripts")),
    join(root, "index.html"),
    join(root, "README.md"),
    join(root, "vite.config.ts"),
  ].filter((f) => /\.(ts|tsx|css|html|md|mjs)$/.test(f));

  test("no em or en dashes", () => {
    const hits = files.filter((f) => /[\u2014\u2013]/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  test("no analytics or tracking", () => {
    const pattern = /googletagmanager|google-analytics|gtag\(|plausible|posthog|segment\.com|mixpanel|hotjar|document\.cookie/i;
    const hits = files.filter((f) => !f.endsWith("meta.test.ts") && pattern.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });

  test("brand name only lives in config.ts", () => {
    const literal = new RegExp(`elote\\.(fun|baby)`);
    const hits = files.filter((f) => !f.endsWith(join("src", "config.ts")) && literal.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});

describe("meeting photos", () => {
  test("both files exist and stay under 300 KB together", () => {
    const sizes = ["rosarito-1.webp", "rosarito-2.webp"].map((f) => statSync(join(root, "public", "photos", f)).size);
    expect(sizes.reduce((a, b) => a + b, 0)).toBeLessThan(300 * 1024);
  });
});
