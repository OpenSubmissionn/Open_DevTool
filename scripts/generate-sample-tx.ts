import {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';

const payer = Keypair.generate();
const recipient = Keypair.generate();
const blockhash = new PublicKey('11111111111111111111111111111111').toBase58();

const ix = SystemProgram.transfer({
  fromPubkey: payer.publicKey,
  toPubkey: recipient.publicKey,
  lamports: LAMPORTS_PER_SOL / 100,
});

const msg = new TransactionMessage({
  payerKey: payer.publicKey,
  recentBlockhash: blockhash,
  instructions: [ix],
}).compileToV0Message();

const tx = new VersionedTransaction(msg);
tx.sign([payer]);

const b64 = Buffer.from(tx.serialize()).toString('base64');
const outPath = path.resolve(process.cwd(), 'sample-tx.b64');
fs.writeFileSync(outPath, b64, 'utf-8');

console.log(`Wrote ${outPath} (${b64.length} chars)`);
console.log(
  `Payer:     ${payer.publicKey.toBase58()}  (no SOL — simulation will return AccountNotFound)`
);
console.log(`Recipient: ${recipient.publicKey.toBase58()}`);
console.log(``);
console.log(`Now run:`);
console.log(`  open simulate ./sample-tx.b64 --network mainnet`);
console.log(``);
console.log(`The simulator will catch the AccountNotFound preflight error before any fee is paid.`);
console.log(`For a SUCCESS panel, use scripts/generate-funded-test-tx.ts (devnet airdrop).`);
