//! elote_pool: a liquidity pool with a share token. Investors deposit the pool asset and receive
//! shares; the admin approves credit lines from the pool; repaid interest raises the value of
//! every share and a recognised loss lowers it.
//!
//! Share accounting follows ERC-4626: `shares = assets * supply / NAV` on deposit and
//! `assets = shares * NAV / supply` on redemption, with `NAV = vault balance + outstanding
//! principal`. Interest counts when it is collected; nothing accrues.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use instructions::*;

declare_id!("BGdJQxxJoHiLH2VS6HAGHe5kQuKKq9dwrPeX7DEEwYyM");

#[program]
pub mod elote_pool {
    use super::*;

    /// Creates the pool, its share token mint and its vault for `asset_mint`.
    pub fn init_pool(ctx: Context<InitPool>) -> Result<()> {
        instructions::pool::init_pool(ctx)
    }

    /// Deposits `assets` into the vault and receives shares at the current NAV.
    pub fn deposit(ctx: Context<Deposit>, assets: u64) -> Result<()> {
        instructions::pool::deposit(ctx, assets)
    }

    /// Burns `shares` and receives assets at the current NAV, up to the vault's liquidity.
    pub fn redeem(ctx: Context<Redeem>, shares: u64) -> Result<()> {
        instructions::pool::redeem(ctx, shares)
    }

    /// Pauses or resumes deposits, redemptions, openings, draws and repayments.
    pub fn set_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
        instructions::pool::set_paused(ctx, paused)
    }
}
