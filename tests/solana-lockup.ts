import * as anchor from "@project-serum/anchor";
import { Program, BN } from "@project-serum/anchor";
import { SolanaLockup } from "../target/types/solana_lockup";
import {
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair,
} from "@solana/web3.js";
import {
  createMint,
  TOKEN_PROGRAM_ID,
  mintTo,
  createAssociatedTokenAccount,
  getAccount,
  Account,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { expect } from "chai";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";

function sleep(sec: number) {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
} // 함수정의

describe("solana-lockup", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolanaLockup as Program<SolanaLockup>;
  const owner: Keypair = anchor.web3.Keypair.generate();

  let token: PublicKey;
  let owner_ATA: PublicKey;
  let vault_account_pda: PublicKey;
  let vault_ata: PublicKey;

  it("request sol", async () => {
    // request 10 sol
    const response = await provider.connection.requestAirdrop(
      owner.publicKey,
      LAMPORTS_PER_SOL * 10
    );

    // ide told it is deprecated but theres no way use TransactionConfirmationConfig. so use this.
    await provider.connection.confirmTransaction(response, "confirmed");
    // check the balance
    const balance = await provider.connection.getBalance(owner.publicKey);
    expect(balance).to.equal(LAMPORTS_PER_SOL * 10);

  });
  it("create and mint token", async () => {
    // create token
    token = await createMint(
      provider.connection,
      owner,
      owner.publicKey,
      owner.publicKey,
      9,
      undefined,
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );
    // create ATA fo owner
    owner_ATA = await createAssociatedTokenAccount(
      provider.connection,
      owner,
      token,
      owner.publicKey,
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );
    // mint to owner
    await mintTo(
      provider.connection,
      owner,
      token,
      owner_ATA,
      owner.publicKey,
      100 * LAMPORTS_PER_SOL,
      [],
      { commitment: "confirmed" },
      TOKEN_PROGRAM_ID
    );
    // get ATA of owner and verify
    let resposne_owener_ATA_public_key: PublicKey =
      getAssociatedTokenAddressSync(
        token,
        owner.publicKey,
        false,
        TOKEN_PROGRAM_ID
      );

    let owner_token_amount: Account = await getAccount(
      provider.connection,
      resposne_owener_ATA_public_key,
      "confirmed",
      TOKEN_PROGRAM_ID
    );

    expect(resposne_owener_ATA_public_key.toString()).to.equal(
      owner_ATA.toString()
    );
    expect(owner_token_amount.amount.toString()).to.equal(
      (100 * LAMPORTS_PER_SOL).toString()
    );
  });

  it("initialize", async () => {
    const [_vap, _b] = findProgramAddressSync(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("vault")),
        owner.publicKey.toBuffer(),
      ],
      program.programId
    );
    vault_account_pda = _vap;

    const [_va, _] = findProgramAddressSync(
      [Buffer.from(anchor.utils.bytes.utf8.encode("vault"))],
      program.programId
    );
    vault_ata = _va;

    //initialize contract
    const initialize_tx = await program.methods
      .initialize()
      .accounts({
        authority: owner.publicKey,
        vaultAccount: vault_account_pda,
        vaultAta: vault_ata,
        mint: token,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([owner])
      .rpc();

    await provider.connection.confirmTransaction(initialize_tx, "confirmed");
  });

  it("deposit", async () => {
    
    //unlock for 1min
    const deposit_tx = await program.methods
      .deposit(new BN(3 * LAMPORTS_PER_SOL), new BN(60))
      .accounts({
        authority: owner.publicKey,
        authorityAta: owner_ATA,
        vaultAccount: vault_account_pda,
        vaultAta: vault_ata,
        mint: token,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    await provider.connection.confirmTransaction(deposit_tx, "confirmed");

    const ata_balance = (
      await getAccount(
        provider.connection,
        vault_ata,
        "confirmed",
        TOKEN_PROGRAM_ID
      )
    ).amount;
    expect(ata_balance.toString()).to.equal("3000000000");

    // expect(ata_balance.toString()).to.equal("1000000000");
  });

  it("withdraw fail", async () => {
    try {
      await program.methods
        .withdraw()
        .accounts({
          authority: owner.publicKey,
          authorityAta: owner_ATA,
          vaultAccount: vault_account_pda,
          vaultAta: vault_ata,
          mint: token,
          clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([owner])
        .rpc();
    } catch (e) {
      expect(e.logs[e.logs.length - 1]).to.include(
        "custom program error: 0x193"
      );
    }
  });
  
  it("withdraw success", async () => {
    // wait until unlock
    await sleep(60);

    const withdraw_tx = await program.methods
      .withdraw()
      .accounts({
        authority: owner.publicKey,
        authorityAta: owner_ATA,
        vaultAccount: vault_account_pda,
        vaultAta: vault_ata,
        mint: token,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([owner])
      .rpc();

    await provider.connection.confirmTransaction(withdraw_tx, "confirmed");

    const _owner_ata = await getAccount(
      provider.connection,
      owner_ATA,
      "confirmed",
      TOKEN_PROGRAM_ID
    );
    const _vault_ata = await getAccount(
      provider.connection,
      vault_ata,
      "confirmed",
      TOKEN_PROGRAM_ID
    );

    expect(_owner_ata.amount.toString()).to.equal(
      (100 * LAMPORTS_PER_SOL).toString()
    );
    expect(_vault_ata.amount.toString()).to.equal(
      (0 * LAMPORTS_PER_SOL).toString()
    );
  });
});
