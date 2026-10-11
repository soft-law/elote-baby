// Toast state for the app: a list of notices, each with an optional step list (Sign in wallet,
// Confirming, Updated), an explorer link once a signature exists, and one action. ToastProvider
// (Toast.tsx) owns the state and renders the polite live region; components call useToast().
import { createContext, useCallback, useContext, useMemo, useReducer } from "react";

export type ToastTone = "info" | "success" | "error";
export type ToastStepStatus = "waiting" | "active" | "done" | "error";
export type ToastStep = { label: string; status: ToastStepStatus };
export type ToastAction = { label: string; onClick: () => void };

export type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  steps?: ToastStep[];
  /** Transaction signature; shown as an explorer link as soon as it is known. */
  signature?: string | null;
  action?: ToastAction;
  /** Removes the toast after this many milliseconds. Unset: stays until dismissed. */
  autoDismissMs?: number;
};

export type ToastInput = Omit<Toast, "id">;

export type ToastApi = {
  toasts: readonly Toast[];
  show: (toast: ToastInput) => string;
  update: (id: string, patch: Partial<ToastInput>) => void;
  dismiss: (id: string) => void;
};

type Action = { type: "add"; toast: Toast } | { type: "update"; id: string; patch: Partial<ToastInput> } | { type: "remove"; id: string };

function reducer(state: Toast[], action: Action): Toast[] {
  switch (action.type) {
    case "add":
      return [...state, action.toast];
    case "update":
      return state.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t));
    case "remove":
      return state.filter((t) => t.id !== action.id);
  }
}

let nextId = 0;

/** The state behind ToastProvider. */
export function useToastState(): ToastApi {
  const [toasts, dispatch] = useReducer(reducer, []);
  const show = useCallback((toast: ToastInput) => {
    const id = `toast-${++nextId}`;
    dispatch({ type: "add", toast: { ...toast, id } });
    return id;
  }, []);
  const update = useCallback((id: string, patch: Partial<ToastInput>) => dispatch({ type: "update", id, patch }), []);
  const dismiss = useCallback((id: string) => dispatch({ type: "remove", id }), []);
  return useMemo(() => ({ toasts, show, update, dismiss }), [toasts, show, update, dismiss]);
}

export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast outside ToastProvider");
  return api;
}
