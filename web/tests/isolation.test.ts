import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rewriteAppUrl } from "../src/app/rewrite";

const root = join(import.meta.dir, "..");

// The landing is prerendered with renderToString (scripts/prerender.tsx). Wallet, RPC and app
// code touches window and must never be imported by it, statically or dynamically.
const LANDING_FILES = ["src/App.tsx", "src/main.tsx", "scripts/prerender.tsx", "src/chrome.tsx"];
const APP_IMPORT = /(?:from\s*|import\s*\(\s*|import\s+)["'](?:\.{1,2}\/)+(?:src\/)?(?:app|wallet|tx|pool)(?:\/|["'])/;

describe("prerender isolation", () => {
  for (const file of LANDING_FILES) {
    test(`${file} imports nothing from app, wallet, tx or pool`, () => {
      const source = readFileSync(join(root, file), "utf8");
      expect(APP_IMPORT.test(source)).toBe(false);
      expect(/@solana\/|@wallet-standard\/|@elote\/pool-client|react-router/.test(source)).toBe(false);
    });
  }

  test("the pattern catches the imports it is meant to catch", () => {
    for (const bad of [
      'import { App } from "./app/App";',
      "import { x } from '../src/pool/math';",
      'const m = import("./wallet/WalletProvider");',
      'import "./tx/write";',
    ]) {
      expect(APP_IMPORT.test(bad)).toBe(true);
    }
    expect(APP_IMPORT.test('import { App } from "./App";')).toBe(false);
    expect(APP_IMPORT.test('import { APP_URL } from "./config";')).toBe(false);
  });

  test("built output: index.html prerendered, app.html left for the client", () => {
    const index = join(root, "dist", "index.html");
    const app = join(root, "dist", "app.html");
    if (!existsSync(index)) return; // build not run yet; `bun run build` then `bun test` covers this
    expect(existsSync(app)).toBe(true);
    const indexHtml = readFileSync(index, "utf8");
    expect(indexHtml).not.toContain('<div id="root"></div>');
    // The landing downloads no script before the load event (scripts/prerender.tsx).
    expect(indexHtml).not.toContain("modulepreload");
    expect(indexHtml).not.toMatch(/<script type="module"[^>]*src=/);
    const appHtml = readFileSync(app, "utf8");
    expect(appHtml).toContain('<div id="root"></div>');
    expect(appHtml).not.toContain("%TITLE%");
  });
});

describe("app route rewrite (dev and preview servers)", () => {
  test("app routes serve app.html and keep the query", () => {
    expect(rewriteAppUrl("/app")).toBe("/app.html");
    expect(rewriteAppUrl("/app/")).toBe("/app.html");
    expect(rewriteAppUrl("/app/pool")).toBe("/app.html");
    expect(rewriteAppUrl("/app/pool/7?lang=es")).toBe("/app.html?lang=es");
    expect(rewriteAppUrl("/app?lang=es")).toBe("/app.html?lang=es");
  });

  test("everything else is untouched", () => {
    for (const url of ["/", "/app.html", "/apple", "/assets/app-123.js", "/src/app/main.tsx", "/logo.png", "/?lang=es"]) {
      expect(rewriteAppUrl(url)).toBe(url);
    }
  });

  test("vercel.json rewrites the same paths", () => {
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    expect(vercel.rewrites).toEqual([
      { source: "/app", destination: "/app.html" },
      { source: "/app/(.*)", destination: "/app.html" },
    ]);
  });
});
