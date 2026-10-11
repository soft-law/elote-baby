// The four pool operations the app sends, built with the generated client. Each op first creates,
// idempotently, the token account it writes to, so a first deposit or a first draw works from a
// fresh wallet. The wallet pays and signs; the pool accounts come from derivePoolAccounts.
import {
  findLinePda,
  getDepositInstructionAsync,
  getDrawInstructionAsync,
  getRedeemInstructionAsync,
  getRepayInstructionAsync,
} from "@elote/pool-client";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstructionAsync,
} from "@solana-program/token";
import type { Address, Instruction, TransactionSigner } from "@solana/kit";
import type { AppConfig, PoolAccounts } from "../app/config";

export type PoolOp =
  | { kind: "deposit"; assets: bigint; minSharesOut: bigint }
  | { kind: "redeem"; shares: bigint; minAssetsOut: bigint }
  | { kind: "draw"; lineId: bigint }
  | { kind: "repay"; lineId: bigint; amount: bigint };

export type PoolOpKind = PoolOp["kind"];

export type OpContext = {
  /** The connected wallet: fee payer, signer and owner of the token accounts. */
  signer: TransactionSigner;
  config: Pick<AppConfig, "assetMint">;
  accounts: PoolAccounts;
};

/** Associated token account of `owner` for `mint` (classic token program). */
export async function ataOf(owner: Address, mint: Address): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  return ata;
}

function positive(value: bigint, field: string): bigint {
  if (value <= 0n) throw new RangeError(`${field} must be greater than zero`);
  return value;
}

function nonNegative(value: bigint, field: string): bigint {
  if (value < 0n) throw new RangeError(`${field} must not be negative`);
  return value;
}

/** Instructions for one op, in order: idempotent token account creation, then the pool call. */
export async function buildOpInstructions(op: PoolOp, ctx: OpContext): Promise<Instruction[]> {
  const { signer, accounts } = ctx;
  const owner = signer.address;
  const assetMint = ctx.config.assetMint;
  const createAta = (mint: Address) =>
    getCreateAssociatedTokenIdempotentInstructionAsync({ payer: signer, owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });

  switch (op.kind) {
    case "deposit": {
      // Writes the depositor's share account.
      return [
        await createAta(accounts.shareMint),
        await getDepositInstructionAsync({
          depositor: signer,
          pool: accounts.pool,
          shareMint: accounts.shareMint,
          vault: accounts.vault,
          deadShares: accounts.deadShares,
          depositorAssetAccount: await ataOf(owner, assetMint),
          depositorShareAccount: await ataOf(owner, accounts.shareMint),
          assets: positive(op.assets, "assets"),
          minSharesOut: nonNegative(op.minSharesOut, "minSharesOut"),
        }),
      ];
    }
    case "redeem": {
      // Writes the holder's test token account.
      return [
        await createAta(assetMint),
        await getRedeemInstructionAsync({
          holder: signer,
          pool: accounts.pool,
          shareMint: accounts.shareMint,
          vault: accounts.vault,
          holderShareAccount: await ataOf(owner, accounts.shareMint),
          holderAssetAccount: await ataOf(owner, assetMint),
          shares: positive(op.shares, "shares"),
          minAssetsOut: nonNegative(op.minAssetsOut, "minAssetsOut"),
        }),
      ];
    }
    case "draw": {
      // Writes the borrower's test token account.
      const [line] = await findLinePda({ pool: accounts.pool, lineId: nonNegative(op.lineId, "lineId") });
      return [
        await createAta(assetMint),
        await getDrawInstructionAsync({
          borrower: signer,
          pool: accounts.pool,
          line,
          vault: accounts.vault,
          borrowerAssetAccount: await ataOf(owner, assetMint),
        }),
      ];
    }
    case "repay": {
      // Any payer may repay; writes (debits) the payer's test token account.
      const [line] = await findLinePda({ pool: accounts.pool, lineId: nonNegative(op.lineId, "lineId") });
      return [
        await createAta(assetMint),
        await getRepayInstructionAsync({
          payer: signer,
          pool: accounts.pool,
          line,
          vault: accounts.vault,
          payerAssetAccount: await ataOf(owner, assetMint),
          amount: positive(op.amount, "amount"),
        }),
      ];
    }
  }
}
