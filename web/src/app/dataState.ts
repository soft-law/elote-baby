// What a query result lets the page claim. The rule: a failed read never becomes "nothing here".
//   loading      first read in flight, nothing to show yet: skeletons
//   ready        data from the latest read
//   stale        the latest refresh failed, the last good data is still shown with a notice
//   unavailable  the read failed and there is nothing to show: error with retry, never empty
export type DataState = "loading" | "ready" | "stale" | "unavailable";

export function dataState(query: { isPending: boolean; isError: boolean; data: unknown }): DataState {
  const hasData = query.data !== undefined;
  if (query.isError) return hasData ? "stale" : "unavailable";
  if (!hasData) return query.isPending ? "loading" : "unavailable";
  return "ready";
}
