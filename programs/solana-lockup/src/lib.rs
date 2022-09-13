use anchor_lang::{prelude::*, solana_program};
use anchor_lang::solana_program::entrypoint::ProgramResult;
use anchor_spl::{
    token,
    token::{Token, TokenAccount, Transfer, Mint},
    associated_token::*,
};
pub mod states;

use crate::states::*;

declare_id!("DEQFNjLkV3sQpRsLWyR8yh7EBHJXVwvfDdjUZt4PrUuJ");

#[program]
pub mod solana_lockup {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> ProgramResult {

        ctx.accounts.vault_account.authority = ctx.accounts.authority.key();
        ctx.accounts.vault_account.mint = ctx.accounts.mint.key();
        
        Ok(())
    }

    pub fn deposit(ctx : Context<Deposit>, _amount : u64, _period : u64) -> ProgramResult {

        let _authority_ata = get_associated_token_address(&ctx.accounts.authority.key(), &ctx.accounts.mint.key());
        
        
        if ctx.accounts.authority_ata.key() != _authority_ata {
            msg!("invalid ata address");
            return Err(ProgramError::InvalidAccountData);
        }



        let now : u64 = ctx.accounts.clock.unix_timestamp as u64;
        msg!("current time : {}" , now);
        
        ctx.accounts.vault_account.amount = _amount;
        ctx.accounts.vault_account.start_time = now;
        ctx.accounts.vault_account.end_time = now.checked_add(_period).unwrap();
        msg!("unlock time : {}" , ctx.accounts.vault_account.end_time);
        token::transfer(ctx.accounts.into_transfer_cpi_context(), _amount)?;

        Ok(())
    }

    pub fn withdraw(ctx : Context<Withdraw>) -> ProgramResult {

        let _authority_ata : Pubkey = get_associated_token_address(&ctx.accounts.authority.key(), &ctx.accounts.mint.key());
        msg!("withdraw execute!");

        if _authority_ata != ctx.accounts.authority_ata.key() {
            msg!("ata address error");
            return Err(ProgramError::InvalidAccountData);
        
        }

        ctx.accounts.time_check()?;
        
        token::transfer(ctx.accounts.into_transfer_cpi_context(), ctx.accounts.vault_account.amount)?;

        Ok(())

    }
   
}

#[derive(Accounts)]
#[instruction()]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, seeds=[b"vault", authority.key().as_ref()], bump, payer = authority, space= std::mem::size_of::<Vault>() + 8)]
    pub vault_account: Account<'info,Vault>,
    #[account(init, seeds=[b"vault"], bump, payer = authority, token::mint = mint, token::authority = authority)]
    pub vault_ata : Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    #[account(address = solana_program::sysvar::rent::ID)]
    pub rent: Sysvar<'info, Rent>
}

#[derive(Accounts)]
#[instruction(_amount : u64, _period : u64)]
pub struct Deposit<'info> {
    #[account(mut, constraint = vault_account.authority == authority.key())]
    pub authority : Signer<'info>,
    #[account(mut)]
    pub authority_ata : Account<'info, TokenAccount>,
    #[account(mut, seeds=[b"vault", authority.key().as_ref()], bump)]
    pub vault_account : Account<'info,Vault>,
    #[account(mut, seeds=[b"vault"], bump)]
    pub vault_ata : Account<'info, TokenAccount>,
    #[account(mut, constraint = vault_account.mint == mint.key())]
    pub mint : Account<'info, Mint>,
    #[account(address = solana_program::sysvar::clock::ID)]
    pub clock: Sysvar<'info, Clock>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

}

#[derive(Accounts)]
#[instruction()]
pub struct Withdraw<'info> {
    #[account(mut, constraint = vault_account.authority == authority.key())]
    pub authority : Signer<'info>,
    #[account(mut)]
    pub authority_ata : Account<'info, TokenAccount>,
    #[account(mut, seeds=[b"vault", authority.key().as_ref()], bump)]
    pub vault_account : Account<'info, Vault>,
    #[account(mut, seeds=[b"vault"], bump)]
    pub vault_ata : Account<'info, TokenAccount>,
    #[account(mut, constraint = vault_account.mint == mint.key())]
    pub mint : Account<'info, Mint>,
    #[account(address = solana_program::sysvar::clock::ID)]
    pub clock: Sysvar<'info, Clock>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

}

impl <'info> Deposit<'info> {

    pub fn into_transfer_cpi_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>>  {
        let transfer_struct = Transfer {
            from : self.authority_ata.to_account_info(),
            to : self.vault_ata.to_account_info(),
            authority : self.authority.to_account_info()
        };

        CpiContext::new(self.token_program.to_account_info(), transfer_struct)
    }
    
}

impl<'info> Withdraw<'info> {

    pub fn time_check(&self) -> ProgramResult{

        let now: u64 =  self.clock.unix_timestamp as u64;
        let unlock_time: u64 = self.vault_account.end_time;
        if now < unlock_time {
            return Err(ProgramError::Custom(403));
        }

        Ok(())
    }

    pub fn into_transfer_cpi_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>>  {
        let transfer_struct = Transfer {
            from : self.vault_ata.to_account_info(),
            to : self.authority_ata.to_account_info(),
            authority : self.authority.to_account_info()
        };

        CpiContext::new(self.token_program.to_account_info(), transfer_struct)
    }
    
}
