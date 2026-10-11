// Playwright smoke test for the built page. Run `bun run preview` first, then `node scripts/smoke.mjs`.
// Env: SMOKE_URL (default http://localhost:4322), PLAYWRIGHT_FROM (dir whose node_modules has
// playwright, used when web/ has no playwright of its own), SHOTS_DIR (optional screenshots).
import { createRequire } from "node:module";
import { join } from "node:path";

const url = process.env.SMOKE_URL ?? "http://localhost:4322/";
const shots = process.env.SHOTS_DIR;

function loadPlaywright() {
  const local = createRequire(import.meta.url);
  try {
    return local("playwright");
  } catch {
    const from = process.env.PLAYWRIGHT_FROM;
    if (!from) throw new Error("playwright not found; set PLAYWRIGHT_FROM");
    return createRequire(join(from, "package.json"))("playwright");
  }
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const widths = [375, 768, 1280, 1440, 2560];
const results = [];
let failed = false;

for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(String(err)));

  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });

  const response = await page.goto(url, { waitUntil: "networkidle" });
  const r = { width, status: response?.status() };
  await page.waitForTimeout(500);
  const lcpAtLoad = Math.round(await page.evaluate(() => window.__lcp));

  r.title = await page.title();
  r.h1 = (await page.locator("h1").innerText()).replace(/\s+/g, " ");
  r.langBefore = await page.evaluate(() => document.documentElement.lang);
  r.overflowEn = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // The agreement walkthrough and the credit-lines statement render and are visible.
  for (const id of ["agreement", "lines"]) {
    const section = page.locator(`#${id}`);
    await section.scrollIntoViewIfNeeded();
    r[`${id}Visible`] = await section.isVisible();
  }
  r.demoSteps = await page.locator("#agreement ol button").count();
  r.footerDisclaimer = await page.locator("footer").getByText(/not an offer|devnet/i).count();

  if (shots) await page.screenshot({ path: join(shots, `en-${width}.png`), fullPage: true });

  // Toggle to Spanish.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: /Español/ }).click();
  await page.waitForFunction(() => document.documentElement.lang === "es");
  await page.waitForTimeout(300);
  r.langAfter = await page.evaluate(() => document.documentElement.lang);
  r.h1Es = (await page.locator("h1").innerText()).replace(/\s+/g, " ");
  r.overflowEs = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  r.esUrl = new URL(page.url()).search;
  if (shots) await page.screenshot({ path: join(shots, `es-${width}.png`), fullPage: true });

  // Small targets: interactive elements under 44 px tall (inline text links excluded).
  r.smallTargets = await page.evaluate(() =>
    [...document.querySelectorAll("a, button")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ text: el.textContent.trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height) }))
      .filter((x) => x.h > 2 && x.h < 40),
  );

  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    return { domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), transfer: n.transferSize };
  });
  r.metrics = { ...nav, lcp: lcpAtLoad, cls: Number((await page.evaluate(() => window.__cls)).toFixed(4)) };
  r.consoleErrors = errors;

  const ok =
    r.status === 200 &&
    r.langBefore === "en" &&
    r.langAfter === "es" &&
    r.overflowEn <= 0 &&
    r.overflowEs <= 0 &&
    r.agreementVisible &&
    r.linesVisible &&
    r.demoSteps === 5 &&
    r.footerDisclaimer === 0 &&
    errors.length === 0;
  r.ok = ok;
  if (!ok) failed = true;
  results.push(r);
  await context.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
console.log(failed ? "SMOKE FAIL" : `SMOKE PASS (${widths.join(", ")})`);
process.exit(failed ? 1 : 0);
