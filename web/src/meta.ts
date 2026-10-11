import { BRAND } from "./config.ts";

// Static page metadata. vite.config.ts writes these into index.html at build time.
const TITLE = `${BRAND} | Mexican loans on Solana`;
const DESCRIPTION =
  "Your deposit funds credit lines for small businesses in Mexico, like the panadería on your corner.";

export const META = {
  title: TITLE,
  description: DESCRIPTION,
  ogTitle: TITLE,
  ogDescription: DESCRIPTION,
  twitterCard: "summary",
  twitterTitle: TITLE,
} as const;
