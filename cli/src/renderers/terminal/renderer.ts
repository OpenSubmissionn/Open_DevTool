import chalk from 'chalk';
import Table from 'cli-table3';
import stringWidth from 'string-width';
import {
  AnalyzedTransaction,
  InsightReport,
  AccountDiff,
  TransferInfo,
  CUProfile,
  Insight,
} from '../../../../services/src';
import {
  buildCPITree,
  type ExecutionSnapshot,
  type ExecutionTrace,
} from '../../../../services/src/analysis/cpiTreeBuilder';
import { getProgramNameSync } from '../../../../services/src/solana/programs';

// ─── LAYOUT ─────────────────────────────────────────────────────────────────
//
// Single outer frame, two-column dashboard inside. LEFT_W + GAP + RIGHT_W
// must equal INNER (= WIDTH - 4) so every line lands on the right border.

const WIDTH = 145;
const INNER = WIDTH - 4;
const LEFT_W = 80;
const GAP = 3;
const RIGHT_W = INNER - LEFT_W - GAP; // 58
const BUDGET_LIMIT_DEFAULT = 200_000;

// ─── ANSI-AWARE LAYOUT HELPERS ──────────────────────────────────────────────
//
// `padEnd` counts every char including the invisible bytes that chalk injects,
// which is why the box borders kept drifting. `string-width` measures the
// rendered width, so we pad against that instead.

const padVisible = (s: string, target: number): string => {
  const pad = target - stringWidth(s);
  return pad > 0 ? s + ' '.repeat(pad) : s;
};

const padVisibleStart = (s: string, target: number): string => {
  const pad = target - stringWidth(s);
  return pad > 0 ? ' '.repeat(pad) + s : s;
};

const centerPad = (s: string, width: number): string => {
  const sw = stringWidth(s);
  if (sw >= width) return s;
  const total = width - sw;
  const left = Math.floor(total / 2);
  return ' '.repeat(left) + s + ' '.repeat(total - left);
};

const lineChar = (char = '─', n = WIDTH) => char.repeat(n);

const truncate = (str: string, start = 8, end = 8) => {
  if (!str) return 'N/A';
  if (str.length <= start + end) return str;
  return `${str.slice(0, start)}…${str.slice(-end)}`;
};

const truncatePubkey = (pubkey: string) => {
  if (!pubkey) return 'unknown';
  return pubkey.slice(0, 4) + '…' + pubkey.slice(-4);
};

const truncateMid = (s: string, max: number): string => {
  if (stringWidth(s) <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
};

// ─── BOX BUILDERS ───────────────────────────────────────────────────────────

const boxTop = (color = chalk.gray) => '  ' + color('╭' + lineChar('─', WIDTH - 2) + '╮');
const boxBot = (color = chalk.gray) => '  ' + color('╰' + lineChar('─', WIDTH - 2) + '╯');
const boxDivider = (color = chalk.gray) => '  ' + color('├' + lineChar('─', WIDTH - 2) + '┤');
const boxRow = (content: string, color = chalk.gray) =>
  '  ' + color('│') + ' ' + padVisible(content, INNER) + ' ' + color('│');
const boxBlank = (color = chalk.gray) => boxRow('', color);
const boxTwoCol = (left: string, right: string, color = chalk.gray) =>
  '  ' +
  color('│') +
  ' ' +
  padVisible(left, LEFT_W) +
  ' '.repeat(GAP) +
  padVisible(right, RIGHT_W) +
  ' ' +
  color('│');

// ─── BARS / FORMATTERS ──────────────────────────────────────────────────────

const cuColor = (pct: number) => {
  if (pct >= 0.5) return chalk.red;
  if (pct >= 0.25) return chalk.yellow;
  return chalk.cyan;
};

const horizontalBar = (pct: number, width: number): string => {
  const clamped = Math.max(0, Math.min(1, pct));
  const filled = Math.max(0, Math.min(width, Math.round(clamped * width)));
  const empty = width - filled;
  const c = cuColor(clamped);
  return c('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
};

const gradientBar = (pct: number, width: number): string => {
  const clamped = Math.max(0, Math.min(1, pct));
  const filled = Math.max(0, Math.min(width, Math.round(clamped * width)));
  const empty = width - filled;
  let out = '';
  for (let i = 0; i < filled; i++) {
    const p = (i + 1) / Math.max(1, width);
    if (p < 0.55) out += chalk.green('█');
    else if (p < 0.85) out += chalk.yellow('█');
    else out += chalk.red('█');
  }
  out += chalk.gray('░'.repeat(empty));
  return out;
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

// ─── PRESERVED EXPORT (snapshot tests rely on this exact format) ────────────

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

// ─── DASHBOARD: HEADER ROW (mac dots + meta + status) ───────────────────────

function dashboardHeaderRow(
  signature: string,
  success: boolean,
  slot: number,
  network: string,
  durationMs: number
): string {
  const dots = chalk.red('●') + ' ' + chalk.yellow('●') + ' ' + chalk.green('●');
  const sigShort = truncate(signature, 6, 6);
  const sep = chalk.gray(' · ');
  const slotText = slot ? `slot #${slot.toLocaleString('en-US')}` : 'slot ?';
  const meta = `${chalk.white(sigShort)}${sep}${chalk.gray(network)}${sep}${chalk.gray(slotText)}`;

  const status = success
    ? chalk.bgGreen.black.bold(' SUCCESS ')
    : chalk.bgRed.white.bold(' FAILED ');
  const dur = durationMs > 0 ? ' ' + chalk.gray(`${durationMs.toFixed(0)}ms`) : '';

  const left = `${dots}   ${meta}`;
  const right = `${status}${dur}`;
  const fill = Math.max(1, INNER - stringWidth(left) - stringWidth(right));
  return left + ' '.repeat(fill) + right;
}

// ─── DASHBOARD: TAB BAR ─────────────────────────────────────────────────────

function dashboardTabBarLines(active: string = 'Flame'): {
  tabLine: string;
  underlineLine: string;
} {
  const tabs = ['Flame', 'CPI Tree', 'Accounts', 'Graph', 'Learn'];
  const parts: string[] = [];
  const underlineParts: string[] = [];
  for (const t of tabs) {
    const isActive = t === active;
    parts.push(isActive ? chalk.green.bold(t) : chalk.gray(t));
    underlineParts.push(isActive ? chalk.green('─'.repeat(t.length)) : ' '.repeat(t.length));
  }
  return {
    tabLine: parts.join('   '),
    underlineLine: underlineParts.join('   '),
  };
}

// ─── DASHBOARD: CALL TREE (right-aligned CU per row) ────────────────────────

function buildDashboardTreeLines(
  nodes: CPINodeView[],
  bottleneckTarget: BottleneckTarget | null,
  width: number,
  prefix = '',
  isRoot = true,
  state = { consumed: false }
): string[] {
  const out: string[] = [];

  nodes.forEach((node, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isRoot ? '' : isLast ? '└─ ' : '├─ ';
    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');

    const isFailed = node.status === 'failed' || node.status === 'truncated';
    const matchesBottleneck =
      bottleneckTarget !== null &&
      !state.consumed &&
      node.programId === bottleneckTarget.programId &&
      (node.cuConsumed ?? 0) === bottleneckTarget.cuConsumed &&
      (bottleneckTarget.depth === undefined || node.depth === bottleneckTarget.depth);

    if (matchesBottleneck) state.consumed = true;

    const resolvedName = resolveProgramName(node.programId) ?? node.programName ?? node.programId;
    const shortPub = truncatePubkey(node.programId);
    const warn = matchesBottleneck || isFailed ? chalk.red('⚠ ') : '';
    const nameStyled = matchesBottleneck
      ? chalk.red.bold(resolvedName)
      : isFailed
        ? chalk.yellow(resolvedName)
        : isRoot
          ? chalk.white.bold(resolvedName)
          : chalk.white(resolvedName);
    const labelText = `${warn}${nameStyled} ${chalk.gray(shortPub)}`;

    const cuStr = (node.cuConsumed ?? 0).toLocaleString('en-US') + ' CU';
    const cuColored = matchesBottleneck
      ? chalk.red.bold(cuStr)
      : isFailed
        ? chalk.yellow(cuStr)
        : chalk.gray(cuStr);

    const leftSide = chalk.gray(prefix + connector) + labelText;
    const used = stringWidth(leftSide) + stringWidth(cuStr);
    const padN = Math.max(2, width - used);
    out.push(leftSide + ' '.repeat(padN) + cuColored);

    if (node.children?.length) {
      out.push(
        ...buildDashboardTreeLines(
          node.children,
          bottleneckTarget,
          width,
          childPrefix,
          false,
          state
        )
      );
    }
  });

  return out;
}

// ─── DASHBOARD: CU PER INSTRUCTION BARS ─────────────────────────────────────

function buildCUBarsLines(cuProfile: CUProfile | undefined, width: number): string[] {
  if (!cuProfile?.perInstruction?.length || !cuProfile.totalConsumed) {
    return [chalk.gray('  No CU breakdown available.')];
  }
  const total = cuProfile.totalConsumed;
  const map = new Map<string, { name: string; cu: number }>();
  for (const e of cuProfile.perInstruction) {
    const name = resolveProgramName(e.programId) ?? e.programName ?? e.programId;
    const prev = map.get(e.programId);
    if (prev) prev.cu += e.cuConsumed ?? 0;
    else map.set(e.programId, { name, cu: e.cuConsumed ?? 0 });
  }
  const sorted = [...map.values()].sort((a, b) => b.cu - a.cu).slice(0, 5);

  const NAME_W = 18;
  const PCT_W = 5;
  const BAR_W = Math.max(8, width - NAME_W - PCT_W - 4);

  return sorted.map((e) => {
    const pct = e.cu / total;
    const name = padVisible(truncateMid(e.name, NAME_W), NAME_W);
    const bar = horizontalBar(pct, BAR_W);
    const pctStr = padVisibleStart(`${Math.round(pct * 100)}%`, PCT_W);
    return `${chalk.white(name)}  ${bar}  ${chalk.gray(pctStr)}`;
  });
}

// ─── DASHBOARD: KPI CARDS ───────────────────────────────────────────────────

type KpiCard = { value: string; label: string; valueColor: (s: string) => string };

function buildKpiCardsLines(cards: KpiCard[], totalWidth: number): string[] {
  const gaps = cards.length - 1;
  const cardW = Math.max(12, Math.floor((totalWidth - gaps) / cards.length));
  const inner = cardW - 2;

  const tops: string[] = [];
  const vals: string[] = [];
  const labs: string[] = [];
  const bots: string[] = [];

  for (const c of cards) {
    tops.push(chalk.gray('┌' + '─'.repeat(inner) + '┐'));
    vals.push(chalk.gray('│') + centerPad(c.valueColor(c.value), inner) + chalk.gray('│'));
    labs.push(chalk.gray('│') + centerPad(chalk.gray(c.label), inner) + chalk.gray('│'));
    bots.push(chalk.gray('└' + '─'.repeat(inner) + '┘'));
  }
  return [tops.join(' '), vals.join(' '), labs.join(' '), bots.join(' ')];
}

// ─── DASHBOARD: CPI DETAIL CARD ─────────────────────────────────────────────

function buildCpiDetailLines(
  bottleneck: { programId: string; programName: string; cuConsumed: number; depth?: number } | null,
  totalLimit: number,
  totalConsumed: number,
  instructionIdx: number,
  logCount: number,
  width: number
): string[] {
  const inner = width - 4;
  const lines: string[] = [];

  if (!bottleneck) {
    const dashesEmpty = Math.max(0, width - 5 - 'CPI DETAIL'.length);
    lines.push(
      chalk.gray('┌─ ') +
        chalk.cyan.bold('CPI DETAIL') +
        chalk.gray(' ' + '─'.repeat(dashesEmpty) + '┐')
    );
    lines.push(
      chalk.gray('│ ') + padVisible(chalk.gray('No bottleneck detected.'), inner) + chalk.gray(' │')
    );
    lines.push(chalk.gray('└' + '─'.repeat(width - 2) + '┘'));
    return lines;
  }

  const idxLabel = instructionIdx >= 0 ? `INSTRUCTION ${instructionIdx + 1}` : 'BOTTLENECK';
  const titleText = `CPI · ${idxLabel}`;
  const titleLen = stringWidth(titleText);
  const dashes = Math.max(0, width - 5 - titleLen);
  const top =
    chalk.gray('┌─ ') + chalk.cyan.bold(titleText) + chalk.gray(' ' + '─'.repeat(dashes) + '┐');
  lines.push(top);

  const badge = chalk.bgYellow.black.bold(' ⚠ Bottleneck detected ');
  lines.push(chalk.gray('│ ') + padVisible(badge, inner) + chalk.gray(' │'));
  lines.push(chalk.gray('│ ') + ' '.repeat(inner) + chalk.gray(' │'));

  // The mock labels this "% of budget" but the displayed value is the bottleneck's
  // share of the *actually consumed* CUs (110k of 184k = 60%, not 110k of 200k = 55%).
  const denom = totalConsumed > 0 ? totalConsumed : totalLimit;
  const pct = denom > 0 ? Math.round((bottleneck.cuConsumed / denom) * 100) : 0;
  const programLabel =
    resolveProgramName(bottleneck.programId) ?? bottleneck.programName ?? bottleneck.programId;
  const KEY_W = 16;
  const rows: [string, string][] = [
    ['Program', chalk.white(truncateMid(programLabel, inner - KEY_W - 1))],
    ['Compute units', chalk.red.bold(`${bottleneck.cuConsumed.toLocaleString('en-US')} CU`)],
    ['% of budget', chalk.red.bold(`${pct}%`)],
    ['Log messages', chalk.white(`${logCount}`)],
  ];

  for (const [k, v] of rows) {
    const key = padVisible(chalk.gray(k), KEY_W);
    const val = padVisibleStart(v, inner - KEY_W);
    lines.push(chalk.gray('│ ') + key + val + chalk.gray(' │'));
  }
  lines.push(chalk.gray('└' + '─'.repeat(width - 2) + '┘'));
  return lines;
}

// ─── DASHBOARD: SUGGESTION BOX ──────────────────────────────────────────────

function wrapText(text: string, width: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
      continue;
    }
    if (stringWidth(current + ' ' + w) > width) {
      lines.push(current);
      current = w;
    } else {
      current = current + ' ' + w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildSuggestionLines(primary: Insight | null, width: number): string[] {
  const inner = width - 4;
  const titleText = 'SUGGESTION';
  const dashes = Math.max(0, width - 5 - titleText.length);
  const top =
    chalk.green('╭─ ') + chalk.green.bold(titleText) + chalk.green(' ' + '─'.repeat(dashes) + '╮');
  const bot = chalk.green('╰' + '─'.repeat(width - 2) + '╯');
  const blank = chalk.green('│ ') + ' '.repeat(inner) + chalk.green(' │');

  const lines: string[] = [top, blank];

  if (!primary) {
    lines.push(
      chalk.green('│ ') +
        padVisible(chalk.gray('No optimization issues detected.'), inner) +
        chalk.green(' │')
    );
    lines.push(blank);
    lines.push(bot);
    return lines;
  }

  const message = primary.message || primary.title || '';
  const recommendation = primary.recommendation || '';
  let body = message;
  if (recommendation && !message.includes(recommendation)) {
    body = body ? `${body} ${recommendation}` : recommendation;
  }

  const wrapped = wrapText(body, inner);
  for (const w of wrapped) {
    lines.push(chalk.green('│ ') + padVisible(chalk.green(w), inner) + chalk.green(' │'));
  }

  if (primary.estimatedCUSavings && primary.estimatedCUSavings > 0) {
    lines.push(blank);
    const savText =
      chalk.green.bold('Estimated savings: ') +
      chalk.green(`~${(primary.estimatedCUSavings / 1000).toFixed(0)}k CU`);
    lines.push(chalk.green('│ ') + padVisible(savText, inner) + chalk.green(' │'));
  }

  lines.push(blank);
  lines.push(bot);
  return lines;
}

// ─── DASHBOARD: BUDGET BAR ──────────────────────────────────────────────────

function buildBudgetBarLines(consumed: number, limit: number, width: number): string[] {
  const pct = limit > 0 ? consumed / limit : 0;
  const out: string[] = [];
  out.push(chalk.cyan.bold('BUDGET TOTAL'));
  out.push('');
  out.push(gradientBar(pct, width));
  const labelLeft = chalk.gray('0');
  const labelRight = chalk.gray(
    `${consumed.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} CU`
  );
  const fill = Math.max(1, width - stringWidth(labelLeft) - stringWidth(labelRight));
  out.push(labelLeft + ' '.repeat(fill) + labelRight);
  return out;
}

// ─── DASHBOARD HELPERS ──────────────────────────────────────────────────────

function pickPrimaryInsight(insights: InsightReport): Insight | null {
  if (!insights) return null;
  const primary = (insights as any).primaryBottleneck as Insight | null | undefined;
  if (primary) return primary;
  const list: Insight[] = Array.isArray(insights) ? (insights as any) : (insights.insights ?? []);
  if (!list.length) return null;
  const sevRank: Record<string, number> = { critical: 3, warning: 2, info: 1 };
  const sorted = [...list].sort((a, b) => {
    const sa = sevRank[a.severity] ?? 0;
    const sb = sevRank[b.severity] ?? 0;
    if (sa !== sb) return sb - sa;
    return (b.estimatedCUSavings ?? 0) - (a.estimatedCUSavings ?? 0);
  });
  return sorted[0] ?? null;
}

function findInstructionIndex(analyzed: AnalyzedTransaction): number {
  const bottleneckProgram = (analyzed as any)?.cuProfile?.bottleneck?.programId;
  const bottleneckCU = (analyzed as any)?.cuProfile?.bottleneck?.cuConsumed;
  const ix = analyzed.parsed?.instructions ?? [];
  if (!bottleneckProgram || !ix.length) return -1;
  const byBoth = ix.findIndex(
    (i) => i.programId === bottleneckProgram && (i.cuConsumed ?? 0) === bottleneckCU
  );
  if (byBoth >= 0) return byBoth;
  return ix.findIndex((i) => i.programId === bottleneckProgram);
}

function countLogsForProgram(analyzed: AnalyzedTransaction, programId: string): number {
  const byProgram: any = (analyzed as any)?.logs?.byProgram;
  if (!byProgram) return 0;
  const entry = byProgram[programId];
  if (!entry) return 0;
  if (Array.isArray(entry)) return entry.length;
  if (Array.isArray(entry?.entries)) return entry.entries.length;
  return 0;
}

function countCpiBottlenecks(analyzed: AnalyzedTransaction, threshold = 50_000): number {
  const trace = resolveExecutionTrace(analyzed);
  if (!trace) {
    const cpiTree = (analyzed as any)?.cpiTree?.root;
    if (!Array.isArray(cpiTree)) return 0;
    let count = 0;
    const walk = (n: any) => {
      const cu = n.cuConsumed ?? 0;
      if (cu > threshold) count += 1;
      for (const c of n.children ?? []) walk(c);
    };
    for (const r of cpiTree) walk(r);
    return count;
  }
  let count = 0;
  const visit = (s: ExecutionSnapshot) => {
    if ((s.computeUnitsConsumed ?? 0) > threshold) count += 1;
    for (const c of s.children) visit(c);
  };
  for (const r of trace.roots) visit(r);
  return count;
}

// ─── DASHBOARD RENDER ───────────────────────────────────────────────────────

function renderDashboard(
  analyzed: AnalyzedTransaction,
  insights: InsightReport,
  network: 'mainnet' | 'devnet',
  durationMs: number
) {
  const signature =
    analyzed.signature ||
    (analyzed as any).raw?.signature ||
    (analyzed as any).parsed?.signature ||
    'N/A';
  const slot =
    (analyzed as any).slot || (analyzed as any).parsed?.slot || (analyzed as any).raw?.slot || 0;

  const trace = resolveExecutionTrace(analyzed);
  const cpiNodes: CPINodeView[] = trace
    ? trace.roots.map(toNodeViewFromTrace)
    : (((analyzed as any).cpiTree?.root ?? []) as CPINodeView[]);
  const bottleneckTarget = collectBottleneckTarget(analyzed);
  const cuProfile = analyzed.cuProfile;
  const totalConsumed = cuProfile?.totalConsumed ?? analyzed.cuCost?.cuConsumed ?? 0;
  const totalLimit =
    cuProfile?.totalLimit && cuProfile.totalLimit > 0 ? cuProfile.totalLimit : BUDGET_LIMIT_DEFAULT;
  const utilization = totalLimit > 0 ? totalConsumed / totalLimit : 0;
  const bottleneck = (analyzed as any)?.cuProfile?.bottleneck ?? null;
  const cpiBottlenecks = countCpiBottlenecks(analyzed);
  const ixIdx = findInstructionIndex(analyzed);
  const logCount = bottleneck ? countLogsForProgram(analyzed, bottleneck.programId) : 0;

  // Left column ────────────────────────────────────────────────────────────
  const treeLines = cpiNodes.length
    ? buildDashboardTreeLines(cpiNodes, bottleneckTarget, LEFT_W)
    : [chalk.gray('  No CPI data available.')];
  const barLines = buildCUBarsLines(cuProfile, LEFT_W);

  // Right column ───────────────────────────────────────────────────────────
  const kpiCards: KpiCard[] = [
    {
      value: `${Math.round(utilization * 100)}%`,
      label: 'CU used',
      valueColor: (s) =>
        utilization >= 0.85
          ? chalk.red.bold(s)
          : utilization >= 0.5
            ? chalk.yellow.bold(s)
            : chalk.green.bold(s),
    },
    {
      value: `${(totalConsumed / 1000).toFixed(0)}k`,
      label: `of ${(totalLimit / 1000).toFixed(0)}k`,
      valueColor: (s) => chalk.cyan.bold(s),
    },
    {
      value: `${cpiBottlenecks}`,
      label: cpiBottlenecks === 1 ? 'bottleneck' : 'bottlenecks',
      valueColor: (s) => (cpiBottlenecks > 0 ? chalk.red.bold(s) : chalk.green.bold(s)),
    },
  ];
  const kpiLines = buildKpiCardsLines(kpiCards, RIGHT_W);
  const cpiDetailLines = buildCpiDetailLines(
    bottleneck,
    totalLimit,
    totalConsumed,
    ixIdx,
    logCount,
    RIGHT_W
  );
  const primary = pickPrimaryInsight(insights);
  const suggestionLines = buildSuggestionLines(primary, RIGHT_W);
  const budgetLines = buildBudgetBarLines(totalConsumed, totalLimit, RIGHT_W);

  const leftLines: string[] = [
    chalk.gray.bold('CALL TREE'),
    '',
    ...treeLines,
    '',
    '',
    chalk.gray.bold('COMPUTE UNITS PER INSTRUCTION'),
    '',
    ...barLines,
  ];
  const rightLines: string[] = [
    ...kpiLines,
    '',
    ...cpiDetailLines,
    '',
    ...suggestionLines,
    '',
    ...budgetLines,
  ];

  const maxLen = Math.max(leftLines.length, rightLines.length);
  while (leftLines.length < maxLen) leftLines.push('');
  while (rightLines.length < maxLen) rightLines.push('');

  console.log('');
  console.log(boxTop());
  console.log(boxRow(dashboardHeaderRow(signature, analyzed.success, slot, network, durationMs)));
  console.log(boxDivider());
  const { tabLine, underlineLine } = dashboardTabBarLines('Flame');
  console.log(boxRow(tabLine));
  console.log(boxRow(underlineLine));
  console.log(boxDivider());
  console.log(boxBlank());
  for (let i = 0; i < maxLen; i++) {
    console.log(boxTwoCol(leftLines[i], rightLines[i]));
  }
  console.log(boxBlank());
  console.log(boxBot());
}

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

// ─── ACTIONABLE INSIGHTS LIST ───────────────────────────────────────────────

function getInsightSource(item: any): string | undefined {
  if (typeof item === 'string') return undefined;
  return item?.source ?? item?.insight?.source;
}

const renderInsights = (insightsList: any[]) => {
  const yellow = chalk.yellow;
  console.log('');
  console.log('  ' + yellow('╔' + lineChar('═', WIDTH - 2) + '╗'));
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

  console.log('  ' + yellow('╚' + lineChar('═', WIDTH - 2) + '╝'));
};

// ─── ENTRY ──────────────────────────────────────────────────────────────────

export const renderTerminal = (
  analyzed: AnalyzedTransaction,
  insights: InsightReport,
  network: 'mainnet' | 'devnet' = 'devnet',
  durationMs: number = 0
) => {
  const insightsList = Array.isArray(insights) ? insights : (insights as any)?.insights || [];

  // Fallback: derive duration from upstream timings if the caller didn't pass one.
  let duration = durationMs;
  if (!duration && (analyzed as any)?._metadata?.timings) {
    duration = ((analyzed as any)._metadata.timings as any[]).reduce(
      (sum, t) => sum + (t.durationMs ?? 0),
      0
    );
  }

  renderDashboard(analyzed, insights, network, duration);
  renderTransferBreakdown(analyzed.transfers);
  renderAccountsTable(((analyzed as any).accountDiffs ?? []) as AccountDiff[]);
  renderAnomalies((analyzed as any).anomalies);
  renderInsights(insightsList);

  console.log('');
};