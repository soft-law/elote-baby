import { createContext, useContext } from "react";
import type { AppConfig } from "./config";

export const ConfigContext = createContext<AppConfig | null>(null);

/** The validated app configuration. Only rendered below App, which blocks on a bad config. */
export function useAppConfig(): AppConfig {
  const config = useContext(ConfigContext);
  if (!config) throw new Error("useAppConfig outside ConfigContext");
  return config;
}

/** The RPC URL that localnet explorer links name; undefined outside the app (component tests). */
export function useExplorerRpcUrl(): string | undefined {
  return useContext(ConfigContext)?.rpcUrl;
}
