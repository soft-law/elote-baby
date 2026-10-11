// One Solana RPC client per configuration. Every call gets a 15 s timeout (combined with any
// signal the caller passes), so a stalled node turns into a network error instead of a spinner
// that never ends. This is kit's createSolanaRpc with the transport wrapped for the timeout.
import {
  createDefaultRpcTransport,
  createSolanaRpcFromTransport,
  type Rpc,
  type RpcTransport,
  type SolanaRpcApi,
} from "@solana/kit";

export const RPC_TIMEOUT_MS = 15_000;

export type EloteRpc = Rpc<SolanaRpcApi>;

function withTimeout(transport: RpcTransport, ms: number): RpcTransport {
  return <TResponse,>(config: Parameters<RpcTransport>[0]) => {
    const timeout = AbortSignal.timeout(ms);
    const signal = config.signal ? AbortSignal.any([config.signal, timeout]) : timeout;
    return transport<TResponse>({ ...config, signal });
  };
}

export function createRpc(url: string, timeoutMs: number = RPC_TIMEOUT_MS): EloteRpc {
  return createSolanaRpcFromTransport(withTimeout(createDefaultRpcTransport({ url }), timeoutMs));
}
