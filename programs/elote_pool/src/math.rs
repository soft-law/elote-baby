//! Share accounting. Products go through `u128`; every division rounds down, which favours the
//! pool on both deposit and redemption.

use crate::state::BPS;

/// Net asset value: vault balance plus principal lent out and not yet repaid or written off.
pub fn nav(vault_balance: u64, outstanding_principal: u64) -> Option<u64> {
    vault_balance.checked_add(outstanding_principal)
}

/// Shares created for `assets` at the current `supply` and `nav`; one-to-one while `supply == 0`.
pub fn shares_for_deposit(assets: u64, supply: u64, nav: u64) -> Option<u64> {
    if supply == 0 {
        return Some(assets);
    }
    (assets as u128)
        .checked_mul(supply as u128)?
        .checked_div(nav as u128)
        .and_then(|v| u64::try_from(v).ok())
}

/// Assets paid out for burning `shares` at the current `supply` and `nav`.
pub fn assets_for_redeem(shares: u64, supply: u64, nav: u64) -> Option<u64> {
    (shares as u128)
        .checked_mul(nav as u128)?
        .checked_div(supply as u128)
        .and_then(|v| u64::try_from(v).ok())
}

/// Fixed interest on `principal` at `rate_bps`.
pub fn interest_due(principal: u64, rate_bps: u16) -> Option<u64> {
    (principal as u128)
        .checked_mul(rate_bps as u128)?
        .checked_div(BPS as u128)
        .and_then(|v| u64::try_from(v).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rounding_favours_the_pool() {
        assert_eq!(shares_for_deposit(1, 3, 2), Some(1));
        assert_eq!(assets_for_redeem(1, 3, 2), Some(0));
        assert_eq!(shares_for_deposit(1_000_000, 10_000_000, 10_400_000), Some(961_538));
    }

    #[test]
    fn first_deposit_is_one_to_one() {
        assert_eq!(shares_for_deposit(1_234_567, 0, 0), Some(1_234_567));
        assert_eq!(shares_for_deposit(1_234_567, 0, 99), Some(1_234_567));
    }

    #[test]
    fn zero_nav_or_supply_is_refused() {
        assert_eq!(shares_for_deposit(1, 1, 0), None);
        assert_eq!(assets_for_redeem(1, 0, 1), None);
    }

    #[test]
    fn large_values_do_not_overflow_the_product() {
        assert_eq!(shares_for_deposit(u64::MAX, u64::MAX, u64::MAX), Some(u64::MAX));
        assert_eq!(assets_for_redeem(u64::MAX, u64::MAX, u64::MAX), Some(u64::MAX));
        assert_eq!(shares_for_deposit(u64::MAX, u64::MAX, 1), None, "result above u64");
        assert_eq!(nav(u64::MAX, 1), None);
    }

    #[test]
    fn interest_is_rounded_down() {
        assert_eq!(interest_due(4_000_000, 1_000), Some(400_000));
        assert_eq!(interest_due(6_000_000_000, 1_200), Some(720_000_000));
        assert_eq!(interest_due(9_999, 1), Some(0));
        assert_eq!(interest_due(u64::MAX, 10_000), Some(u64::MAX));
    }
}
