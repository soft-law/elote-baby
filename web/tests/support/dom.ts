// Minimal browser globals from happy-dom for hook tests. Import before react-dom. Leaves fetch
// alone so msw keeps answering JSON-RPC, and leaves navigator alone (no Web Locks in bun, so the
// pipeline uses its module mutex).
import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost/app" });
const g = globalThis as Record<string, unknown>;
for (const key of ["window", "document", "HTMLElement", "Node", "Element", "Event", "StorageEvent", "MutationObserver"] as const) {
  g[key] = key === "window" ? win : (win as unknown as Record<string, unknown>)[key];
}
g.IS_REACT_ACT_ENVIRONMENT = true;
// React decides once, at load, whether "input" events exist by looking for document.oninput.
// happy-dom has no such property, so React would fall back to an old-IE polyfill and text inputs
// would never fire onChange. Every browser the app supports has it.
if (!("oninput" in win.document)) (win.document as unknown as Record<string, unknown>).oninput = null;

export const domWindow = win;
