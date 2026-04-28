// services/src/analysis/types.ts
import { ParsedTransactionWithMeta } from '@solana/web3.js';

/**
 * Represents the token balance of an account before or after a transaction.
 */
export interface TokenBalance {
  /** Index of the account in the transaction account list. */
  accountIndex: number;
  /** Mint address of the token. */
  mint: string;
  /** Owner of the token account, when available. */
  owner?: string;
  /** UI-friendly token amount with decimals and formatted value. */
  uiTokenAmount: {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
  };
}

/**
 * Represents a raw instruction extracted from a transaction.
 */
export interface RawInstruction {
  /** Index of the program that executed the instruction. */
  programIdIndex: number;
  /** Account indices used by the instruction. */
  accounts: number[];
  /** Encoded instruction data. */
  data: string;
}

/**
 * Represents inner instructions associated with a parent instruction.
 */
export interface InnerInstruction {
  /** Index of the parent instruction. */
  index: number;
  /** Inner instructions executed within the same context. */
  instructions: RawInstruction[];
}

/**
 * Raw transaction data bundle before any analysis.
 */
export interface RawTransactionBundle {
  /** Unique transaction signature. */
  signature: string;
  /** Slot where the transaction was confirmed. */
  slot: number;
  /** Block timestamp, or null if unavailable. */
  blockTime: number | null | undefined;
  /** Full transaction payload in versioned format. */
  transaction: unknown;
  /** Raw log messages emitted during execution. */
  logMessages: string[];
  /** SOL balances for accounts before execution. */
  preBalances: number[];
  /** SOL balances for accounts after execution. */
  postBalances: number[];
  /** Token balances before execution. */
  preTokenBalances: any[];
  /** Token balances after execution. */
  postTokenBalances: any[];
  /** Inner instructions reported by the transaction. */
  innerInstructions: any[];
  /** Total compute units consumed, when available. */
  computeUnitsConsumed: number | null;
  /** Execution error returned by the transaction, if any. */
  err: object | string | null;
  /** Account public keys included in the transaction. */
  accountKeys: any[];
  /** Raw Solana RPC response kept for debugging and advanced inspection. */
  rawResponse?: ParsedTransactionWithMeta;
}

/**
 * Parsed instruction with readable metadata for analysis.
 */
export interface ParsedInstruction {
  /** Program identifier invoked by the instruction. */
  programId: string;
  /** Friendly display name for the program. */
  programName: string;
  /** The name of the instruction, if it can be determined. */
  instructionName?: string;
  /** Account addresses used by the instruction. */
  accounts: string[];
  /** Original encoded instruction data. */
  data: string;
  /** Decoded instruction data, when available. */
  decodedData?: unknown;
  /** Compute units consumed by this instruction. */
  cuConsumed?: number;
  /** Correlation key used to match instruction nodes against CPI execution logs. */
  cuAttributionKey?: string;
  /** Confidence score for CU attribution in range [0, 1]. */
  cuAttributionConfidence?: number;
  /** Trace-order ordinal of the matched CPI node used for CU attribution. */
  cuAttributionTraceOrdinal?: number;
  /** Execution depth of this instruction in the CPI flow. */
  depth: number;
  /** Inner instructions nested inside this instruction. */
  innerInstructions: ParsedInstruction[];
  /** Pre-decoded instruction data from Solana RPC. */
  parsed?: {
    type: string;
    info?: Record<string, any>;
  };
}

/**
 * Decoded SPL Token instruction placeholder shape.
 */
export interface TokenInstruction {
  /** Human-readable instruction name (for example: transfer, mintTo). */
  instructionName: string;
  /** Source token account, when applicable. */
  source?: string;
  /** Destination token account, when applicable. */
  destination?: string;
  /** Token mint address, when applicable. */
  mint?: string;
  /** Authority account, when applicable. */
  authority?: string;
  /** Raw amount as string to avoid precision loss. */
  amount?: string;
  /** Token decimals, when applicable. */
  decimals?: number;
  /** Raw encoded instruction data. */
  rawData?: string;
}

/**
 * Decoded System Program instruction placeholder shape.
 */
export interface SystemInstruction {
  /** Human-readable instruction name (for example: transfer, createAccount). */
  instructionName: string;
  /** Source account public key, when applicable. */
  fromPubkey?: string;
  /** Destination account public key, when applicable. */
  toPubkey?: string;
  /** New account public key, when applicable. */
  newAccountPubkey?: string;
  /** Amount in lamports, when applicable. */
  lamports?: number;
  /** Space allocation in bytes, when applicable. */
  space?: number;
  /** Owner program id, when applicable. */
  owner?: string;
  /** Raw encoded instruction data. */
  rawData?: string;
}

/**
 * Parsed transaction containing instructions and execution metadata.
 */
export interface ParsedTransaction {
  /** Unique transaction signature. */
  signature: string;
  /** Slot where the transaction was confirmed. */
  slot: number;
  /** Block timestamp, or null if unavailable. */
  blockTime: number | null;
  /** Indicates whether the transaction succeeded. */
  success: boolean;
  /** Transaction fee charged for execution. */
  fee: number;
  /** Parsed instructions executed by the transaction. */
  instructions: ParsedInstruction[];
  /** CU attribution quality metrics used by comparators and insight generation. */
  cuAttribution?: CUAttributionMetrics;
}

/**
 * Quality and consistency metrics for CU-by-node attribution.
 */
export interface CUAttributionMetrics {
  /** Number of parsed instruction nodes considered for attribution. */
  totalNodes: number;
  /** Number of parsed nodes that received a CU value from execution logs. */
  matchedNodes: number;
  /** Number of parsed nodes that did not receive a CU value. */
  unmatchedNodes: number;
  /** Remaining CU entries in CPI logs that could not be mapped to parsed nodes. */
  unmatchedCUEntries: number;
  /** Number of keys where multiple nodes share the same programId and depth. */
  ambiguousKeys: number;
  /** Aggregated attribution confidence score in range [0, 1]. */
  confidence: number;
  /** Guard metric to detect accidental double attribution from the same CPI node. */
  doubleAttributionCount: number;
  /** Indicates if CPI logs were truncated while building the execution trace. */
  traceTruncated: boolean;
}

/**
 * Compute unit consumption entry for a specific instruction.
 */
export interface CUEntry {
  /** Program identifier responsible for the consumption. */
  programId: string;
  /** Friendly name of the program. */
  programName: string;
  /** Compute units consumed by the instruction. */
  cuConsumed: number;
  /** Compute units limit for this instruction or context. */
  cuLimit: number;
  /** Percentage of the allocated compute limit used. */
  utilizationPercent: number;
  /** Execution depth in the CPI tree. */
  depth: number;
}

/**
 * Aggregate compute unit consumption profile for a transaction.
 */
export interface CUProfile {
  /** Total compute units consumed. */
  totalConsumed: number;
  /** Total compute units limit available. */
  totalLimit: number;
  /** Overall compute unit utilization percentage. */
  utilizationPercent: number;
  /** Detailed consumption per instruction. */
  perInstruction: CUEntry[];
  /** Highest consumption bottleneck, when identified. */
  bottleneck: CUEntry | null;
}

/**
 * Node in the CPI tree representing a program call.
 */
export interface CPINode {
  /** Program identifier for the call. */
  programId: string;
  /** Friendly name of the program called. */
  programName: string;
  /** Depth of the node in the CPI tree. */
  depth: number;
  /** Status of the CPI call. */
  status: 'success' | 'failed';
  /** Compute units consumed by the call. */
  cuConsumed?: number;
  /** Child CPI calls nested under this call. */
  children: CPINode[];
}

/**
 * CPI call tree generated by transaction execution.
 */
export interface CPITree {
  /** Root nodes of the CPI tree. */
  root: CPINode[];
  /** Maximum depth of the CPI tree. */
  totalDepth: number;
  /** Total number of nodes in the CPI tree. */
  nodeCount: number;
}

/**
 * Represents the token changes caused by a transaction.
 */
export interface TokenDelta {
  /** Mint address of the affected token. */
  mint: string;
  /** Token symbol, when available. */
  symbol?: string;
  /** Token decimals. */
  decimals: number;
  /** Raw token delta amount. */
  rawDelta: string;
  /** Formatted token delta for display. */
  uiDelta: number;
}

/**
 * Account balance and token changes resulting from a transaction.
 */
export interface AccountDiff {
  /** Affected account public key. */
  pubkey: string;
  /** Role of the account in the transaction. */
  role: 'signer' | 'writable' | 'readonly';
  /** SOL balance delta caused by the transaction. */
  solDelta: number;
  /** Token changes associated with the account. */
  tokenDeltas: TokenDelta[];
}

/**
 * A parsed log entry used for transaction analysis.
 */
export interface LogEntry {
  /** Original log text. */
  raw: string;
  /** Categorized log type. */
  type: 'invoke' | 'success' | 'failed' | 'cu' | 'msg' | 'data' | 'unknown';
  /** Program associated with the log, when identified. */
  programId?: string;
  /** Execution depth related to the log. */
  depth?: number;
  /** Interpreted log message, if available. */
  message?: string;
}

/**
 * Program-specific grouped logs for analysis.
 */
export interface ProgramLog {
  /** Identifier of the program that produced the logs. */
  programId: string;
  /** Friendly name of the program. */
  programName: string;
  /** Log entries associated with the program. */
  entries: LogEntry[];
  /** Compute units consumed by the program, when known. */
  cuConsumed?: number;
}

/**
 * Structured parsed logs for a transaction.
 */
export interface ParsedLogs {
  /** Raw log lines emitted by transaction execution, when preserved. */
  raw?: string[];
  /** Parsed log entries extracted from the logs, when available. */
  entries?: LogEntry[];
  /** Logs grouped by program. */
  byProgram: Record<string, any>;
  /** Error messages identified during parsing. */
  errors: string[];
  /** Total number of log lines processed. */
  totalLines: number;
}

/**
 * Transfer detected in a transaction (SOL or SPL token).
 */
export interface TransferInfo {
  /** Sender account address. Empty string when direction is inbound. */
  from: string;
  /** Receiver account address. Empty string when direction is outbound. */
  to: string;
  /** Raw transfer amount as string to avoid precision loss. */
  amount: string;
  /** Token mint address, or 'SOL' for native transfers. */
  token: string;
  /** Token decimals. */
  decimals: number;
  /** Human-readable transfer amount. */
  uiAmount: number;
  /** USD value of the transfer, null when price is unavailable. */
  usdValue: number | null;
  /** Whether this transfer shows spam heuristic signals. */
  isSpamSuspect: boolean;
}

/**
 * Compute unit execution cost broken down in lamports, SOL and USD.
 */
export interface CUCost {
  /** Total compute units consumed. */
  cuConsumed: number;
  /** Micro-lamports per compute unit used for fee calculation. */
  microLamportsPerCU: number;
  /** Total fee in lamports: cu_consumed * micro_lamports_per_cu / 1_000_000 */
  feeLamports: number;
  /** Total fee in SOL. */
  feeSOL: number;
  /** Total fee in USD. Null when SOL price is unavailable. */
  feeUSD: number | null;
}

/**
 * Represents the cost breakdown of a transaction in different units.
 * Values are calculated from CU consumption using the fee formula:
 * fee_lamports = (cu_consumed × micro_lamports_per_cu) / 1_000_000
 */
export interface CUCost {
  cuConsumed: number;
  microLamportsPerCU: number;
  feeLamports: number;
  feeSOL: number;
  feeUSD: number | null;
}

/**
 * Complete analysis result for a transaction.
 */
export interface AnalyzedTransaction {
  success: any;
  signature: any;
  /** Original raw transaction data. */
  raw: RawTransactionBundle;
  /** Parsed and structured transaction data. */
  parsed: ParsedTransaction;
  /** Compute unit consumption profile. */
  cuProfile: CUProfile;
  /** Cost breakdown in lamports, SOL, and USD. */
  cuCost?: CUCost;
  /** CPI call tree representation. */
  cpiTree: CPITree;
  /** Account differences identified in the transaction. */
  accountDiffs: AccountDiff[];
  /** Parsed logs for the transaction. */
  logs: ParsedLogs;
  /** CU execution cost in lamports, SOL and USD. */
  cuCost?: CUCost;
  /** Transfers detected in the transaction. */
  transfers?: TransferInfo[];
  /** Detected transaction type, when available. */
  txType?: string;
}

/**
 * Code suggestion for optimizing the transaction.
 */
export interface CodeSuggestion {
  /** Description of the suggested optimization. */
  description: string;
  /** Estimated compute unit savings from this suggestion. */
  estimatedSavingsCU?: number;
  /** Code snippet demonstrating the optimization. */
  codeSnippet?: string;
}

/**
 * Insight generated from transaction analysis.
 */
export interface Insight {
  type: string;
  /** Severity of the insight. */
  severity: 'critical' | 'warning' | 'info';
  /** Short title for the insight. */
  title: string;
  /** Full description of the insight. */
  message: string;
  /** Recommended action for the insight. */
  recommendation: string;
  /** Contextual data for advanced debugging */
  context?: Record<string, any>;
  /** Category tags for filtering */
  tags?: string[];
  /** Estimated compute unit savings, if applicable. */
  estimatedCUSavings?: number;
  /** Associated program identifier, when available. */
  programId?: string;
  /** Source of the insight. */
  source: 'rule' | 'mcp' | 'hybrid';
  /** Code suggestions for optimization. */
  codeSuggestions: CodeSuggestion[];
}

/**
 * Aggregated insight report for the transaction.
 */
export interface InsightReport {
  /** Primary insight or bottleneck identified. */
  primaryBottleneck: Insight | null;
  /** List of insights collected from the analysis. */
  insights: Insight[];
  /** Total estimated compute unit savings. */
  totalEstimatedSavings: number;
}

/**
 * Context passed to insight providers for generating insights.
 */
export interface InsightContext {
  /** The analyzed transaction data. */
  transaction: AnalyzedTransaction;
}

/**
 * Provider insight with source information.
 */
export interface ProviderInsight {
  /** The insight data. */
  insight: Insight;
  /** Source of the insight. */
  source: 'rule' | 'mcp';
}

/**
 * Interface for insight providers that can generate insights from transaction context.
 */
export interface InsightProvider {
  /** Fetches insights from the provider. */
  fetchInsights(context: InsightContext): Promise<ProviderInsight[]>;
}

/**
 * Supported command-line interface options.
 */
export interface CLIOptions {
  /** Transaction signature used as input. */
  signature: string;
  /** Network where the transaction will be analyzed. */
  network: 'mainnet' | 'devnet';
  /** Optional custom RPC URL. */
  rpcUrl?: string;
  /** Whether output should be formatted as JSON. */
  json: boolean;
  /** Enable verbose debug output. */
  verbose: boolean;
  /** Optional output path for generated files. */
  output?: string;
}
