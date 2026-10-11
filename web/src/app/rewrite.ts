// The app is a second entry (app.html) served under /app. Its client-side routes have no files,
// so /app and /app/<anything> answer with app.html in the dev and preview servers (vercel.json
// does the same in production). /app.html itself, /assets and every other path are untouched.
const APP_ROUTE = /^\/app(?=\/|\?|$)/;

export function rewriteAppUrl(url: string): string {
  if (!APP_ROUTE.test(url)) return url;
  const query = url.indexOf("?");
  return `/app.html${query >= 0 ? url.slice(query) : ""}`;
}
