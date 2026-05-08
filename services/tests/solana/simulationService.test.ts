import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  Transaction,
  PublicKey,
} from '@solana/web3.js';

import * as connectionModule from '../../src/solana/connection';
import { detectInputKind, simulateTransactionInput } from '../../src/solana/simulationService';

const DUMMY_BLOCKHASH = '11111111111111111111111111111111';

function buildSampleVersionedTx(payer: Keypair, recipient: Keypair): VersionedTransaction {
  const ix = SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: recipient.publicKey,
    lamports: 1_000_000,
  });
  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: DUMMY_BLOCKHASH,
    instructions: [ix],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  return tx;
}

function buildSampleLegacyTx(payer: Keypair, recipient: Keypair): Transaction {
  const tx = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: DUMMY_BLOCKHASH,
  }).add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey: recipient.publicKey,
      lamports: 1_000_000,
    })
  );
  tx.sign(payer);
  return tx;
}

function fakeSimResponse(overrides: Partial<any> = {}) {
  return {
    context: { slot: 12345 },
    value: {
      err: null,
      logs: ['Program 11111111111111111111111111111111 invoke [1]'],
      unitsConsumed: 150,
      accounts: null,
      returnData: null,
      innerInstructions: [],
      ...overrides,
    },
  };
}

function makeFakeConnection(simResponse: any = fakeSimResponse(), preAccounts: any[] = []) {
  return {
    simulateTransaction: vi.fn().mockResolvedValue(simResponse),
    getMultipleAccountsInfo: vi.fn().mockResolvedValue(preAccounts),
  } as any;
}

describe('simulationService - detectInputKind', () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-sim-'));
    tmpFile = path.join(tmpDir, 'tx.b64');
    fs.writeFileSync(tmpFile, 'AQABAg==', 'utf-8');
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('detects a base64 transaction blob', () => {
    const b64 = Buffer.from('hello world transaction bytes here').toString('base64');
    expect(detectInputKind(b64)).toBe('base64');
  });

  it('detects an existing file path', () => {
    expect(detectInputKind(tmpFile)).toBe('path');
  });

  it('rejects an 88-char base58 signature pointing to `open tx`', () => {
    const sig = '4'.repeat(88);
    expect(() => detectInputKind(sig)).toThrow(/open tx <signature>/);
  });

  it('rejects an 87-char base58 signature with same guidance', () => {
    const sig = '5'.repeat(87);
    expect(() => detectInputKind(sig)).toThrow(/open tx <signature>/);
  });

  it('throws on input that is neither path nor base64', () => {
    expect(() => detectInputKind('!!! invalid @@@')).toThrow(/Unable to detect input kind/);
  });

  it('throws on empty input', () => {
    expect(() => detectInputKind('')).toThrow();
  });
});

describe('simulationService - simulateTransactionInput', () => {
  let tmpDir: string;
  let payer: Keypair;
  let recipient: Keypair;
  let versionedB64: string;
  let legacyB64: string;
  let pathFile: string;
  let pathFileJson: string;
  let pathFileJsonTxField: string;
  let pathFileInvalid: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-sim-flow-'));
    payer = Keypair.generate();
    recipient = Keypair.generate();

    const vtx = buildSampleVersionedTx(payer, recipient);
    versionedB64 = Buffer.from(vtx.serialize()).toString('base64');

    const ltx = buildSampleLegacyTx(payer, recipient);
    legacyB64 = Buffer.from(
      ltx.serialize({ requireAllSignatures: false, verifySignatures: false })
    ).toString('base64');

    pathFile = path.join(tmpDir, 'raw.b64');
    fs.writeFileSync(pathFile, versionedB64, 'utf-8');

    pathFileJson = path.join(tmpDir, 'wrapped-transaction.json');
    fs.writeFileSync(pathFileJson, JSON.stringify({ transaction: versionedB64 }), 'utf-8');

    pathFileJsonTxField = path.join(tmpDir, 'wrapped-tx.json');
    fs.writeFileSync(pathFileJsonTxField, JSON.stringify({ tx: versionedB64 }), 'utf-8');

    pathFileInvalid = path.join(tmpDir, 'garbage.json');
    fs.writeFileSync(pathFileInvalid, '{"unrelated":"value"}', 'utf-8');
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('processes a base64 versioned transaction end-to-end', async () => {
    const fakeConn = makeFakeConnection(fakeSimResponse());
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(fakeConn);
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const out = await simulateTransactionInput(versionedB64, { network: 'devnet' });

    expect(out.bundle.signature).toMatch(/^SIM-[a-f0-9]{16}$/);
    expect(out.bundle.slot).toBe(12345);
    expect(out.bundle.computeUnitsConsumed).toBe(150);
    expect(out.bundle.logMessages.length).toBeGreaterThan(0);
    expect(out.bundle.accountKeys.length).toBeGreaterThan(0);
    expect(out.meta.inputKind).toBe('base64');
    expect(out.meta.success).toBe(true);
    expect(out.meta.errorJson).toBeNull();
    expect(out.meta.isSimulated).toBe(true);
    expect(fakeConn.simulateTransaction).toHaveBeenCalledOnce();
  });

  it('processes a legacy (non-versioned) transaction', async () => {
    const fakeConn = makeFakeConnection(fakeSimResponse());
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(fakeConn);
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const out = await simulateTransactionInput(legacyB64, { network: 'mainnet' });

    expect(out.bundle.transaction).toBeDefined();
    expect(out.bundle.accountKeys.length).toBeGreaterThan(0);
  });

  it('reads from a raw base64 file path', async () => {
    const fakeConn = makeFakeConnection(fakeSimResponse());
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(fakeConn);
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const out = await simulateTransactionInput(pathFile);
    expect(out.meta.inputKind).toBe('path');
    expect(out.bundle.computeUnitsConsumed).toBe(150);
  });

  it('reads from a JSON file with {transaction} field', async () => {
    const fakeConn = makeFakeConnection(fakeSimResponse());
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(fakeConn);
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const out = await simulateTransactionInput(pathFileJson);
    expect(out.meta.inputKind).toBe('path');
  });

  it('reads from a JSON file with {tx} field', async () => {
    const fakeConn = makeFakeConnection(fakeSimResponse());
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(fakeConn);
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const out = await simulateTransactionInput(pathFileJsonTxField);
    expect(out.meta.inputKind).toBe('path');
  });

  it('throws when file is JSON but has no recognized base64 field', async () => {
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(makeFakeConnection());
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    await expect(simulateTransactionInput(pathFileInvalid)).rejects.toThrow(
      /does not contain a valid base64 transaction/
    );
  });

  it('throws when base64 deserialization fails', async () => {
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(makeFakeConnection());
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const garbage = Buffer.from('not a real transaction').toString('base64');
    await expect(simulateTransactionInput(garbage)).rejects.toThrow(/Failed to deserialize/);
  });

  it('reports WOULD FAIL when simulation returns an error', async () => {
    const errorSim = fakeSimResponse({
      err: 'AccountNotFound',
      logs: [],
      unitsConsumed: 0,
    });
    const fakeConn = makeFakeConnection(errorSim);
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(fakeConn);
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const out = await simulateTransactionInput(versionedB64);
    expect(out.meta.success).toBe(false);
    expect(out.meta.errorJson).toBe('"AccountNotFound"');
    expect(out.bundle.err).toBe('AccountNotFound');
  });

  it('captures returnData when simulation provides it', async () => {
    const withReturn = fakeSimResponse({
      returnData: {
        programId: '11111111111111111111111111111111',
        data: ['SGVsbG8=', 'base64'],
      },
    });
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(makeFakeConnection(withReturn));
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const out = await simulateTransactionInput(versionedB64);
    expect(out.meta.returnData).toEqual({
      programId: '11111111111111111111111111111111',
      data: 'SGVsbG8=',
    });
  });

  it('builds account changes from pre+post account snapshots', async () => {
    const accountKeys = (
      VersionedTransaction.deserialize(Buffer.from(versionedB64, 'base64')).message
        .staticAccountKeys ?? []
    ).map((k) => k.toBase58());

    const preAccounts = accountKeys.map((_, i) =>
      i === 0
        ? { lamports: 5_000_000, owner: new PublicKey('11111111111111111111111111111111') }
        : null
    );

    const post = accountKeys.map((_, i) => ({
      lamports: i === 0 ? 4_000_000 : 1_000_000,
      owner: '11111111111111111111111111111111',
      data: ['', 'base64'] as [string, string],
      executable: false,
      rentEpoch: 0,
    }));

    const withAccounts = fakeSimResponse({ accounts: post });
    const fakeConn = makeFakeConnection(withAccounts, preAccounts);
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(fakeConn);
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const out = await simulateTransactionInput(versionedB64);
    expect(out.meta.accountChanges.length).toBe(accountKeys.length);
    expect(out.meta.accountChanges[0].lamportsBefore).toBe(5_000_000);
    expect(out.meta.accountChanges[0].lamportsAfter).toBe(4_000_000);
    expect(out.bundle.preBalances[0]).toBe(5_000_000);
    expect(out.bundle.postBalances[0]).toBe(4_000_000);
  });

  it('maps innerInstructions returned by the RPC into the bundle', async () => {
    const inner = [
      {
        index: 0,
        instructions: [
          { programIdIndex: 1, accounts: [0, 2], data: 'AQID' },
          { programIdIndex: 2, accounts: [], data: '' },
        ],
      },
    ];
    const sim = fakeSimResponse({ innerInstructions: inner });
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(makeFakeConnection(sim));
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const out = await simulateTransactionInput(versionedB64);
    expect(out.bundle.innerInstructions).toHaveLength(1);
    expect((out.bundle.innerInstructions[0] as any).instructions).toHaveLength(2);
  });

  it('falls back gracefully when getMultipleAccountsInfo throws', async () => {
    const fakeConn = {
      simulateTransaction: vi.fn().mockResolvedValue(fakeSimResponse()),
      getMultipleAccountsInfo: vi.fn().mockRejectedValue(new Error('rpc down')),
    } as any;
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(fakeConn);
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const out = await simulateTransactionInput(versionedB64);
    expect(out.bundle.preBalances.every((b) => b === 0)).toBe(true);
  });

  it('produces deterministic SIM-<hash> signature for the same input', async () => {
    const fakeConn = makeFakeConnection(fakeSimResponse());
    vi.spyOn(connectionModule, 'getConnection').mockReturnValue(fakeConn);
    vi.spyOn(connectionModule, 'withRetry').mockImplementation(((fn: any) => fn()) as any);

    const a = await simulateTransactionInput(versionedB64);
    const b = await simulateTransactionInput(versionedB64);
    expect(a.bundle.signature).toBe(b.bundle.signature);
    expect(a.bundle.signature.startsWith('SIM-')).toBe(true);
  });
});
