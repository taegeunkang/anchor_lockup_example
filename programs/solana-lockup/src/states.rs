use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub amount: u64,
    pub start_time: u64,
    pub end_time: u64,
    pub mint: Pubkey,
}
