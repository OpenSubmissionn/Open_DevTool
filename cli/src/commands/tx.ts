import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';

export const registerTxCommand = (program: Command) => {
  program
    .command('tx')
    .argument('<signature>', 'The transaction signature')
    .option('--network <type>', 'Solana network', 'mainnet')
    .option('--json', 'Output raw JSON', false)
    .action(async (signature: string, options: any) => {
      
      // (![87, 88].includes(signature.length)) {
      //console.error(chalk.red('\nError: Invalid signature length.'));
      //process.exit(1);
     //

      const spinner = ora(`Connecting to RPC...`).start();

      try {
        // 🚀 O PULO DO GATO: Import dinâmico dentro da função
        // Isso ignora os erros de compilação e resolve em tempo de execução
        // @ts-ignore
        const rpcModule = await import('../../../services/src/solana/rpc.js');
        const bundle = await rpcModule.fetchTransaction(signature);

        spinner.succeed(chalk.green('Live data retrieved!'));

        if (options.json) {
          console.log(JSON.stringify(bundle, null, 2));
        } else {
          console.log('\n' + chalk.bold.underline('--- LIVE ANALYSIS ---'));
          console.log(`${chalk.blue('Slot:')} ${bundle.slot}`);
          console.log(`${chalk.blue('CU Consumed:')} ${chalk.green(bundle.computeUnitsConsumed || '0')}`);
          
          if (bundle.logs && bundle.logs.length > 0) {
            console.log(chalk.bold('\nRecent Logs:'));
            bundle.logs.slice(0, 3).forEach((l: string) => {
              console.log(chalk.gray(`> ${l}`));
            });
          }
        }
      } catch (error: any) {
        spinner.fail(chalk.red('Integration Error'));
        console.error(chalk.yellow(`\nMessage: ${error.message}`));
      }
    });
};