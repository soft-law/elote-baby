// Providers of the pool app, below the validated configuration: TanStack Query (reads), the RPC
// client and the wallet. The keypair test wallet is loaded only when VITE_TEST_WALLET=1.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { RpcProvider } from "../tx/RpcProvider";
import { chainForCluster } from "../wallet/useWallet";
import { WalletProvider } from "../wallet/WalletProvider";
import type { AppConfig } from "./config";

export const QUERY_STALE_MS = 15_000;
export const QUERY_REFETCH_MS = 30_000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_MS,
        // Polls only while the tab is visible.
        refetchInterval: QUERY_REFETCH_MS,
        refetchIntervalInBackground: false,
        retry: 2,
      },
    },
  });
}

export function AppProviders({ config, children }: { config: AppConfig; children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  const chain = chainForCluster(config.explorerCluster);

  useEffect(() => {
    // The build-time check lets real builds drop the test wallet module altogether.
    if (import.meta.env.VITE_TEST_WALLET !== "1" || !config.testWallet) return;
    let unregister: (() => void) | undefined;
    let cancelled = false;
    void import("../wallet/testWallet")
      .then((m) => m.registerTestWalletFromEnv(chain))
      .then((off) => {
        if (cancelled) off();
        else unregister = off;
      })
      .catch(() => {
        // Misconfigured test build: the wallet list simply lacks the test wallet.
      });
    return () => {
      cancelled = true;
      unregister?.();
    };
  }, [config.testWallet, chain]);

  return (
    <QueryClientProvider client={queryClient}>
      <RpcProvider url={config.rpcUrl}>
        <WalletProvider chain={chain}>{children}</WalletProvider>
      </RpcProvider>
    </QueryClientProvider>
  );
}
