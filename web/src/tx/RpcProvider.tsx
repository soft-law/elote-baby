// One RPC client per configuration, shared by every query and transaction below the provider.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createRpc, type EloteRpc } from "./rpc";

const RpcContext = createContext<EloteRpc | null>(null);

export function RpcProvider({ url, children }: { url: string; children: ReactNode }) {
  const rpc = useMemo(() => createRpc(url), [url]);
  return <RpcContext.Provider value={rpc}>{children}</RpcContext.Provider>;
}

export function useRpc(): EloteRpc {
  const rpc = useContext(RpcContext);
  if (!rpc) throw new Error("useRpc outside RpcProvider");
  return rpc;
}
