import chalk from 'chalk';
import Table from 'cli-table3';
import { AnalyzedTransaction, InsightReport, AccountDiff } from '../../../../services/src';
 
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
 
// ─── CPI TREE ────────────────────────────────────────────────────────────────
 
const renderCPINode = (node: any, prefix: string, isLast: boolean) => {
  const connector = isLast ? '└── ' : '├── ';
  const childPrefix = prefix + (isLast ? '    ' : '│   ');
  const statusIcon = node.status === 'success' ? chalk.green('✓') : chalk.red('✗');
  const cu = (node.cuConsumed ?? 0).toLocaleString();
 
  console.log(`  │ ${chalk.gray(prefix + connector)}${statusIcon} ${chalk.white.bold(node.programName || 'Unknown')} ${chalk.gray(`(${cu} CU)`)}`);
 
  if (node.children && node.children.length > 0) {
    node.children.forEach((child: any, index: number) => {
      renderCPINode(child, childPrefix, index === node.children.length - 1);
    });
  }
};
 
const renderCPITree = (tree: any) => {
  console.log('');
  console.log(`  ┌${line('─')}┐`);
  console.log(`  │ ${chalk.cyan.bold('CPI CALL TREE')}`.padEnd(WIDTH + 9) + '  │');
  console.log(`  │`.padEnd(WIDTH + 4) + '  │');
 
  if (!tree?.root || tree.root.length === 0) {
    console.log(`  │ ${chalk.gray('[ No CPI data available ]')}`.padEnd(WIDTH + 12) + '  │');
  } else {
    tree.root.forEach((node: any, index: number) => {
      renderCPINode(node, '', index === tree.root.length - 1);
    });
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
 
  const cpiData = (analyzed as any).cpiTree;
  const accountDiffs = (analyzed as any).accountDiffs || [];
  const insightsList = Array.isArray(insights)
    ? insights
    : (insights as any)?.insights || [];
 
  renderHeader(signature, analyzed.success, slot, fee, network);
  renderCPITree(cpiData);
  renderAccountsTable(accountDiffs);
  renderInsights(insightsList);
 
  console.log('');
};