import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { META } from "./src/meta.ts";

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Writes the metadata from src/meta.ts (and so the BRAND constant) into index.html.
function pageMeta(): Plugin {
  const values: Record<string, string> = {
    "%TITLE%": META.title,
    "%DESCRIPTION%": META.description,
    "%OG_TITLE%": META.ogTitle,
    "%OG_DESCRIPTION%": META.ogDescription,
    "%TWITTER_CARD%": META.twitterCard,
    "%TWITTER_TITLE%": META.twitterTitle,
  };
  return {
    name: "page-meta",
    transformIndexHtml(html) {
      let out = html;
      for (const [key, value] of Object.entries(values)) out = out.split(key).join(escapeAttr(value));
      return out;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), pageMeta()],
});
