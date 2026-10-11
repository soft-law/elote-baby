// Renders the English page into dist/index.html after `vite build`, so the first paint
// does not wait for JavaScript. The client hydrates it (src/main.tsx) after the window
// load event: the page is fully readable without JavaScript, and only the language
// toggle and the mobile menu need it.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "../src/App";

const file = join(import.meta.dir, "..", "dist", "index.html");
const html = readFileSync(file, "utf8");
const marker = '<div id="root"></div>';
if (!html.includes(marker)) throw new Error("dist/index.html has no empty #root");

const body = renderToString(
  <StrictMode>
    <App />
  </StrictMode>,
);
let out = html.replace(marker, `<div id="root">${body}</div>`);

const entry = out.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
if (!entry) throw new Error("dist/index.html has no module entry script");
out = out.replace(entry[0], "");
// With two entries (index.html and app.html) Vite moves React into a shared chunk and preloads it.
// Drop the preload so no script downloads before the load event, as with a single entry; the
// deferred entry still imports the chunk.
out = out.replace(/\s*<link rel="modulepreload"[^>]*>/g, "");
const loader =
  `<script>addEventListener("load",function(){var s=document.createElement("script");` +
  `s.type="module";s.src=${JSON.stringify(entry[1])};document.head.appendChild(s)})</script>`;
out = out.replace("</body>", `${loader}\n  </body>`);

writeFileSync(file, out);
console.log(`prerendered ${body.length} chars into dist/index.html`);
