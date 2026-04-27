import chalk from 'chalk';
import Table from 'cli-table3';
import { AnalyzedTransaction, InsightReport, AccountDiff, TransferInfo, CUCost } from '../../../../services/src';
import { buildCPITree, type ExecutionSnapshot, type ExecutionTrace } from '../../../../services/src/analysis/cpiTreeBuilder';
 
const WIDTH = 145;
 
// ─── HELPERS ────────────────────────────────────────────────────────────────
 
const truncate = (str: string, start = 8, end = 8) => {
  if (!str) return 'N/A';
  if (str.length <= start + end) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
};
 
const truncatePubkey = (pubkey: string) => {
  if (!pubkey) return 'unknown';
  return pubkey.slice(0, 4) + '...' + pubkey.slice(-4);
};
 
const formatSol = (lamports: number) => {
  if (!lamports) return '0';
  const sol = lamports / 1_000_000_000;
  const value = sol.toFixed(6);
  if (sol > 0) return chalk.green(`+${value}`);
  if (sol < 0) return chalk.red(value);
  return value;
};
 
const formatToken = (tokenDeltas: any[]) => {
  if (!tokenDeltas || tokenDeltas.length === 0) return '—';
  return tokenDeltas.map((token) => {
    const amount = Number(token.delta || 0);
    const symbol = token.symbol || 'TOKEN';
    if (amount > 0) return chalk.green(`+${amount} ${symbol}`);
    if (amount < 0) return chalk.red(`${amount} ${symbol}`);
    return `${amount} ${symbol}`;
  }).join(', ');
};
 
const line = (char = '─') => char.repeat(WIDTH);
 
type CPINodeView = {
  programId: string;
  programName?: string;
  depth?: number;
  status: 'success' | 'failed' | 'truncated';
  cuConsumed?: number;
  children?: CPINodeView[];
};
 
type BottleneckTarget = {
  programId: string;
  cuConsumed: number;
  depth?: number;
};
 
function toNodeViewFromTrace(snapshot: ExecutionSnapshot): CPINodeView {
  return {
    programId: snapshot.programId,
    programName: snapshot.programId,
    depth: snapshot.depth,
    status: snapshot.status,
    cuConsumed: snapshot.computeUnitsConsumed,
    children: snapshot.children.map(toNodeViewFromTrace),
  };
}
 
function resolveExecutionTrace(analyzed: AnalyzedTransaction): ExecutionTrace | null {
  const rawLogs = (analyzed as any)?.raw?.logMessages;
  if (Array.isArray(rawLogs) && rawLogs.length > 0) {
    return buildCPITree(rawLogs);
  }
  return null;
}
 
function collectBottleneckTarget(analyzed: AnalyzedTransaction): BottleneckTarget | null {
  const profileProgram = (analyzed as any)?.cuProfile?.bottleneck?.programId;
  const profileCU = (analyzed as any)?.cuProfile?.bottleneck?.cuConsumed;
  if (typeof profileProgram === 'string' && !profileProgram.toLowerCase().includes('unknown')) {
    return {
      programId: profileProgram,
      cuConsumed: typeof profileCU === 'number' ? profileCU : 0,
    };
  }
 
  const trace = resolveExecutionTrace(analyzed);
  if (!trace) return null;
 
  let bestTarget: BottleneckTarget | null = null;
  let maxCU = -1;
 
  const visit = (node: ExecutionSnapshot) => {
    const nodeCU = node.computeUnitsConsumed ?? -1;
    if (nodeCU > maxCU) {
      maxCU = nodeCU;
      bestTarget = { programId: node.programId, cuConsumed: nodeCU, depth: node.depth };
    }
    for (const child of node.children) visit(child);
  };
 
  for (const root of trace.roots) visit(root);
  return bestTarget;
}
 
export function buildCPITreeVisualLines(
  nodes: CPINodeView[],
  bottleneckTarget: BottleneckTarget | null,
  prefix = '',
  isRoot = true,
  bottleneckState = { consumed: false }
): string[] {
  const output: string[] = [];
 
  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const connector = isRoot ? '' : isLast ? '└── ' : '├── ';
    const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
 
    const isFailed = node.status === 'failed' || node.status === 'truncated';
    const matchesBottleneck =
      bottleneckTarget !== null &&
      !bottleneckState.consumed &&
      node.programId === bottleneckTarget.programId &&
      (node.cuConsumed ?? 0) === bottleneckTarget.cuConsumed &&
      (bottleneckTarget.depth === undefined || node.depth === bottleneckTarget.depth);
 
    if (matchesBottleneck) bottleneckState.consumed = true;
 
    const tags: string[] = [];
    if (matchesBottleneck) tags.push('BOTTLENECK');
    if (node.status === 'failed') tags.push('FAILED');
    if (node.status === 'truncated') tags.push('TRUNCATED');
 
    const icon = isFailed ? '✗' : '✓';
    const cu = (node.cuConsumed ?? 0).toLocaleString();
    const name = node.programName || node.programId || 'Unknown Program';
    const tagsChunk = tags.length > 0 ? ` [${tags.join('][')}]` : '';
 
    output.push(`${prefix}${connector}${icon} ${name} (${cu} CU)${tagsChunk}`);
 
    if (node.children && node.children.length > 0) {
      output.push(...buildCPITreeVisualLines(node.children, bottleneckTarget, childPrefix, false, bottleneckState));
    }
  });
 
  return output;
}
 
// ─── HEADER ─────────────────────────────────────────────────────────────────
 
const renderHeader = (
  signature: string,
  success: boolean,
  slot: number,
  fee: number | undefined,
  network: string
) => {
  const statusText = success ? chalk.green('SUCCESS') : chalk.red('FAILED');
  const statusColor = success ? chalk.green : chalk.red;
  const networkLabel = chalk.bgBlue.white(` ${network.toUpperCase()} `);
  const slotLabel = chalk.bgGray.white(` SLOT: ${slot || 'N/A'} `);
  const displayFee = fee !== undefined ? (fee / 1e9).toFixed(6) : 'N/A';
 
  console.log('');
  console.log(`  ${chalk.cyan.bold('OPEN INSIGHT [CLI v0.1.0]')}   ${networkLabel} ${slotLabel}`);
  console.log(`  ${statusColor('╭' + line('─') + '╮')}`);
  console.log(`  ${statusColor('│')} ${chalk.bold('SIGNATURE:')} ${truncate(signature, 16, 16)}   ${statusText}`.padEnd(WIDTH + 12) + `  ${statusColor('│')}`);
  console.log(`  ${statusColor('│')}`.padEnd(WIDTH + 5) + `  ${statusColor('│')}`);
  console.log(`  ${statusColor('│')} ${chalk.gray(`TRANSACTION FEE: ${displayFee} SOL`)}`.padEnd(WIDTH + 12) + `  ${statusColor('│')}`);
  console.log(`  ${statusColor('╰' + line('─') + '╯')}`);
};
 
// ─── CU COST ─────────────────────────────────────────────────────────────────
 
const renderCUCost = (cuCost: CUCost | undefined) => {
  console.log('');
  console.log(`  ┌${line('─')}┐`);
  console.log(`  │ ${chalk.cyan.bold('CU EXECUTION COST')}`.padEnd(WIDTH + 9) + '  │');
  console.log(`  │`.padEnd(WIDTH + 4) + '  │');
 
  if (!cuCost || cuCost.cuConsumed === 0) {
    console.log(`  │ ${chalk.gray('[ No CU cost data available ]')}`.padEnd(WIDTH + 12) + '  │');
  } else {
    const priorityLabel = cuCost.microLamportsPerCU > 0
      ? chalk.yellow(`${cuCost.microLamportsPerCU.toLocaleString()} µL/CU`)
      : chalk.gray('no priority fee');
 
    const feeSOLStr = cuCost.feeSOL.toFixed(9);
    const feeUSDStr = cuCost.feeUSD !== null
      ? chalk.green(`$${cuCost.feeUSD.toFixed(6)}`)
      : chalk.gray('USD N/A');
 
    console.log(`  │  ${chalk.white('CU Consumed:')}   ${chalk.cyan(cuCost.cuConsumed.toLocaleString())} CU`.padEnd(WIDTH + 12) + '  │');
    console.log(`  │  ${chalk.white('Priority Fee:')}  ${priorityLabel}`.padEnd(WIDTH + 12) + '  │');
    console.log(`  │  ${chalk.white('Fee:')}           ${chalk.yellow(cuCost.feeLamports.toLocaleString())} lamports  ·  ${chalk.yellow(feeSOLStr)} SOL  ·  ${feeUSDStr}`.padEnd(WIDTH + 12) + '  │');
  }
 
  console.log(`  └${line('─')}┘`);
};
 
// ─── TRANSFER BREAKDOWN ──────────────────────────────────────────────────────
 
const renderTransferBreakdown = (transfers: TransferInfo[] | undefined) => {
  console.log('');
  console.log(`  ┌${line('─')}┐`);
  console.log(`  │ ${chalk.cyan.bold('TRANSFER BREAKDOWN')}`.padEnd(WIDTH + 9) + '  │');
  console.log(`  │`.padEnd(WIDTH + 4) + '  │');
 
  if (!transfers || transfers.length === 0) {
    console.log(`  │ ${chalk.gray('[ No transfers detected ]')}`.padEnd(WIDTH + 12) + '  │');
    console.log(`  └${line('─')}┘`);
    return;
  }
 
  console.log(`  └${line('─')}┘`);
 
  const table = new Table({
    head: [
      chalk.white('From'),
      chalk.white('To'),
      chalk.white('Amount'),
      chalk.white('Token'),
      chalk.white('USD'),
      chalk.white('Spam?'),
    ],
    colWidths: [14, 14, 20, 46, 14, 8],
    style: { head: [], border: [] },
  });
 
  for (const t of transfers) {
    const from = t.from ? truncatePubkey(t.from) : chalk.gray('—');
    const to = t.to ? truncatePubkey(t.to) : chalk.gray('—');
    const amount = t.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 6 });
    const token = t.token === 'SOL' ? chalk.yellow('SOL') : truncate(t.token, 8, 6);
    const usd = t.usdValue !== null ? chalk.green(`$${t.usdValue.toFixed(2)}`) : chalk.gray('N/A');
    const spam = t.isSpamSuspect ? chalk.red('⚠ YES') : chalk.gray('no');
 
    table.push([from, to, amount, token, usd, spam]);
  }
 
  console.log(table.toString());
};
 
// ─── CPI TREE ────────────────────────────────────────────────────────────────
 
const renderCPITree = (nodes: CPINodeView[], bottleneckTarget: BottleneckTarget | null, isTruncated: boolean) => {
  console.log('');
  console.log(`  ┌${line('─')}┐`);
  console.log(`  │ ${chalk.cyan.bold('CPI CALL TREE')}`.padEnd(WIDTH + 9) + '  │');
  console.log(`  │`.padEnd(WIDTH + 4) + '  │');
 
  if (!nodes || nodes.length === 0) {
    console.log(`  │ ${chalk.gray('[ No CPI data available ]')}`.padEnd(WIDTH + 12) + '  │');
  } else {
    const lines = buildCPITreeVisualLines(nodes, bottleneckTarget);
    for (const row of lines) {
      const isFailed = row.includes('[FAILED]') || row.includes('[TRUNCATED]');
      const isBottleneck = row.includes('[BOTTLENECK]');
      const colorize = isFailed ? chalk.red : isBottleneck ? chalk.magentaBright : chalk.white;
      console.log(`  │ ${colorize(row)}`);
    }
  }
 
  if (isTruncated) {
    console.log(`  │ ${chalk.yellow('⚠ RPC log truncated (tree may be incomplete)')}`);
  }
 
  console.log(`  └${line('─')}┘`);
};
 
// ─── ACCOUNTS TABLE ──────────────────────────────────────────────────────────
 
const renderAccountsTable = (accountDiffs: AccountDiff[]) => {
  console.log('');
  console.log(`   ${chalk.bold('ACCOUNT CHANGES')}`);
 
  const table = new Table({
    head: ['Account', 'Role', 'SOL Δ', 'Token Δ'],
    colWidths: [20, 12, 15, 20],
  });
 
  accountDiffs.forEach((account: any) => {
    table.push([
      truncatePubkey(account.pubkey),
      account.role,
      formatSol(account.solDelta),
      formatToken(account.tokenDeltas),
    ]);
  });
 
  console.log(table.toString());
};
 
// ─── INSIGHTS ────────────────────────────────────────────────────────────────
 
const renderInsights = (insightsList: any[]) => {
  console.log('');
  console.log(`  ╔${line('═')}╗`);
  console.log(`  ║ ${chalk.yellow.bold('ACTIONABLE INSIGHTS')}`.padEnd(WIDTH + 12) + '  ║');
  console.log(`  ║`.padEnd(WIDTH + 4) + '  ║');
 
  if (insightsList.length === 0) {
    console.log(`  ║ ${chalk.gray('No optimization issues detected.')}`.padEnd(WIDTH + 12) + '  ║');
  } else {
    insightsList.forEach((item: any) => {
      const text = typeof item === 'string' ? item : item.message || JSON.stringify(item);
      console.log(`  ║  ${chalk.yellow('-')} ${text}`.padEnd(WIDTH + 12) + '  ║');
    });
  }
 
  console.log(`  ╚${line('═')}╝`);
};
 
// ─── MAIN RENDER FUNCTION ────────────────────────────────────────────────────
 
export const renderTerminal = (
  analyzed: AnalyzedTransaction,
  insights: InsightReport,
  network: 'mainnet' | 'devnet' = 'devnet'
) => {
  const signature =
    (analyzed as any).signature ||
    (analyzed as any).raw?.signature ||
    (analyzed as any).parsed?.signature ||
    'N/A';
 
  const slot =
    (analyzed as any).slot ||
    (analyzed as any).parsed?.slot ||
    (analyzed as any).raw?.slot ||
    0;
 
  const fee =
    (analyzed as any).fee ||
    (analyzed as any).feeLamports ||
    (analyzed as any).parsed?.fee;
 
  const trace = resolveExecutionTrace(analyzed);
  const cpiNodes: CPINodeView[] = trace
    ? trace.roots.map(toNodeViewFromTrace)
    : (((analyzed as any).cpiTree?.root ?? []) as CPINodeView[]);
  const isTraceTruncated = trace?.isTruncated ?? false;
  const bottleneckTarget = collectBottleneckTarget(analyzed);
 
  const accountDiffs = (analyzed as any).accountDiffs || [];
  const insightsList = Array.isArray(insights)
    ? insights
    : (insights as any)?.insights || [];
 
  renderHeader(signature, analyzed.success, slot, fee, network);
  renderCUCost(analyzed.cuCost);
  renderTransferBreakdown(analyzed.transfers);
  renderCPITree(cpiNodes, bottleneckTarget, isTraceTruncated);
  renderAccountsTable(accountDiffs);
  renderInsights(insightsList);
 
  console.log('');
};