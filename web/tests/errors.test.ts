import { describe, expect, test } from "bun:test";
import * as client from "@elote/pool-client";
import { ELOTE_POOL_PROGRAM_ADDRESS } from "@elote/pool-client";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { getSolanaErrorFromJsonRpcError } from "@solana/kit";
import { COMPUTE_BUDGET_PROGRAM } from "../src/tx/computeBudget";
import { PROGRAM_ERROR_NAMES, describeTxError, isTxCancelled, toTxError, txErrorFromChain } from "../src/tx/errors";
import { TxExpiredError, TxFailedError, TxRejectedError, TxUncertainError } from "../src/tx/tx";
import { translations } from "../src/translations";

// Same layout write.ts sends: compute unit limit and price, token account, pool call.
const message = {
  instructions: [
    { programAddress: COMPUTE_BUDGET_PROGRAM },
    { programAddress: COMPUTE_BUDGET_PROGRAM },
    { programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS },
    { programAddress: ELOTE_POOL_PROGRAM_ADDRESS },
  ],
};

const poolError = (code: number) => txErrorFromChain({ InstructionError: [3, { Custom: code }] }, message);

/** "SLIPPAGE_EXCEEDED" -> "SlippageExceeded" */
const pascal = (constant: string) =>
  constant
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");

describe("program errors", () => {
  test("names follow the generated client's constants, 6000..6018", () => {
    const generated = Object.entries(client)
      .filter(([k, v]) => k.startsWith("ELOTE_POOL_ERROR__") && typeof v === "number")
      .map(([k, v]) => [v as number, pascal(k.slice("ELOTE_POOL_ERROR__".length))] as const)
      .sort((a, b) => a[0] - b[0]);
    expect(generated.map(([code]) => code)).toEqual(Array.from({ length: 19 }, (_, i) => 6000 + i));
    for (const [code, name] of generated) expect({ code, name: PROGRAM_ERROR_NAMES[code] as string | undefined }).toEqual({ code, name });
  });

  test("every known code has its own copy in both languages", () => {
    for (let code = 6000; code <= 6018; code++) {
      const error = poolError(code);
      expect(error).toMatchObject({ reason: "program", programCode: code, programErrorName: PROGRAM_ERROR_NAMES[code] });
      for (const lang of ["en", "es"] as const) {
        const text = describeTxError(error, translations[lang]);
        expect(text).not.toBe(translations[lang].app.tx.errors.programGeneric);
        expect(Object.values(translations[lang].app.tx.errors.program)).toContain(text);
      }
    }
  });

  test("SlippageExceeded (6011) and TermEnded (6012)", () => {
    expect(describeTxError(poolError(6011), translations.en)).toBe(translations.en.app.tx.errors.program.slippageExceeded);
    expect(describeTxError(poolError(6012), translations.es)).toBe(translations.es.app.tx.errors.program.termEnded);
  });

  test("arrears codes 6013..6018 have their own copy; codes past 6018 fall back", () => {
    expect(describeTxError(poolError(6017), translations.en)).toBe(translations.en.app.tx.errors.program.lateInterestUnpaid);
    expect(describeTxError(poolError(6015), translations.es)).toBe(translations.es.app.tx.errors.program.notScheduled);
    const unknown = poolError(6019);
    expect(unknown).toMatchObject({ reason: "program", programCode: 6019 });
    expect((unknown as TxFailedError).programErrorName).toBeUndefined();
    expect(describeTxError(unknown, translations.en)).toBe(translations.en.app.tx.errors.programGeneric);
  });

  test("a custom code is attributed to the instruction that raised it", () => {
    // Token InsufficientFunds through the pool's transfer.
    expect(poolError(1)).toMatchObject({ reason: "insufficient-tokens" });
    // System program "insufficient lamports" inside the token account creation.
    expect(txErrorFromChain({ InstructionError: [2, { Custom: 1 }] }, message)).toMatchObject({ reason: "insufficient-sol" });
    // 6011 raised by a program other than the pool is not SlippageExceeded.
    expect(txErrorFromChain({ InstructionError: [2, { Custom: 6011 }] }, message)).toMatchObject({ reason: "unknown" });
  });
});

describe("chain and wallet errors", () => {
  test("insufficient SOL", () => {
    for (const err of ["InsufficientFundsForFee", "AccountNotFound", { InsufficientFundsForRent: { account_index: 0 } }]) {
      const error = txErrorFromChain(err, message);
      expect(error).toMatchObject({ reason: "insufficient-sol" });
      expect(describeTxError(error, translations.en)).toBe(translations.en.app.tx.errors.insufficientSol);
    }
  });

  test("blockhash not found is an expiry", () => {
    expect(txErrorFromChain("BlockhashNotFound", message)).toBeInstanceOf(TxExpiredError);
    expect(describeTxError(new TxExpiredError("x"), translations.es)).toBe(translations.es.app.tx.errors.expired);
  });

  test("a preflight failure from the RPC unwraps to the program error", () => {
    const rpcError = getSolanaErrorFromJsonRpcError({
      code: -32002,
      message: "Transaction simulation failed",
      data: { err: { InstructionError: [3, { Custom: 6000 }] }, logs: [], accounts: null, unitsConsumed: 0, returnData: null },
    });
    expect(toTxError(rpcError, message)).toMatchObject({ reason: "program", programErrorName: "Paused" });
  });

  test("user rejection by code or by wallet message is a cancellation", () => {
    for (const thrown of [
      Object.assign(new Error("whatever"), { code: 4001 }),
      new Error("User rejected the request."),
      new Error("wrapper", { cause: new Error("The user declined the request") }),
    ]) {
      expect(toTxError(thrown)).toBeInstanceOf(TxRejectedError);
      expect(isTxCancelled(thrown)).toBe(true);
    }
    expect(describeTxError(new TxRejectedError(), translations.en)).toBe(translations.en.app.tx.errors.rejected);
  });

  test("network trouble and unknown errors never leak provider text", () => {
    const leaky = new Error("signed payload AAAAbase64secret");
    expect(toTxError(leaky)).toMatchObject({ reason: "unknown" });
    expect(describeTxError(leaky, translations.en)).toBe(translations.en.app.tx.errors.generic);
    expect(toTxError(new TypeError("fetch failed"))).toMatchObject({ reason: "network" });
  });

  test("every typed error has distinct copy", () => {
    const errors = [
      new TxRejectedError(),
      new TxExpiredError(),
      new TxUncertainError("sig"),
      ...(["insufficient-sol", "insufficient-tokens", "guard", "busy", "journal", "network", "no-wallet", "unknown"] as const).map(
        (r) => new TxFailedError(r),
      ),
      new TxFailedError("program", { programCode: 6099 }),
    ];
    for (const lang of ["en", "es"] as const) {
      const texts = errors.map((e) => describeTxError(e, translations[lang]));
      expect(new Set(texts).size).toBe(texts.length);
    }
  });
});
