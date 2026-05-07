import chalk from 'chalk';
import Table from 'cli-table3';
import stringWidth from 'string-width';
import {
  AnalyzedTransaction,
  InsightReport,
  AccountDiff,
  TransferInfo,
  CUProfile,
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
// Left column got wider after the redundant SUGGESTION card moved out of the
// dashboard — extra width goes to the CALL TREE (bigger CU bar + room for full
// program names) and to the FLAME GRAPH strip.
const LEFT_W = 92;
const GAP = 3;
const RIGHT_W = INNER - LEFT_W - GAP; // 46
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
//
// Threshold scheme requested by Nicole:
//   < 25 %  → neon green   (OK)
//   25–50 % → yellow       (alert)
//   ≥ 50 %  → vivid red    (over budget for a single CPI segment)
// All bars and CU labels share this same palette so the user can read severity
// at a glance no matter where the number appears (tree row, flame, KPI card).

const cuColor = (pct: number) => {
  if (pct >= 0.5) return chalk.redBright;
  if (pct >= 0.25) return chalk.yellowBright;
  return chalk.greenBright;
};

const cuColorBold = (pct: number) => {
  if (pct >= 0.5) return chalk.redBright.bold;
  if (pct >= 0.25) return chalk.yellowBright.bold;
  return chalk.greenBright.bold;
};

const horizontalBar = (pct: number, width: number): string => {
  const clamped = Math.max(0, Math.min(1, pct));
  // Floor instead of round so tiny shares (< half a cell) render as fully
  // empty — matches the bar style Nicole referenced where 1.8% shows no fill.
  const filled = Math.max(0, Math.min(width, Math.floor(clamped * width)));
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
    if (p < 0.25) out += chalk.greenBright('█');
    else if (p < 0.5) out += chalk.yellowBright('█');
    else out += chalk.redBright('█');
  }
  out += chalk.gray('░'.repeat(empty));
  return out;
};

// Inline severity bar for a CPI tree row.
//   • lengthPct  → controls how much of the bar is filled. Caller passes
//                  cu / max(cu) so the longest bar fills the full track and
//                  others scale relative to the max — proper profiler-style
//                  visual encoding of CU consumption.
//   • colorPct   → controls the colour. Caller passes cu / total so the
//                  threshold palette (green / yellow / red) reflects the row's
//                  share of the whole transaction, not its share of the max.
// Each bar is framed by thin ▕ ▏ edges so adjacent rows read as INDIVIDUAL
// bars instead of merging into one stacked block. Floor-based fill so tiny
// shares render as fully empty (just the track).
const rowBar = (lengthPct: number, colorPct: number, width: number): string => {
  const clampedLen = Math.max(0, Math.min(1, lengthPct));
  const inner = Math.max(2, width - 2);
  const filled = Math.max(0, Math.min(inner, Math.floor(clampedLen * inner)));
  const empty = inner - filled;
  const c = cuColor(colorPct);
  return chalk.gray('▕') + c('█'.repeat(filled)) + chalk.gray('░'.repeat(empty)) + chalk.gray('▏');
};

const severityLabel = (pct: number): string => {
  if (pct >= 0.5) return chalk.redBright.bold('● HOT');
  if (pct >= 0.25) return chalk.yellowBright.bold('● WARN');
  return chalk.greenBright.bold('● OK');
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

// ─── DASHBOARD: HEADER (single line) ────────────────────────────────────────
//
// Single sober line: mac dots + signature meta + status pill + duration. All
// the rich CU/summary info lives in its dedicated sections below so the
// briefing stays clean and quiet.

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
//
// Lightweight nav strip under the header so the user can see, at a glance,
// which sub-view is in play. The active tab gets green bold + a green
// underline; the others stay grey.

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

// ─── DASHBOARD: CALL TREE (bar + % + CU, threshold-coloured per row) ────────
//
// Each row is laid out as fixed columns so they stay aligned no matter how
// deep the tree gets:
//
//   <prefix><connector><dot> <name> <pubkey> ··· <bar> <pct>  <cu>
//
// The dot, bar and CU number are coloured by the row's share of the
// transaction's TOTAL consumed CUs — so a single hot CPI flares red even when
// the whole transaction sits under budget. The bottleneck row gets an extra
// "⚠ HOTSPOT" tag so it pops without us having to invent a new colour.

// Column widths for the CALL TREE rows. Bar is wide (32) so the visualisation
// reads like a real bar chart — same anatomy as the COMPUTE UNITS PER
// INSTRUCTION rows Nicole referenced. The right cluster has a fixed visible
// width so the column header dashes line up with the row data and the box
// border doesn't drift; pct is 6-wide to fit "100.0%" on the root row.
const TREE_BAR_W = 32;
const TREE_PCT_W = 6;
const TREE_CU_W = 12;
// 1 leading space + bar + 1 space + pct + 2 spaces + cu  → total visible width
// of the right cluster, used to compute the available space for the label.
const TREE_RIGHT_W = 1 + TREE_BAR_W + 1 + TREE_PCT_W + 2 + TREE_CU_W;

// Walk the tree once to find the largest CU value so we can normalise bar
// lengths to it. The bar for the heaviest node fills the full track; every
// other bar is scaled relative to that max — direct visual encoding of
// "biggest CU eater" vs the rest.
function findMaxCU(nodes: CPINodeView[]): number {
  let max = 0;
  const walk = (ns: CPINodeView[]) => {
    for (const n of ns) {
      const cu = n.cuConsumed ?? 0;
      if (cu > max) max = cu;
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
  return max;
}

function buildDashboardTreeLines(
  nodes: CPINodeView[],
  bottleneckTarget: BottleneckTarget | null,
  width: number,
  totalCU: number,
  maxCU?: number,
  prefix = '',
  isRoot = true,
  state = { consumed: false }
): string[] {
  const out: string[] = [];
  // Compute max once at the top-level call and reuse for every recursion.
  const max = maxCU ?? findMaxCU(nodes);

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

    const cu = node.cuConsumed ?? 0;
    const pct = totalCU > 0 ? cu / totalCU : 0;
    const barLengthPct = max > 0 ? cu / max : 0;

    const resolvedName = resolveProgramName(node.programId) ?? node.programName ?? node.programId;
    const shortPub = truncatePubkey(node.programId);

    const nameStyled = matchesBottleneck
      ? chalk.redBright.bold(resolvedName)
      : isFailed
        ? chalk.yellow(resolvedName)
        : isRoot
          ? chalk.white.bold(resolvedName)
          : chalk.white(resolvedName);

    // No leading severity dot — Nicole wants the rows to look like the photo
    // (label + bar + % + CU). The bar + colored numbers already encode
    // severity, so the dot was just visual noise.
    const labelText = `${nameStyled} ${chalk.gray(shortPub)}`;
    const leftSide = chalk.gray(prefix + connector) + labelText;

    // Right cluster: bar + pct + CU. We size the left side so the right
    // cluster always lands at the same column.
    const cuStr = cu.toLocaleString('en-US') + ' CU';
    const pctStr = totalCU > 0 ? `${(pct * 100).toFixed(1)}%`.padStart(TREE_PCT_W) : '    — ';
    // Bar length normalised by max CU; colour by share of total.
    const bar = totalCU > 0 ? rowBar(barLengthPct, pct, TREE_BAR_W) : ' '.repeat(TREE_BAR_W);

    const cuColored = isFailed
      ? chalk.yellow(cuStr)
      : matchesBottleneck
        ? chalk.redBright.bold(cuStr)
        : cuColor(pct)(cuStr);
    const pctColored = isFailed ? chalk.yellow(pctStr) : cuColorBold(pct)(pctStr);

    const leftBudget = Math.max(20, width - TREE_RIGHT_W);
    const leftPadded = padVisible(truncateMid(leftSide, leftBudget), leftBudget);
    const cuPadded = padVisibleStart(cuColored, TREE_CU_W);

    out.push(`${leftPadded} ${bar} ${pctColored}  ${cuPadded}`);

    if (node.children?.length) {
      // Ghost spacer between this row and its first child so adjacent bars
      // breathe vertically. childPrefix carries the parent's vertical
      // channels; appending `│` keeps the tree connection visible across the
      // gap instead of leaving a disconnected blank line.
      out.push(chalk.gray(childPrefix + '│'));
      out.push(
        ...buildDashboardTreeLines(
          node.children,
          bottleneckTarget,
          width,
          totalCU,
          max,
          childPrefix,
          false,
          state
        )
      );
    }

    // Ghost spacer between this subtree and the next sibling at the same
    // depth. Root level uses a plain blank line (no shared trunk); nested
    // levels keep the parent's `│` channels so the tree stays readable.
    if (!isLast) {
      out.push(isRoot ? '' : chalk.gray(prefix + '│'));
    }
  });

  return out;
}

// ─── DASHBOARD: FLAME GRAPH ─────────────────────────────────────────────────
//
// Designed for "wow" — a flat, observability-grade flame strip with a rich
// categorical palette. Severity (red / yellow) is reserved exclusively for
// HOT (≥50 %) and WARN (25–50 %) segments so the alarm keeps its meaning;
// every other program rotates through a striking blue-led cool palette
// (blueBright → cyanBright → magentaBright → blue → cyan → magenta) so the
// strip reads as a polished, professional rainbow instead of a sea of red.
//
// Layout:
//   1. Inline labels       — program name + % centred over each segment.
//   2. Three-row strip     — ▄ (top edge) / █ (body) / ▀ (bottom edge),
//                            same colour per segment, gives a chunky silhouette.
//   3. Tick ruler          — │ markers under every 25 % with 0/25/50/75/100 %
//                            labels so the reader has an actual scale.
//   4. Legend rows         — colour chip + severity badge (only when HOT/WARN)
//                            + program name + share + CU + mini-bar.

type FlameSeg = { name: string; cu: number; share: number };

// Cool palette — leads with blueBright (the "azul marcante" Nicole asked for),
// then rotates through cyan/magenta/etc. so adjacent segments never share a
// hue. Skipping greenBright on purpose: green now lives in the CALL TREE row
// dot only (OK indicator), keeping the flame's identity distinct.
const FLAME_COOL_PALETTE = [
  chalk.blueBright,
  chalk.cyanBright,
  chalk.magentaBright,
  chalk.blue,
  chalk.cyan,
  chalk.magenta,
];

const flameColor = (share: number, idx: number) => {
  if (share >= 0.5) return chalk.redBright;
  if (share >= 0.25) return chalk.yellowBright;
  return FLAME_COOL_PALETTE[idx % FLAME_COOL_PALETTE.length];
};

function collectFlameSegments(cuProfile: CUProfile | undefined): FlameSeg[] {
  if (!cuProfile?.perInstruction?.length || !cuProfile.totalConsumed) return [];
  const total = cuProfile.totalConsumed;
  const map = new Map<string, { name: string; cu: number }>();
  for (const e of cuProfile.perInstruction) {
    const name = resolveProgramName(e.programId) ?? e.programName ?? e.programId;
    const prev = map.get(e.programId);
    if (prev) prev.cu += e.cuConsumed ?? 0;
    else map.set(e.programId, { name, cu: e.cuConsumed ?? 0 });
  }
  return [...map.values()]
    .map((v) => ({ ...v, share: total > 0 ? v.cu / total : 0 }))
    .sort((a, b) => b.cu - a.cu);
}

function buildFlameGraphLines(cuProfile: CUProfile | undefined, width: number): string[] {
  const segments = collectFlameSegments(cuProfile);
  if (!segments.length) {
    return [chalk.gray('  No flame data available.')];
  }

  // 1. Build the strip widths so they sum to exactly `width`.
  const totalCU = segments.reduce((s, x) => s + x.cu, 0) || 1;
  const widths = segments.map((s) => Math.max(1, Math.floor((s.cu / totalCU) * width)));
  // distribute rounding remainder onto the largest segment
  const used = widths.reduce((a, b) => a + b, 0);
  if (used !== width && widths.length > 0) widths[0] += width - used;

  // Resolve a stable colour for each segment (used in strip + legend so chip
  // matches the bar exactly).
  const colors = segments.map((s, i) => flameColor(s.share, i));

  // 2. Three-row strip: top edge, full body, bottom edge.
  const topEdge: string[] = [];
  const body: string[] = [];
  const botEdge: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const c = colors[i];
    topEdge.push(c('▄'.repeat(widths[i])));
    body.push(c('█'.repeat(widths[i])));
    botEdge.push(c('▀'.repeat(widths[i])));
  }

  // 3. Tick ruler with markers under 0/25/50/75/100 %.
  const ruler = (() => {
    const tickRow = ' '.repeat(width).split('');
    const labelRow = ' '.repeat(width).split('');
    const ticks = [0, 25, 50, 75, 100];
    for (const t of ticks) {
      const idx = Math.min(width - 1, Math.round((t / 100) * (width - 1)));
      tickRow[idx] = '│';
      const lab = t === 0 ? '0' : `${t}%`;
      const start = Math.min(width - lab.length, Math.max(0, idx - Math.floor(lab.length / 2)));
      for (let k = 0; k < lab.length; k++) labelRow[start + k] = lab[k];
    }
    return [chalk.gray(tickRow.join('')), chalk.gray(labelRow.join(''))];
  })();

  // 4. Inline labels centred over each segment wide enough to fit them. The
  //    label uses the segment's own colour so it visually anchors to the strip.
  const innerLabels = (() => {
    type Span = { start: number; text: string; idx: number };
    const spans: Span[] = [];
    let cursor = 0;
    for (let i = 0; i < segments.length; i++) {
      const w = widths[i];
      if (w >= 8) {
        const pctLabel = `${(segments[i].share * 100).toFixed(0)}%`;
        const nameLabel = truncateMid(segments[i].name, Math.max(3, w - pctLabel.length - 1));
        const text = `${nameLabel} ${pctLabel}`;
        const trimmed = truncateMid(text, w - 2);
        const start = cursor + Math.max(0, Math.floor((w - stringWidth(trimmed)) / 2));
        spans.push({ start, text: trimmed, idx: i });
      }
      cursor += w;
    }
    let out = '';
    let pos = 0;
    for (const span of spans) {
      if (span.start > pos) out += ' '.repeat(span.start - pos);
      out += colors[span.idx].bold(span.text);
      pos = span.start + stringWidth(span.text);
    }
    if (pos < width) out += ' '.repeat(width - pos);
    return out;
  })();

  // 5. Legend rows: chip + sev badge (only HOT/WARN) + name + mini-bar + pct + CU.
  const LEGEND_NAME_W = 26;
  const LEGEND_BAR_W = 16;
  const legend = segments.slice(0, 6).map((s, i) => {
    const c = colors[i];
    const chip = c('██');
    let badge: string;
    if (s.share >= 0.5) badge = chalk.bgRedBright.black.bold(' HOT  ');
    else if (s.share >= 0.25) badge = chalk.bgYellowBright.black.bold(' WARN ');
    else badge = chalk.gray('      ');
    const name = padVisible(truncateMid(s.name, LEGEND_NAME_W), LEGEND_NAME_W);
    // mini-bar fills proportional to share, in the segment's own colour
    const filled = Math.max(0, Math.min(LEGEND_BAR_W, Math.round(s.share * LEGEND_BAR_W)));
    const miniBar = c('█'.repeat(filled)) + chalk.gray('░'.repeat(LEGEND_BAR_W - filled));
    const pct = padVisibleStart(`${(s.share * 100).toFixed(1)}%`, 6);
    const cu = padVisibleStart(`${s.cu.toLocaleString('en-US')} CU`, 12);
    const pctColored = c.bold(pct);
    const cuColored = c(cu);
    return `  ${chip}  ${badge}  ${chalk.white(name)}  ${miniBar}  ${pctColored}  ${cuColored}`;
  });

  return [
    innerLabels,
    topEdge.join(''),
    body.join(''),
    botEdge.join(''),
    ruler[0],
    ruler[1],
    '',
    chalk.gray('  ── breakdown ' + '─'.repeat(Math.max(0, width - 16))),
    ...legend,
  ];
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
  // Bar length is normalised against the heaviest instruction (sorted[0])
  // so the longest bar fills the whole track and every other bar is scaled
  // relative to that max — proper profiler-style encoding of CU usage.
  const maxCU = sorted.length > 0 ? sorted[0].cu : 0;

  // Same row anatomy Nicole wants in the screenshot: label  bar  % (bold,
  // threshold-coloured)  CU (threshold-coloured). CU column right-padded so
  // numbers line up no matter how wide the value is.
  const NAME_W = 18;
  const PCT_W = 6; // fits "100.0%"
  const CU_W = 12;
  const BAR_W = Math.max(8, width - NAME_W - PCT_W - CU_W - 6);

  return sorted.map((e) => {
    const pct = e.cu / total;
    const barLengthPct = maxCU > 0 ? e.cu / maxCU : 0;
    const name = padVisible(truncateMid(e.name, NAME_W), NAME_W);
    // Bar length scaled to max; colour is still threshold-by-share so the
    // visual narrative ("how much of the budget") reads alongside the
    // comparative narrative ("how it stacks up vs the heaviest one").
    const filled = Math.max(0, Math.min(BAR_W, Math.floor(barLengthPct * BAR_W)));
    const empty = BAR_W - filled;
    const bar = cuColor(pct)('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    const pctStr = padVisibleStart(`${(pct * 100).toFixed(1)}%`, PCT_W);
    const pctColored = cuColorBold(pct)(pctStr);
    const cuStr = `${e.cu.toLocaleString('en-US')} CU`;
    const cuColored = padVisibleStart(cuColor(pct)(cuStr), CU_W);
    return `${chalk.white(name)}  ${bar}  ${pctColored}  ${cuColored}`;
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

// ─── DASHBOARD: BUDGET BAR ──────────────────────────────────────────────────

function buildBudgetBarLines(consumed: number, limit: number, width: number): string[] {
  const pct = limit > 0 ? consumed / limit : 0;
  const out: string[] = [];
  // Title styled like other section heads so it visually anchors between the
  // CALL TREE and the FLAME GRAPH.
  const title = 'BUDGET TOTAL  ·  used vs ceiling';
  out.push(
    chalk.cyanBright.bold(title) +
      '  ' +
      chalk.gray('─'.repeat(Math.max(0, width - stringWidth(title) - 2)))
  );
  out.push('');
  out.push(gradientBar(pct, width));
  // Bottom labels: 0 on the left, consumed / limit on the right, with the
  // utilization % bolded in threshold colour so it pops against the bar.
  const pctLabel = `${Math.round(pct * 100)}%`;
  const pctColored = cuColorBold(pct)(pctLabel);
  const labelLeft = chalk.gray('0');
  const labelRight =
    pctColored +
    chalk.gray(`   ${consumed.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} CU`);
  const fill = Math.max(1, width - stringWidth(labelLeft) - stringWidth(labelRight));
  out.push(labelLeft + ' '.repeat(fill) + labelRight);
  return out;
}

// ─── DASHBOARD HELPERS ──────────────────────────────────────────────────────

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
    ? buildDashboardTreeLines(cpiNodes, bottleneckTarget, LEFT_W, totalConsumed)
    : [chalk.gray('  No CPI data available.')];
  const flameLines = buildFlameGraphLines(cuProfile, LEFT_W);
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
  // Suggestion intentionally omitted from the right column — the full
  // ACTIONABLE INSIGHTS panel below the dashboard is the single source of
  // truth so the right column stays focused on metrics. Budget bar moved to
  // the left column (between CALL TREE and FLAME GRAPH) so it gets the full
  // LEFT_W width and reads as part of the CU narrative.
  const budgetLines = buildBudgetBarLines(totalConsumed, totalLimit, LEFT_W);

  // Headings get a thin underline so each section reads as a card. The flame
  // strip sits between the tree (structural view) and the per-instruction bars
  // (detail view) so the eye walks: callgraph → flame summary → details.
  const sectionHead = (label: string, accent: (s: string) => string = chalk.cyan.bold) => [
    accent(label) + '  ' + chalk.gray('─'.repeat(Math.max(0, LEFT_W - stringWidth(label) - 2))),
    '',
  ];

  // Column header for CALL TREE rows — widths must mirror the row layout in
  // buildDashboardTreeLines so the dashes align with the data underneath.
  const treeColHeader = chalk.gray(
    padVisible('  program', Math.max(20, LEFT_W - TREE_RIGHT_W)) +
      ' ' +
      padVisible('share', TREE_BAR_W) +
      ' ' +
      padVisible('   %', TREE_PCT_W) +
      '  ' +
      padVisibleStart('CU', TREE_CU_W)
  );

  const leftLines: string[] = [
    ...sectionHead('CALL TREE', chalk.cyan.bold),
    treeColHeader,
    chalk.gray('  ' + '─'.repeat(LEFT_W - 2)),
    ...treeLines,
    '',
    '',
    ...budgetLines,
    '',
    '',
    ...sectionHead('FLAME GRAPH  ·  CU share by program', chalk.magentaBright.bold),
    ...flameLines,
    '',
    '',
    ...sectionHead('COMPUTE UNITS PER INSTRUCTION', chalk.cyan.bold),
    ...barLines,
  ];
  const rightLines: string[] = [...kpiLines, '', ...cpiDetailLines];

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
//
// Each anomaly renders as a self-contained card so the section reads like a
// formal incident report rather than a flat log:
//
//   ╭─ [ HIGH ] · spam ─────────────────────────────────── confidence 85% ─╮
//   │                                                                       │
//   │  ⚠  Suspicious spam token transfer: 1,580,738.23 tokens of unverified │
//   │     mint FraUdp6Y…56jau5                                              │
//   │                                                                       │
//   ╰───────────────────────────────────────────────────────────────────────╯
//
// Severity drives the badge colour (red/yellow/cyan), the icon, and the
// confidence threshold colouring so the eye triages without reading words.

const severityAccent = (sev: string) => {
  if (sev === 'high') return chalk.redBright;
  if (sev === 'medium') return chalk.yellowBright;
  return chalk.cyanBright;
};

const confidenceColored = (confidence: number): string => {
  const pct = `${(confidence * 100).toFixed(0)}%`;
  if (confidence >= 0.8) return chalk.redBright.bold(pct);
  if (confidence >= 0.5) return chalk.yellowBright.bold(pct);
  return chalk.greenBright.bold(pct);
};

const wrapText = (text: string, width: number): string[] => {
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
};

const renderAnomalies = (report: any) => {
  const anomalies: any[] = report?.anomalies ?? [];
  const count = anomalies.length;

  console.log('');

  // Section title — the count is appended in plain text rather than a
  // background-coloured pill so it reads as a label, not a billboard.
  const subtitle =
    count === 0
      ? chalk.gray('· nothing suspicious')
      : count === 1
        ? chalk.gray('· 1 detected')
        : chalk.gray(`· ${count} detected`);
  console.log('  ' + chalk.cyan.bold('ANOMALIES') + '  ' + subtitle);
  console.log('  ' + chalk.gray('─'.repeat(WIDTH - 2)));

  if (count === 0) {
    console.log('  ' + chalk.gray('No spam, MEV, or unusual patterns detected.'));
    return;
  }

  // Column widths so every entry lines up: idx · severity · type · confidence
  // · description (wrapped). Description text indents under the type column so
  // multi-line entries stay readable.
  const IDX_W = 4; // "  1." padded
  const SEV_W = 10; // "[HIGH]   " etc
  const TYPE_W = 14; // type slug
  const CONF_W = 18; // "confidence 85%"
  const DESC_INDENT = ' '.repeat(IDX_W);
  const DESC_W = WIDTH - 2 - IDX_W;

  for (let i = 0; i < anomalies.length; i++) {
    const a = anomalies[i];
    const sev = String(a.severity ?? 'low').toLowerCase();
    const accent = severityAccent(sev);
    const sevTag = padVisible(accent.bold(`[${sev.toUpperCase()}]`), SEV_W);
    const typeText = padVisible(chalk.white.bold(a.type ?? 'unknown'), TYPE_W);
    const confidence = Number(a.confidence ?? 0);
    const confLabel = padVisible(chalk.gray('confidence ') + confidenceColored(confidence), CONF_W);

    const idxLabel = padVisible(chalk.gray(`${i + 1}.`), IDX_W - 1) + ' ';

    // Header line: 1.  [HIGH]    spam            confidence 85%
    console.log('  ' + idxLabel + sevTag + typeText + confLabel);

    // Description, wrapped under the indent so it reads as one block.
    const wrapped = wrapText(String(a.description ?? ''), DESC_W - 2);
    wrapped.forEach((line) => {
      console.log('  ' + DESC_INDENT + chalk.white(line));
    });

    // Spacer between entries (not after the last one).
    if (i < anomalies.length - 1) console.log('');
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
