import Table from "cli-table3";
import chalk from "chalk";
import { AccountDiff } from "../../../../services/src/analysis/types";

type Props = {
  accounts: AccountDiff[];
};

export const AccountsTable = ({ accounts }: Props) => {
  const table = new Table({
    head: ["Account", "Role", "SOL Δ", "Token Δ"],
    colWidths: [20, 12, 15, 20],
  });

  accounts.forEach((account) => {
    const shortPubkey = truncatePubkey(account.pubkey);

    const solChange = formatSol(account.solDelta);
    const tokenChange = formatToken(account.tokenDeltas);

    table.push([
      shortPubkey,
      account.role,
      solChange,
      tokenChange || "—",
    ]);
  });

  return table.toString();
};

// Helpers

const truncatePubkey = (pubkey: string) => {
  if (!pubkey) return "unknown";
  return pubkey.slice(0, 4) + "..." + pubkey.slice(-4);
};

const formatSol = (lamports: number) => {
  if (!lamports) return "0";

  const sol = lamports / 1_000_000_000;
  const value = sol.toFixed(6);

  if (sol > 0) return chalk.green(`+${value}`);
  if (sol < 0) return chalk.red(value);

  return value;
};

const formatToken = (tokenDeltas: any[]) => {
  if (!tokenDeltas || tokenDeltas.length === 0) return null;

  return tokenDeltas
    .map((token) => {
      const amount = Number(token.delta || 0);
      const symbol = token.symbol || "TOKEN";

      if (amount > 0) return chalk.green(`+${amount} ${symbol}`);
      if (amount < 0) return chalk.red(`${amount} ${symbol}`);

      return `${amount} ${symbol}`;
    })
    .join(", ");
};