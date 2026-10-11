// Test support: an msw server answering Solana JSON-RPC, keypair signers generated per test, and
// a few transaction helpers. Never a real key, never a real network.
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  generateKeyPairSigner,
  getBase64Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
  type Address,
  type KeyPairSigner,
  type TransactionPartialSigner,
} from "@solana/kit";
import { derivePoolAccounts, type PoolAccounts } from "../../src/app/config";

export const RPC_URL = "http://rpc.test/";

export type RpcCall = { method: string; params: unknown[] };
export type RpcHandler = (params: unknown[], call: number) => unknown;

/** Throw from a handler to answer with a JSON-RPC error object. */
export class RpcErrorReply {
  constructor(
    readonly code: number,
    readonly message: string,
    readonly data?: unknown,
  ) {}
}

export function startRpc() {
  const calls: RpcCall[] = [];
  let handlers: Record<string, RpcHandler> = {};
  const counts = new Map<string, number>();
  const server = setupServer(
    http.post(RPC_URL, async ({ request }) => {
      const body = (await request.json()) as { id: string | number; method: string; params?: unknown[] };
      const params = body.params ?? [];
      calls.push({ method: body.method, params });
      const n = counts.get(body.method) ?? 0;
      counts.set(body.method, n + 1);
      const handler = handlers[body.method];
      if (!handler) return HttpResponse.json({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: `unhandled ${body.method}` } });
      try {
        const result = await handler(params, n);
        return HttpResponse.json({ jsonrpc: "2.0", id: body.id, result } as never);
      } catch (error) {
        if (error instanceof RpcErrorReply) {
          return HttpResponse.json({
            jsonrpc: "2.0",
            id: body.id,
            error: { code: error.code, message: error.message, ...(error.data !== undefined ? { data: error.data } : {}) },
          } as never);
        }
        if (error instanceof Response) return error as never;
        return HttpResponse.error();
      }
    }),
  );
  server.listen({ onUnhandledRequest: "error" });
  return {
    calls,
    methods: () => calls.map((c) => c.method),
    count: (method: string) => calls.filter((c) => c.method === method).length,
    use(next: Record<string, RpcHandler>) {
      handlers = { ...handlers, ...next };
    },
    reset() {
      calls.length = 0;
      counts.clear();
      handlers = {};
      server.resetHandlers();
    },
    /** The msw server, for HTTP handlers beside JSON-RPC (cleared by reset). */
    server,
    close: () => server.close(),
  };
}

export type Rpc = ReturnType<typeof startRpc>;

const ctx = (value: unknown) => ({ context: { slot: 100 }, value });

/** Signature of a base64 wire transaction, as the node would return it. */
export function signatureOfWire(base64: string): string {
  const bytes = getBase64Encoder().encode(base64);
  return getSignatureFromTransaction(getTransactionDecoder().decode(bytes));
}

export type ChainState = {
  blockhash: string;
  lastValidBlockHeight: number;
  height: number;
  /** Signature status by signature; absent means unknown to the cluster. */
  statuses: Map<string, { err: unknown; confirmationStatus: "processed" | "confirmed" | "finalized"; slot: number }>;
  /** When set, a sent transaction is confirmed at this slot. */
  confirmOnSend: number | null;
  simulateErr: unknown;
  sent: string[];
};

/** Handlers for a well-behaved cluster; tests tweak `state` to steer it. */
export async function healthyCluster(rpc: Rpc): Promise<ChainState> {
  const state: ChainState = {
    blockhash: (await generateKeyPairSigner()).address,
    lastValidBlockHeight: 1_000,
    height: 900,
    statuses: new Map(),
    confirmOnSend: 4242,
    simulateErr: null,
    sent: [],
  };
  rpc.use({
    getLatestBlockhash: () => ctx({ blockhash: state.blockhash, lastValidBlockHeight: state.lastValidBlockHeight }),
    getBlockHeight: () => state.height,
    simulateTransaction: () =>
      ctx({ err: state.simulateErr, logs: [], unitsConsumed: 42_000, accounts: null, returnData: null, innerInstructions: null }),
    sendTransaction: (params) => {
      const wire = params[0] as string;
      state.sent.push(wire);
      const sig = signatureOfWire(wire);
      if (state.confirmOnSend !== null) state.statuses.set(sig, { err: null, confirmationStatus: "confirmed", slot: state.confirmOnSend });
      return sig;
    },
    getSignatureStatuses: (params) => {
      const sigs = params[0] as string[];
      return ctx(
        sigs.map((s) => {
          const st = state.statuses.get(s);
          return st ? { slot: st.slot, confirmations: 1, err: st.err, confirmationStatus: st.confirmationStatus, status: st.err ? { Err: st.err } : { Ok: null } } : null;
        }),
      );
    },
  });
  return state;
}

/** A generated keypair wrapped so tests can count signing requests. */
export async function countingSigner(): Promise<{ signer: TransactionPartialSigner; keyPair: KeyPairSigner; count: () => number }> {
  const keyPair = await generateKeyPairSigner();
  let n = 0;
  const signer: TransactionPartialSigner = {
    address: keyPair.address,
    async signTransactions(transactions, config) {
      n += 1;
      return keyPair.signTransactions(transactions, config);
    },
  };
  return { signer, keyPair, count: () => n };
}

export async function testPool(): Promise<{ config: { poolAddress: Address; assetMint: Address }; accounts: PoolAccounts }> {
  const poolAddress = (await generateKeyPairSigner()).address;
  const assetMint = (await generateKeyPairSigner()).address;
  return { config: { poolAddress, assetMint }, accounts: await derivePoolAccounts(poolAddress) };
}
