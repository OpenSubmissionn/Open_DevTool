import chalk from 'chalk';
import Table from 'cli-table3';
import stringWidth from 'string-width';
import {
  AnalyzedTransaction,
  InsightReport,
  AccountDiff,
  TransferInfo,
  CUCost,
} from '../../../../services/src';
import {
  buildCPITree,
  type ExecutionSnapshot,
  type ExecutionTrace,
} from '../../../../services/src/analysis/cpiTreeBuilder';
import { getProgramNameSync } from '../../../../services/src/solana/programs';

const WIDTH = 145;
const INNER = WIDTH - 4; // " │ ... │ "

// ─── ANSI-AWARE LAYOUT HELPERS ──────────────────────────────────────────────
//
// `padEnd` counts every char including the invisible bytes that chalk injects,
// which is why the box borders kept drifting. `string-width` measures the
// rendered width, so we pad against that instead.

const padVisible = (s: string, target: number): string => {
  const pad = target - stringWidth(s);
  return pad > 0 ? s + ' '.repeat(pad) : s;
};

const line = (char = '─', n = WIDTH) => char.repeat(n);

const top = (color = chalk.gray) => '  ' + color('┌' + line('─', WIDTH - 2) + '┐');
const bottom = (color = chalk.gray) => '  ' + color('└' + line('─', WIDTH - 2) + '┘');
const row = (content: string, color = chalk.gray) =>
  '  ' + color('│') + ' ' + padVisible(content, INNER) + ' ' + color('│');
const blank = (color = chalk.gray) => row('', color);

// ─── PRIMITIVES ─────────────────────────────────────────────────────────────

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
  return tokenDeltas
    .map((token) => {
      const amount = Number(token.delta || 0);
      const symbol = token.symbol || 'TOKEN';
      if (amount > 0) return chalk.green(`+${amount} ${symbol}`);
      if (amount < 0) return chalk.red(`${amount} ${symbol}`);
      return `${amount} ${symbol}`;
    })
    .join(', ');
};

// ─── PROGRAM NAME RESOLUTION ────────────────────────────────────────────────
//
// `getProgramNameSync` consults services/src/data/programs.json. Some real
// mainnet IDs (Token, Token-2022, ATA, Compute Budget) are missing or stale
// there — this inline patch covers the high-traffic ones so the CPI tree
// shows readable names today. Long-term fix lives in programs.json.

const INLINE_PROGRAM_NAMES: Record<string, string> = {
  '11111111111111111111111111111111': 'System Program',
  ComputeBudget111111111111111111111111111111: 'Compute Budget',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'Token Program',
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: 'Token-2022',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Associated Token Account',
  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: 'Metaplex Metadata',
  whirLbMiicVdio4KfUV7LSu1DbjhokCWAN8DiwKx5hp: 'Orca Whirlpool',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium AMM',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter Aggregator V6',
  CiQPQrmQh6BPhb9k7dFnsEs5gKPgdrvNKFc5xie5xVGd: 'Pump.fun',
};

const resolveProgramName = (programId: string): string | null => {
  if (!programId) return null;
  const inline = INLINE_PROGRAM_NAMES[programId];
  if (inline) return inline;
  const fromRegistry = getProgramNameSync(programId);
  if (fromRegistry && fromRegistry !== 'Unknown Program') return fromRegistry;
  return null;
};

// ─── CPI TREE TYPES ─────────────────────────────────────────────────────────

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

// ─── CPI MICROBAR ───────────────────────────────────────────────────────────

const BAR_WIDTH = 8;

const microbar = (cu: number, totalCU: number): string => {
  if (totalCU <= 0) return '';
  const pct = Math.max(0, Math.min(1, cu / totalCU));
  const filled = Math.round(pct * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const color = pct >= 0.5 ? chalk.red : pct >= 0.25 ? chalk.yellow : chalk.green;
  return color('▓'.repeat(filled)) + chalk.gray('░'.repeat(empty));
};

// ─── CPI TREE LINES ─────────────────────────────────────────────────────────

export function buildCPITreeVisualLines(
  nodes: CPINodeView[],
  bottleneckTarget: BottleneckTarget | null,
  prefix = '',
  isRoot = true,
  bottleneckState = { consumed: false },
  totalCU = 0
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
    const cu = (node.cuConsumed ?? 0).toLocaleString('en-US');
    const tagsChunk = tags.length > 0 ? ` [${tags.join('][')}]` : '';

    const resolvedName = resolveProgramName(node.programId);
    const label = resolvedName
      ? `${resolvedName} (${truncatePubkey(node.programId)})`
      : node.programName || node.programId || 'Unknown Program';

    // Microbar only when totalCU is provided (preserves test snapshots).
    const bar = totalCU > 0 ? ` ${microbar(node.cuConsumed ?? 0, totalCU)}` : '';
    const pctChunk =
      totalCU > 0 && (node.cuConsumed ?? 0) > 0
        ? chalk.gray(` ${(((node.cuConsumed ?? 0) / totalCU) * 100).toFixed(1)}%`)
        : '';

    output.push(`${prefix}${connector}${icon} ${label} (${cu} CU)${bar}${pctChunk}${tagsChunk}`);

    if (node.children && node.children.length > 0) {
      output.push(
        ...buildCPITreeVisualLines(
          node.children,
          bottleneckTarget,
          childPrefix,
          false,
          bottleneckState,
          totalCU
        )
      );
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
  // 9 decimals = full lamport precision; matches the CU cost panel breakdown
  // so the same value isn't displayed two different ways on one screen.
  const displayFee = fee !== undefined ? (fee / 1e9).toFixed(9) : 'N/A';

  console.log('');
  console.log(`  ${chalk.cyan.bold('OPEN INSIGHT [CLI v0.1.0]')}   ${networkLabel} ${slotLabel}`);
  console.log(top(statusColor));

  // signature on the left, status on the right, status anchored to the inner edge
  const left = `${chalk.bold('SIGNATURE:')} ${truncate(signature, 16, 16)}`;
  const right = statusText;
  const gap = INNER - stringWidth(left) - stringWidth(right);
  const sigRow = left + ' '.repeat(Math.max(1, gap)) + right;
  console.log(row(sigRow, statusColor));

  console.log(blank(statusColor));
  console.log(row(chalk.gray(`TRANSACTION FEE: ${displayFee} SOL`), statusColor));
  console.log(bottom(statusColor));
};

// ─── CU COST ────────────────────────────────────────────────────────────────

const renderCUCost = (cuCost: CUCost | undefined) => {
  console.log('');
  console.log(top());
  console.log(row(chalk.cyan.bold('CU EXECUTION COST')));
  console.log(blank());

  if (!cuCost || cuCost.cuConsumed === 0) {
    console.log(row(chalk.gray('[ No CU cost data available ]')));
  } else {
    const priceLabel =
      cuCost.microLamportsPerCU > 0
        ? chalk.yellow(`${cuCost.microLamportsPerCU.toLocaleString('en-US')} µL/CU`)
        : chalk.gray('no priority price set');

    const priorityFeeLabel =
      cuCost.priorityFeeLamports > 0
        ? chalk.yellow(`${cuCost.priorityFeeLamports.toLocaleString('en-US')} lamports`)
        : chalk.gray('0 lamports');

    const feeSOLStr = cuCost.feeSOL.toFixed(9);
    const feeUSDStr =
      cuCost.feeUSD !== null ? chalk.green(`$${cuCost.feeUSD.toFixed(6)}`) : chalk.gray('USD N/A');

    console.log(
      row(
        ` ${chalk.white('CU Consumed:')}   ${chalk.cyan(cuCost.cuConsumed.toLocaleString('en-US'))} CU`
      )
    );
    console.log(row(` ${chalk.white('Price:')}         ${priceLabel}`));
    console.log(
      row(
        ` ${chalk.white('Base Fee:')}      ${chalk.yellow(cuCost.baseFeeLamports.toLocaleString('en-US'))} lamports`
      )
    );
    console.log(row(` ${chalk.white('Priority Fee:')}  ${priorityFeeLabel}`));
    console.log(
      row(
        ` ${chalk.white('Total Fee:')}     ${chalk.yellow(cuCost.feeLamports.toLocaleString('en-US'))} lamports  ·  ${chalk.yellow(feeSOLStr)} SOL  ·  ${feeUSDStr}`
      )
    );
  }

  console.log(bottom());
};

// ─── TRANSFER BREAKDOWN ─────────────────────────────────────────────────────

const renderTransferBreakdown = (transfers: TransferInfo[] | undefined) => {
  console.log('');
  console.log('  ' + chalk.cyan.bold('TRANSFER BREAKDOWN'));

  if (!transfers || transfers.length === 0) {
    console.log('  ' + chalk.gray('[ No transfers detected ]'));
    return;
  }

  const table = new Table({
    head: [
      chalk.white('From'),
      chalk.white('To'),
      chalk.white('Amount'),
      chalk.white('Token'),
      chalk.white('USD'),
      chalk.white('Spam?'),
    ],
    colWidths: [14, 14, 20, 46, 14, 10],
    style: { head: [], border: [] },
  });

  for (const t of transfers) {
    // When one side is empty after pairing, the counterparty is the protocol
    // itself — mint, rent reclaim, or escrow. Label it instead of "—".
    const from = t.from ? truncatePubkey(t.from) : chalk.gray('(mint/rent)');
    const to = t.to ? truncatePubkey(t.to) : chalk.gray('(burn/rent)');
    const amount = t.uiAmount.toLocaleString('en-US', { maximumFractionDigits: 6 });
    const token = t.token === 'SOL' ? chalk.yellow('SOL') : truncate(t.token, 8, 6);
    const usd =
      t.usdValue !== null
        ? t.usdValue > 0 && t.usdValue < 0.01
          ? chalk.green('< $0.01')
          : chalk.green(`$${t.usdValue.toFixed(2)}`)
        : chalk.gray('N/A');
    const spam = t.isSpamSuspect ? chalk.red('⚠ YES') : chalk.gray('no');

    table.push([from, to, amount, token, usd, spam]);
  }

  for (const tableLine of table.toString().split('\n')) {
    console.log('  ' + tableLine);
  }
};

// ─── CPI TREE ───────────────────────────────────────────────────────────────

const renderCPITree = (
  nodes: CPINodeView[],
  bottleneckTarget: BottleneckTarget | null,
  isTruncated: boolean,
  totalCU: number
) => {
  console.log('');
  console.log(top());
  console.log(row(chalk.cyan.bold('CPI CALL TREE')));
  console.log(blank());

  if (!nodes || nodes.length === 0) {
    console.log(row(chalk.gray('[ No CPI data available ]')));
  } else {
    const lines = buildCPITreeVisualLines(
      nodes,
      bottleneckTarget,
      '',
      true,
      { consumed: false },
      totalCU
    );
    for (const treeLine of lines) {
      const isFailed = treeLine.includes('[FAILED]') || treeLine.includes('[TRUNCATED]');
      const isBottleneck = treeLine.includes('[BOTTLENECK]');
      const colorize = isFailed ? chalk.red : isBottleneck ? chalk.magentaBright : chalk.white;
      console.log(row(colorize(treeLine)));
    }
  }

  if (isTruncated) {
    console.log(row(chalk.yellow('⚠ RPC log truncated (tree may be incomplete)')));
  }

  console.log(bottom());
};

// ─── ACCOUNTS TABLE ─────────────────────────────────────────────────────────

const renderAccountsTable = (accountDiffs: AccountDiff[]) => {
  console.log('');
  console.log('  ' + chalk.cyan.bold('ACCOUNT CHANGES'));

  if (!accountDiffs || accountDiffs.length === 0) {
    console.log('  ' + chalk.gray('[ No account changes detected ]'));
    return;
  }

  const table = new Table({
    head: [
      chalk.white('Account'),
      chalk.white('Role'),
      chalk.white('SOL Δ'),
      chalk.white('Token Δ'),
    ],
    colWidths: [20, 12, 15, 20],
    style: { head: [], border: [] },
  });

  accountDiffs.forEach((account: any) => {
    table.push([
      truncatePubkey(account.pubkey),
      account.role,
      formatSol(account.solDelta),
      formatToken(account.tokenDeltas),
    ]);
  });

  for (const tableLine of table.toString().split('\n')) {
    console.log('  ' + tableLine);
  }
};

// ─── ANOMALIES ──────────────────────────────────────────────────────────────

const severityChalk = (sev: string) => {
  if (sev === 'high') return chalk.red;
  if (sev === 'medium') return chalk.yellow;
  return chalk.cyan;
};

const SEVERITY_ICON: Record<string, string> = {
  high: '⚠',
  medium: '!',
  low: 'i',
};

const renderAnomalies = (report: any) => {
  const anomalies: any[] = report?.anomalies ?? [];
  console.log('');
  console.log('  ' + chalk.cyan.bold('ANOMALIES'));

  if (anomalies.length === 0) {
    console.log('  ' + chalk.gray('[ No anomalies detected ]'));
    return;
  }

  for (const a of anomalies) {
    const color = severityChalk(a.severity);
    const icon = SEVERITY_ICON[a.severity] ?? '·';
    const tag = color.bold(`[${String(a.severity).toUpperCase()}]`);
    const type = chalk.gray(`(${a.type})`);
    console.log(`  ${color(icon)} ${tag} ${type}  ${a.description}`);

    // Detector confidence is meta-information about how sure the rule is —
    // it's not part of the anomaly itself. Surface it on its own indented
    // line in a distinct colour so it reads as detector metadata.
    const pct = (Number(a.confidence ?? 0) * 100).toFixed(0);
    console.log(
      `      ${chalk.blueBright('↳')} ${chalk.blueBright.bold('Detector confidence:')} ${chalk.blueBright(pct + '%')}`
    );
  }
};

// ─── INSIGHTS ───────────────────────────────────────────────────────────────

const renderInsights = (insightsList: any[]) => {
  const yellow = chalk.yellow;
  console.log('');
  console.log('  ' + yellow('╔' + line('═', WIDTH - 2) + '╗'));
  console.log(
    '  ' +
      yellow('║') +
      ' ' +
      padVisible(yellow.bold('ACTIONABLE INSIGHTS'), INNER) +
      ' ' +
      yellow('║')
  );
  console.log('  ' + yellow('║') + ' ' + padVisible('', INNER) + ' ' + yellow('║'));

  if (insightsList.length === 0) {
    console.log(
      '  ' +
        yellow('║') +
        ' ' +
        padVisible(chalk.gray('No optimization issues detected.'), INNER) +
        ' ' +
        yellow('║')
    );
  } else {
    const ruleBased = insightsList.filter((i) => getInsightSource(i) !== 'mcp');
    const aiBased = insightsList.filter((i) => getInsightSource(i) === 'mcp');

    const renderItem = (item: any) => {
      const text = typeof item === 'string' ? item : item.message || JSON.stringify(item);
      const content = ` ${yellow('-')} ${text}`;
      console.log('  ' + yellow('║') + ' ' + padVisible(content, INNER) + ' ' + yellow('║'));
    };

    const renderSubheader = (label: string) => {
      console.log(
        '  ' + yellow('║') + ' ' + padVisible(chalk.bold.cyan(label), INNER) + ' ' + yellow('║')
      );
    };

    const blank = () =>
      console.log('  ' + yellow('║') + ' ' + padVisible('', INNER) + ' ' + yellow('║'));

    if (ruleBased.length) {
      renderSubheader('Rule-based');
      ruleBased.forEach(renderItem);
    }

    if (aiBased.length) {
      if (ruleBased.length) blank();
      renderSubheader(
        `AI-generated${process.env.MCP_PROVIDER_LABEL ? ` (${process.env.MCP_PROVIDER_LABEL})` : ''}`
      );
      aiBased.forEach(renderItem);
    }
  }

  console.log('  ' + yellow('╚' + line('═', WIDTH - 2) + '╝'));
};

function getInsightSource(item: any): string | undefined {
  if (typeof item === 'string') return undefined;
  return item?.source ?? item?.insight?.source;
}

// ─── MAIN RENDER FUNCTION ───────────────────────────────────────────────────

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
    (analyzed as any).slot || (analyzed as any).parsed?.slot || (analyzed as any).raw?.slot || 0;

  const fee =
    (analyzed as any).fee || (analyzed as any).feeLamports || (analyzed as any).parsed?.fee;

  const trace = resolveExecutionTrace(analyzed);
  const cpiNodes: CPINodeView[] = trace
    ? trace.roots.map(toNodeViewFromTrace)
    : (((analyzed as any).cpiTree?.root ?? []) as CPINodeView[]);
  const isTraceTruncated = trace?.isTruncated ?? false;
  const bottleneckTarget = collectBottleneckTarget(analyzed);

  const totalCU =
    (analyzed as any)?.cuProfile?.totalConsumed ??
    (analyzed as any)?.raw?.computeUnitsConsumed ??
    analyzed.cuCost?.cuConsumed ??
    0;

  const accountDiffs = (analyzed as any).accountDiffs || [];
  const insightsList = Array.isArray(insights) ? insights : (insights as any)?.insights || [];

  renderHeader(signature, analyzed.success, slot, fee, network);
  renderCUCost(analyzed.cuCost);
  renderTransferBreakdown(analyzed.transfers);
  renderCPITree(cpiNodes, bottleneckTarget, isTraceTruncated, totalCU);
  renderAccountsTable(accountDiffs);
  renderAnomalies((analyzed as any).anomalies);
  renderInsights(insightsList);

  console.log('');
};
