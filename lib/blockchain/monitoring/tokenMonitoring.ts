import { ethers } from 'ethers';
import * as BaseContracts from '../contracts';
import { isContractVerified } from '../../services/etherscan.service';
import { MonitoringTelegram, telegramBot } from '../../telegram/telegram';
import { BlacklistUtils } from '../../utils/blacklistUtils';
import { config } from '../../utils/config';
import { sleep } from '../../utils/utils';
import { analyzePair, shouldAlert } from '../pairAnalyzer';
import { BaseProviders } from '../providers';

const trackedPairsUniswapV2 = new Set<string>();
const trackedPairsUniswapV3 = new Set<string>();

let isMonitoring = false;

async function onCoinCreated(
  caller: string,
  payoutRecipient: string,
  platformReferrer: string,
  currency: string,
  uri: string,
  name: string,
  symbol: string,
  coin: string,
  poolKey: any,
  poolKeyHash: string,
  version: string
): Promise<void> {
  console.log(`🆕 New coin created on Zora: ${coin}`);
  telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, `🆕 New coin created on Zora: ${coin}`);
}

// Monitor new pair creation events
async function monitorNewPairs(): Promise<void> {
  // Monitor Uniswap V2 and Aerodrome pairs
  BaseContracts.uniswapV2Factory.on(
    'PairCreated',
    async (token0: string, token1: string, pairAddress: string, pairIndex: bigint) => {
      try {
        console.log(`🆕 New pair detected on Uniswap V2: ${pairAddress}`);

        if (trackedPairsUniswapV2.has(pairAddress.toLowerCase())) return;
        trackedPairsUniswapV2.add(pairAddress.toLowerCase());

        await sleep(config.RETRY_DELAY_MS * config.BLOCK_CONFIRMATION_COUNT);

        const pairInfo = await analyzePair(pairAddress, token0, token1);

        if (!pairInfo) return;

        const isShouldAlert = shouldAlert(pairInfo);
        const isBlackListed =
          BlacklistUtils.isBlacklisted(pairInfo.token0.symbol) ||
          BlacklistUtils.isBlacklisted(pairInfo.token1.symbol);

        if (isShouldAlert && !isBlackListed) {
          const lowerWeth = config.WETH_ADDRESS.toLowerCase();
          const verificationPromises: Promise<void>[] = [];

          if (pairInfo.token0.address.toLowerCase() !== lowerWeth) {
            verificationPromises.push(
              (async () => {
                pairInfo.token0Verified = await isContractVerified(pairInfo.token0.address);
              })()
            );
          }

          if (pairInfo.token1.address.toLowerCase() !== lowerWeth) {
            verificationPromises.push(
              (async () => {
                pairInfo.token1Verified = await isContractVerified(pairInfo.token1.address);
              })()
            );
          }

          if (verificationPromises.length) await Promise.all(verificationPromises);

          await MonitoringTelegram.sendPairAlert(pairInfo, 'Uniswap V2');
        }
      } catch (error) {
        console.error(`Error processing new pair ${pairAddress}:`, error);
      }
    }
  );

  // Monitor Uniswap V3 pools
  BaseContracts.uniswapV3Factory.on(
    'PoolCreated',
    async (token0: string, token1: string, fee: number, tickSpacing: number, pool: string) => {
      console.log(`🟦 New V3 pool detected: ${pool}`);
      try {
        const poolContract = BaseContracts.createPairContract(pool, 3);

        const [token0Addr, token1Addr, fee, slot0Res, liquidityActive] = await Promise.all([
          poolContract.token0(),
          poolContract.token1(),
          poolContract.fee(),
          poolContract.slot0(),
          poolContract.liquidity(),
        ]);

        poolContract.on(
          'Mint',
          async (
            sender: string,
            owner: string,
            tickLower: number,
            tickUpper: number,
            amount: bigint,
            amount0: bigint,
            amount1: bigint,
            ev2: ethers.EventLog
          ) => {
            if (trackedPairsUniswapV3.has(pool.toLowerCase())) return;
            trackedPairsUniswapV3.add(pool.toLowerCase());

            const pairInfo = await analyzePair(pool, token0Addr, token1Addr, 3);
            console.log(`🟦 [V3] Mint pairInfo:`, { ...pairInfo });
            if (!pairInfo) return;

            let liquidityETH = 0;
            if (token0.toLowerCase() === config.WETH_ADDRESS) {
              liquidityETH = parseFloat(ethers.formatEther(amount0));
            } else if (token1.toLowerCase() === config.WETH_ADDRESS) {
              liquidityETH = parseFloat(ethers.formatEther(amount1));
            }

            if (amount0 > 0 && amount1 > 0) {
              console.log(
                `🟦 [V3] New token alert: ${pairInfo.token0.symbol}/${pairInfo.token1.symbol}`
              );
              pairInfo.liquidityETH = liquidityETH;
              await MonitoringTelegram.sendPairAlert(pairInfo, 'Uniswap V3');
            }
          }
        );
      } catch (error) {
        console.error(`Error processing V3 pool ${pool}:`, error);
      }
    }
  );

  // Monitor Uniswap V4 pools
  // BaseContracts.uniswapV4PoolManager.on(
  //   'Initialize',
  //   async (
  //     id: string,
  //     currency0: string,
  //     currency1: string,
  //     fee: number,
  //     tickSpacing: number,
  //     hooks: string,
  //     event: ethers.EventLog
  //   ) => {
  //     try {
  //       console.log(`🟪 New V4 pool initialized: ${id}`);
  //       // console.log(`    currency0=${currency0} currency1=${currency1} fee=${fee} tickSpacing=${tickSpacing}`);
  //       // console.log(`    tx=${event.log.transactionHash}`);

  //       // Store the currency mapping for this pool ID
  //       idToCurrencies.set(id, { currency0, currency1 });
  //     } catch (error) {
  //       console.error(`Error processing V4 pool initialization ${id}:`, error);
  //     }
  //   }
  // );

  // BaseContracts.uniswapV4PoolManager.on(
  //   'ModifyLiquidity',
  //   async (
  //     id: string,
  //     owner: string,
  //     tickLower: number,
  //     tickUpper: number,
  //     liquidityDelta: bigint,
  //     event: ethers.EventLog
  //   ) => {
  //     console.log(`\n🟧 [V4] ModifyLiquidity  id=${id}`);
  //     try {
  //       // Only process liquidity additions
  //       if (liquidityDelta <= 0n) return;

  //       // Get transaction receipt to check token transfers
  //       const receipt = await BaseProviders.wsProvider.getTransactionReceipt(event.transactionHash);
  //       if (!receipt) return;

  //       // Get the currencies for this pool ID
  //       const currencies = idToCurrencies.get(id);
  //       if (!currencies) {
  //         console.log(`⚠️ Unknown pool ID: ${id}`);
  //         return;
  //       }

  //       const { currency0, currency1 } = currencies;

  //       // Check if any of the currencies is WETH or USDC
  //       const isToken0WethOrUsdc =
  //         currency0.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ||
  //         currency0.toLowerCase() === config.USDC_ADDRESS.toLowerCase();

  //       const isToken1WethOrUsdc =
  //         currency1.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ||
  //         currency1.toLowerCase() === config.USDC_ADDRESS.toLowerCase();

  //       // If neither token is WETH or USDC, we're not interested
  //       if (!isToken0WethOrUsdc && !isToken1WethOrUsdc) return;

  //       // Find the transfer logs for the tokens we're interested in
  //       let amount0 = 0n;
  //       let amount1 = 0n;

  //       for (const log of receipt.logs) {
  //         // Check for Transfer events (topic0 is the event signature for Transfer)
  //         if (
  //           log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
  //         ) {
  //           const tokenAddress = log.address.toLowerCase();

  //           // Check if this is a transfer of one of our tokens of interest
  //           if (tokenAddress === currency0.toLowerCase() && isToken0WethOrUsdc) {
  //             // Parse the amount from the data field
  //             amount0 = BigInt(log.data);
  //           } else if (tokenAddress === currency1.toLowerCase() && isToken1WethOrUsdc) {
  //             // Parse the amount from the data field
  //             amount1 = BigInt(log.data);
  //           }
  //         }
  //       }

  //       // Check if either amount meets our threshold
  //       let hit = false;
  //       if (isToken0WethOrUsdc && amount0 > 0n) {
  //         if (meetsThreshold(currency0, amount0)) hit = true;
  //       }
  //       if (isToken1WethOrUsdc && amount1 > 0n) {
  //         if (meetsThreshold(currency1, amount1)) hit = true;
  //       }

  //       if (hit) {
  //         console.log('✅ [V4] ModifyLiquidity meets threshold');
  //         console.log(`    pool=${id} owner=${owner}`);

  //         if (isToken0WethOrUsdc) {
  //           console.log(
  //             `    amount0=${formatAmount(currency0, amount0)} ${currency0.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : 'USDC'}`
  //           );
  //         }

  //         if (isToken1WethOrUsdc) {
  //           console.log(
  //             `    amount1=${formatAmount(currency1, amount1)} ${currency1.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : 'USDC'}`
  //           );
  //         }

  //         console.log(`    tx=${event.transactionHash}`);

  //         // Send Telegram alert
  //         const message =
  //           `🟣 *Uniswap V4 Liquidity Added*\n` +
  //           `Pool ID: \`${id}\`\n` +
  //           `Owner: \`${owner}\`\n` +
  //           `Currency0: ${currency0.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : currency0.toLowerCase() === config.USDC_ADDRESS.toLowerCase() ? 'USDC' : currency0}\n` +
  //           `Currency1: ${currency1.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : currency1.toLowerCase() === config.USDC_ADDRESS.toLowerCase() ? 'USDC' : currency1}\n` +
  //           (isToken0WethOrUsdc ? `Amount0: ${formatAmount(currency0, amount0)}\n` : '') +
  //           (isToken1WethOrUsdc ? `Amount1: ${formatAmount(currency1, amount1)}\n` : '') +
  //           `TX: [View](https://basescan.org/tx/${event.transactionHash})`;

  //         telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
  //       }
  //     } catch (error) {
  //       console.error(`Error processing V4 pool liquidity modification ${id}:`, error);
  //     }
  //   }
  // );

  // BaseContracts.zoraFactory.on('CoinCreatedV4', onCoinCreated);
  // BaseContracts.zoraFactory.on('CreatorCoinCreated', onCoinCreated);
}
function stopMonitorNewPairs(): void {
  BaseContracts.uniswapV2Factory.off('PairCreated');
  BaseContracts.uniswapV2Factory.removeAllListeners();

  BaseContracts.zoraFactory.off('CoinCreatedV4', onCoinCreated);
  BaseContracts.zoraFactory.off('CreatorCoinCreated', onCoinCreated);

  BaseContracts.uniswapV3Factory.off('PoolCreated');
  BaseContracts.uniswapV3Factory.removeAllListeners();

  BaseContracts.uniswapV4PoolManager.off('Initialize');
  BaseContracts.uniswapV4PoolManager.off('ModifyLiquidity');
  BaseContracts.uniswapV4PoolManager.removeAllListeners();
}

// Monitor blocks for logging
function monitorBlocks(): void {
  BaseProviders.wsProvider.on('block', (blockNumber: number) => {
    console.log(`📦 Block ${blockNumber}`);
  });
}

function stopMonitorBlocks(): void {
  BaseProviders.wsProvider.off('block');
  BaseProviders.wsProvider.removeAllListeners();
}

export function startMonitor(): void {
  isMonitoring = true;
  monitorNewPairs();
  // monitorBlocks();
}

export function stopMonitor(): void {
  isMonitoring = false;
  stopMonitorNewPairs();
  // stopMonitorBlocks();
}

export function statusMonitoring(): boolean {
  return isMonitoring;
}
