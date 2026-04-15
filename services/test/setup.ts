import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type {
  AccountDiff,
  RawInstruction,
  RawTransactionBundle,
  TokenBalance,
} from "../src/analysis/types";

const __filename = fileURLToPath(import.meta.url);
const FIXTURE_DIR = path.resolve(path.dirname(__filename), "../tests/fixtures");
const LOG_FIXTURE_DIR = path.resolve(FIXTURE_DIR, "logs");

const DEFAULT_SENDER = "2zoF11B7hBLMRS4Q95x9vXk4T7aQk1h1Y6nF5BLse2dS";
const DEFAULT_RECIPIENT = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgG8n28kPZL7";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SPL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Creates a reusable mock Solana instruction payload.
 */
export function createMockInstruction(
  programIdIndex = 0,
  accounts: number[] = [0, 1],
  data = "3BxsqK7ZV4Q"
): RawInstruction {
  return {
    programIdIndex,
    accounts,
    data,
  };
}

/**
 * Creates a reusable account difference object for analysis tests.
 */
export function createMockAccountDiff(
  overrides: Partial<AccountDiff> = {}
): AccountDiff {
  return {
    pubkey: DEFAULT_RECIPIENT,
    role: "writable",
    solDelta: -1200,
    tokenDeltas: [],
    ...overrides,
  };
}

/**
 * Returns a realistic mock log sequence for common Solana transaction scenarios.
 */
export function createMockLogMessages(
  type: "success" | "failed" | "high-cu" | "deep-cpi"
): string[] {
  const logs = {
    success: [
      `Program ${SYSTEM_PROGRAM} invoke [1]`,
      `Program ${SYSTEM_PROGRAM} success`,
    ],
    failed: [
      "Program 5P1hRzb17urFFM2Eb6ZQDsnsD5qs9g9YnF2AVEv6GDh9 invoke [1]",
      "Program 5P1hRzb17urFFM2Eb6ZQDsnsD5qs9g9YnF2AVEv6GDh9 consumed 56317 of 200000 compute units",
      "Program 5P1hRzb17urFFM2Eb6ZQDsnsD5qs9g9YnF2AVEv6GDh9 failed: custom program error: 0xb",
    ],
    "high-cu": [
      `Program ${SYSTEM_PROGRAM} invoke [1]`,
      `Program ${SYSTEM_PROGRAM} consumed 199500 of 200000 compute units`,
      `Program ${SYSTEM_PROGRAM} success`,
    ],
    "deep-cpi": [
      `Program ${SYSTEM_PROGRAM} invoke [1]`,
      `Program ${TOKEN_PROGRAM} invoke [2]`,
      "Program 3PAwBZx5yK3XbXyTAqvH9Y3ontQ3uHa4oWFr95Sk8kGh invoke [3]",
      "Program 3PAwBZx5yK3XbXyTAqvH9Y3ontQ3uHa4oWFr95Sk8kGh success",
      `Program ${TOKEN_PROGRAM} success`,
      `Program ${SYSTEM_PROGRAM} success`,
    ],
  } as const;

  return [...logs[type]];
}

/**
 * Builds a mock RPC response payload compatible with the service analyzer.
 */
export function createMockRPCResponse(
  overrides: Partial<RawTransactionBundle> = {}
): RawTransactionBundle {
  return {
    signature:
      "5iH2k7QkY5ZWm9shBnjmawHq4sM7hDuBdTN5xMNciVurFdJ6GqWfx4mL1ygFXQ4ht4FQX7xM7A4VJbzTRd5C4E1iX",
    slot: 1_234_567,
    blockTime: 1740000000,
    transaction: {
      signatures: [
        "5iH2k7QkY5ZWm9shBnjmawHq4sM7hDuBdTN5xMNciVurFdJ6GqWfx4mL1ygFXQ4ht4FQX7xM7A4VJbzTRd5C4E1iX",
      ],
      message: {
        accountKeys: [DEFAULT_SENDER, DEFAULT_RECIPIENT, SYSTEM_PROGRAM],
        instructions: [createMockInstruction()],
      },
    },
    logMessages: createMockLogMessages("success"),
    preBalances: [1_000_000_000, 500_000_000, 1_000_000_000],
    postBalances: [999_900_000, 500_100_000, 1_000_000_000],
    preTokenBalances: [],
    postTokenBalances: [],
    innerInstructions: [],
    computeUnitsConsumed: 120,
    err: null,
    accountKeys: [DEFAULT_SENDER, DEFAULT_RECIPIENT, SYSTEM_PROGRAM],
    ...overrides,
  };
}

/**
 * Loads a transaction fixture from services/tests/fixtures.
 */
export function loadFixture(name: string): RawTransactionBundle {
  const filePath = path.resolve(FIXTURE_DIR, `${name}.json`);
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as RawTransactionBundle;
}

/**
 * Loads a named log fixture from services/tests/fixtures/logs.
 */
export function loadLogFixture(name: string): string[] {
  const filePath = path.resolve(LOG_FIXTURE_DIR, `${name}.json`);
  const content = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(content) as string[];
}

/**
 * Saves a JSON fixture under services/tests/fixtures for reuse.
 */
export function saveFixture(name: string, data: unknown): void {
  const filePath = path.resolve(FIXTURE_DIR, `${name}.json`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export const MOCK_SIMPLE_TRANSFER = createMockRPCResponse({
  signature: "5mZ8H54EQcPgZFa3sPHEHgxT5xRK6x6aHk3v1j3yhoQuZc4jAfiHn1qJpM9rN9//example",
  slot: 1_500_000,
  logMessages: createMockLogMessages("success"),
  preBalances: [1_000_000_000, 500_000_000, 1_000_000_000],
  postBalances: [999_900_000, 500_100_000, 1_000_000_000],
});

export const MOCK_SPL_TRANSFER = createMockRPCResponse({
  signature: "9kR6Y3cT8tHhP2G5qLRf1Ww5M3zJNzr2F6SqyA4HsG5PmB8uC9dZ7vXjKfL9eT5yU0",
  slot: 1_500_200,
  transaction: {
    signatures: [
      "9kR6Y3cT8tHhP2G5qLRf1Ww5M3zJNzr2F6SqyA4HsG5PmB8uC9dZ7vXjKfL9eT5yU0",
    ],
    message: {
      accountKeys: [
        DEFAULT_SENDER,
        "H3H1xy5uDP9Qc8Hw9V5aQF6SFTst6Z5Qfe7ushKuCUtL",
        TOKEN_PROGRAM,
        SPL_MINT,
      ],
      instructions: [
        createMockInstruction(2, [0, 1, 2, 3], "6nG1wX8kPqY"),
      ],
    },
  },
  logMessages: [
    `Program ${TOKEN_PROGRAM} invoke [1]`,
    `Program ${TOKEN_PROGRAM} success`,
  ],
  preBalances: [1_000_000_000, 1_000_000_000, 1_000_000_000, 1_000_000_000],
  postBalances: [999_990_000, 1_000_000_000, 1_000_000_000, 1_000_000_000],
  preTokenBalances: [
    {
      accountIndex: 1,
      mint: SPL_MINT,
      owner: DEFAULT_RECIPIENT,
      uiTokenAmount: {
        amount: "500000",
        decimals: 6,
        uiAmount: 0.5,
        uiAmountString: "0.5",
      },
    },
  ],
  postTokenBalances: [
    {
      accountIndex: 1,
      mint: SPL_MINT,
      owner: DEFAULT_RECIPIENT,
      uiTokenAmount: {
        amount: "499000",
        decimals: 6,
        uiAmount: 0.499,
        uiAmountString: "0.499",
      },
    },
  ],
  accountKeys: [
    DEFAULT_SENDER,
    "H3H1xy5uDP9Qc8Hw9V5aQF6SFTst6Z5Qfe7ushKuCUtL",
    TOKEN_PROGRAM,
    SPL_MINT,
  ],
});

export const MOCK_FAILED_TX = createMockRPCResponse({
  signature: "8fH3c2LwJ6pZ4dXk1sN8aG5eV9qM7uR2yB1xC6tWjUoP3mE4nR7vA9cZzX5yJ0wK1",
  slot: 1_500_300,
  logMessages: createMockLogMessages("failed"),
  computeUnitsConsumed: 56_317,
  err: { InstructionError: [0, { Custom: 11 }] },
  preBalances: [1_000_000_000, 1_000_000_000],
  postBalances: [1_000_000_000, 1_000_000_000],
  transaction: {
    signatures: [
      "8fH3c2LwJ6pZ4dXk1sN8aG5eV9qM7uR2yB1xC6tWjUoP3mE4nR7vA9cZzX5yJ0wK1",
    ],
    message: {
      accountKeys: [DEFAULT_SENDER, DEFAULT_RECIPIENT, SYSTEM_PROGRAM],
      instructions: [createMockInstruction()],
    },
  },
  accountKeys: [DEFAULT_SENDER, DEFAULT_RECIPIENT, SYSTEM_PROGRAM],
});

export const MOCK_HIGH_CU_TX = createMockRPCResponse({
  signature: "7uR8wF2kX3bL9tP1nM4cV6jZ5qA8sY0hB2mD6oK9pJ3rF2sX8yC1tV7gN4eL5uH0",
  slot: 1_500_400,
  logMessages: createMockLogMessages("high-cu"),
  computeUnitsConsumed: 199_500,
  transaction: {
    signatures: [
      "7uR8wF2kX3bL9tP1nM4cV6jZ5qA8sY0hB2mD6oK9pJ3rF2sX8yC1tV7gN4eL5uH0",
    ],
    message: {
      accountKeys: [DEFAULT_SENDER, DEFAULT_RECIPIENT, SYSTEM_PROGRAM],
      instructions: [createMockInstruction()],
    },
  },
  accountKeys: [DEFAULT_SENDER, DEFAULT_RECIPIENT, SYSTEM_PROGRAM],
});

export const MOCK_DEEP_CPI_TX = createMockRPCResponse({
  signature: "2vY6J1cR8nW4tK5xM9zE3sQ7pL0aF2hU6bD8yT1gP7kN4wS5uZ0cM3qR9eX1tV8",
  slot: 1_500_500,
  logMessages: createMockLogMessages("deep-cpi"),
  computeUnitsConsumed: 178_900,
  transaction: {
    signatures: [
      "2vY6J1cR8nW4tK5xM9zE3sQ7pL0aF2hU6bD8yT1gP7kN4wS5uZ0cM3qR9eX1tV8",
    ],
    message: {
      accountKeys: [DEFAULT_SENDER, DEFAULT_RECIPIENT, TOKEN_PROGRAM, SYSTEM_PROGRAM],
      instructions: [createMockInstruction(2, [0, 1, 2], "4KzN9tRx")],
    },
  },
  innerInstructions: [
    {
      index: 0,
      instructions: [createMockInstruction(2, [0, 1, 2], "7YxP4nQ")],
    },
    {
      index: 1,
      instructions: [createMockInstruction(3, [1, 2], "8UqT2mW")],
    },
  ],
  accountKeys: [DEFAULT_SENDER, DEFAULT_RECIPIENT, TOKEN_PROGRAM, SYSTEM_PROGRAM],
});
