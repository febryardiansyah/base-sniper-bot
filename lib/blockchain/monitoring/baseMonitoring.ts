import { ethers } from 'ethers';
import { BaseContracts } from '../../contracts/contracts';
import { BigBuyData } from '../../interface/types';
import { checkTokenInfo } from '../../services/info';
import { MonitoringTelegram, telegramBot } from '../../telegram/telegram';
import { BlacklistUtils } from '../../utils/blacklistUtils';
import { config } from '../../utils/config';
import { sleep } from '../../utils/utils';
import { analyzePair, shouldAlert } from '../pairAnalyzer';
import { isContractVerified } from '../../services/etherscan';
import { BaseProviders } from '../providers';

// Constants for thresholds
const MIN_ETH = ethers.parseEther('5'); // 5 ETH
const MIN_USDC = ethers.parseUnits('20000', 6); // 20,000 USDC (6 decimals)

// Helper functions for V3 and V4 monitoring
function meetsThreshold(tokenAddr: string, rawAmount: bigint): boolean {
  const a = rawAmount >= 0n ? rawAmount : -rawAmount; // V4 emits int256 (positive for add)
  if (tokenAddr.toLowerCase() === config.WETH_ADDRESS.toLowerCase()) return a >= MIN_ETH;
  if (tokenAddr.toLowerCase() === config.USDC_ADDRESS.toLowerCase()) return a >= MIN_USDC;
  return false;
}

function formatAmount(tokenAddr: string, rawAmount: bigint): string {
  const a = rawAmount >= 0n ? rawAmount : -rawAmount;
  const decimals = tokenAddr.toLowerCase() === config.USDC_ADDRESS.toLowerCase() ? 6 : 18;
  return ethers.formatUnits(a, decimals);
}

// Tracked pairs and transactions to avoid duplicates
const trackedPairs = new Set<string>();
const trackedTransactions = new Set<string>();

// Map to track Uniswap V4 pool IDs to their currencies
const idToCurrencies = new Map<string, { currency0: string; currency1: string }>();

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
function monitorNewPairs(): void {
  // Monitor Uniswap V2 and Aerodrome pairs
  BaseContracts.factories.forEach((factory, index) => {
    const factoryName = BaseContracts.factoryNames[index];
    const isAerodrome = factoryName.toLowerCase().includes('aerodrome');

    if (isAerodrome) {
      // Aerodrome signature: PoolCreated(address token0, address token1, bool stable, address pool, uint256)
      factory.on(
        'PoolCreated',
        async (
          token0: string,
          token1: string,
          stable: boolean,
          poolAddress: string,
          poolIndex: bigint
        ) => {
          await handleNewPair({
            token0,
            token1,
            pairAddress: poolAddress,
            factoryName,
            extra: { stable, poolIndex },
          });
        }
      );
    } else {
      // Uniswap V2 signature: PairCreated(address token0, address token1, address pair, uint256)
      factory.on(
        'PairCreated',
        async (token0: string, token1: string, pairAddress: string, pairIndex: bigint) => {
          await handleNewPair({
            token0,
            token1,
            pairAddress,
            factoryName,
            extra: { pairIndex },
          });
        }
      );
    }
  });
  interface NewPairParams {
    token0: string;
    token1: string;
    pairAddress: string;
    factoryName: string;
    extra?: Record<string, unknown>;
  }

  async function handleNewPair(params: NewPairParams) {
    const { token0, token1, pairAddress, factoryName, extra } = params;
    try {
      console.log(`🆕 New pair detected on ${factoryName}: ${pairAddress}`);
      if (
        factoryName.toLowerCase().includes('aerodrome') &&
        extra &&
        typeof (extra as Record<string, unknown>).stable === 'boolean'
      ) {
        console.log(`   • Type: ${extra.stable ? 'Stable' : 'Volatile'}`);
      }
      if (trackedPairs.has(pairAddress.toLowerCase())) return;
      trackedPairs.add(pairAddress.toLowerCase());
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
        // Append stable/volatile info for Aerodrome pools
        if (
          factoryName.toLowerCase().includes('aerodrome') &&
          extra &&
          typeof (extra as Record<string, unknown>).stable === 'boolean'
        ) {
          pairInfo.pairAddress = `${pairInfo.pairAddress} (${extra.stable ? 'Stable' : 'Volatile'})`;
        }
        await MonitoringTelegram.sendPairAlert(pairInfo, factoryName);
      }
    } catch (error) {
      console.error(`Error processing new pair ${pairAddress}:`, error);
    }
  }

  // Monitor Uniswap V3 pools
  BaseContracts.uniswapV3Factory.on(
    'PoolCreated',
    async (
      token0: string,
      token1: string,
      fee: number,
      tickSpacing: number,
      pool: string
      // event: ethers.EventLog
    ) => {
      console.log(`🟦 New V3 pool detected: ${pool}`);
      console.log(`
    ✅ [V3] New Pool Confirmed!
    -----------------------------------------
    Pool Address: ${pool}
    Tokens: ${token0}, ${token1}
    Fee: ${fee}
    -----------------------------------------
  `);
      // console.log(`    token0=${token0} token1=${token1} fee=${fee} tickSpacing=${tickSpacing}`);
      // console.log(`    tx=${Event.transactionHash}`);
      try {
        // Create a contract instance for the pool to listen for Mint events
        const poolContract = await analyzePair(pool, token0, token1);
        if (!poolContract) return;

        console.log(
          `🟦 Listening for liquidity additions on V3 pool: ${poolContract.liquidityETH}`
        );

        // poolContract.on(
        //   'Mint',
        //   async (
        //     sender: string,
        //     owner: string,
        //     tickLower: number,
        //     tickUpper: number,
        //     amount: bigint,
        //     amount0: bigint,
        //     amount1: bigint,
        //     ev2: ethers.EventLog
        //   ) => {
        //     // Check thresholds on either side if token matches WETH/USDC
        //     let hit = false;
        //     if (
        //       token0.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ||
        //       token0.toLowerCase() === config.USDC_ADDRESS.toLowerCase()
        //     ) {
        //       if (meetsThreshold(token0, amount0)) hit = true;
        //     }
        //     if (
        //       token1.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ||
        //       token1.toLowerCase() === config.USDC_ADDRESS.toLowerCase()
        //     ) {
        //       if (meetsThreshold(token1, amount1)) hit = true;
        //     }

        //     if (hit) {
        //       console.log('✅ [V3] Mint meets threshold');
        //       console.log(`    pool=${pool} owner=${owner}`);

        //       if (
        //         token0.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ||
        //         token0.toLowerCase() === config.USDC_ADDRESS.toLowerCase()
        //       ) {
        //         console.log(
        //           `    amount0=${formatAmount(token0, amount0)} ${token0.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : 'USDC'}`
        //         );
        //       } else {
        //         console.log(`    amount0=${amount0} (token0 ${token0})`);
        //       }

        //       if (
        //         token1.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ||
        //         token1.toLowerCase() === config.USDC_ADDRESS.toLowerCase()
        //       ) {
        //         console.log(
        //           `    amount1=${formatAmount(token1, amount1)} ${token1.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : 'USDC'}`
        //         );
        //       } else {
        //         console.log(`    amount1=${amount1} (token1 ${token1})`);
        //       }

        //       console.log(`    tx=${ev2.transactionHash}`);

        //       // Send Telegram alert
        //       const message =
        //         `🔵 *Uniswap V3 Liquidity Added*\n` +
        //         `Pool: \`${pool}\`\n` +
        //         `Owner: \`${owner}\`\n` +
        //         `Token0: ${token0.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : token0.toLowerCase() === config.USDC_ADDRESS.toLowerCase() ? 'USDC' : token0}\n` +
        //         `Token1: ${token1.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : token1.toLowerCase() === config.USDC_ADDRESS.toLowerCase() ? 'USDC' : token1}\n` +
        //         `Amount0: ${formatAmount(token0, amount0)}\n` +
        //         `Amount1: ${formatAmount(token1, amount1)}\n` +
        //         `TX: [View](https://basescan.org/tx/${ev2.transactionHash})`;

        //       telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        //     }
        //   }
        // );
      } catch (error) {
        console.error(`Error processing V3 pool ${pool}:`, error);
      }
    }
  );

  // Monitor Uniswap V4 pools
  BaseContracts.uniswapV4PoolManager.on(
    'Initialize',
    async (
      id: string,
      currency0: string,
      currency1: string,
      fee: number,
      tickSpacing: number,
      hooks: string,
      event: ethers.EventLog
    ) => {
      try {
        console.log(`🟪 New V4 pool initialized: ${id}`);
        // console.log(`    currency0=${currency0} currency1=${currency1} fee=${fee} tickSpacing=${tickSpacing}`);
        // console.log(`    tx=${event.log.transactionHash}`);

        // Store the currency mapping for this pool ID
        idToCurrencies.set(id, { currency0, currency1 });
      } catch (error) {
        console.error(`Error processing V4 pool initialization ${id}:`, error);
      }
    }
  );

  BaseContracts.uniswapV4PoolManager.on(
    'ModifyLiquidity',
    async (
      id: string,
      owner: string,
      tickLower: number,
      tickUpper: number,
      liquidityDelta: bigint,
      event: ethers.EventLog
    ) => {
      console.log(`\n🟧 [V4] ModifyLiquidity  id=${id}`);
      try {
        // Only process liquidity additions
        if (liquidityDelta <= 0n) return;

        // Get transaction receipt to check token transfers
        const receipt = await BaseProviders.wsProvider.getTransactionReceipt(event.transactionHash);
        if (!receipt) return;

        // Get the currencies for this pool ID
        const currencies = idToCurrencies.get(id);
        if (!currencies) {
          console.log(`⚠️ Unknown pool ID: ${id}`);
          return;
        }

        const { currency0, currency1 } = currencies;

        // Check if any of the currencies is WETH or USDC
        const isToken0WethOrUsdc =
          currency0.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ||
          currency0.toLowerCase() === config.USDC_ADDRESS.toLowerCase();

        const isToken1WethOrUsdc =
          currency1.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ||
          currency1.toLowerCase() === config.USDC_ADDRESS.toLowerCase();

        // If neither token is WETH or USDC, we're not interested
        if (!isToken0WethOrUsdc && !isToken1WethOrUsdc) return;

        // Find the transfer logs for the tokens we're interested in
        let amount0 = 0n;
        let amount1 = 0n;

        for (const log of receipt.logs) {
          // Check for Transfer events (topic0 is the event signature for Transfer)
          if (
            log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          ) {
            const tokenAddress = log.address.toLowerCase();

            // Check if this is a transfer of one of our tokens of interest
            if (tokenAddress === currency0.toLowerCase() && isToken0WethOrUsdc) {
              // Parse the amount from the data field
              amount0 = BigInt(log.data);
            } else if (tokenAddress === currency1.toLowerCase() && isToken1WethOrUsdc) {
              // Parse the amount from the data field
              amount1 = BigInt(log.data);
            }
          }
        }

        // Check if either amount meets our threshold
        let hit = false;
        if (isToken0WethOrUsdc && amount0 > 0n) {
          if (meetsThreshold(currency0, amount0)) hit = true;
        }
        if (isToken1WethOrUsdc && amount1 > 0n) {
          if (meetsThreshold(currency1, amount1)) hit = true;
        }

        if (hit) {
          console.log('✅ [V4] ModifyLiquidity meets threshold');
          console.log(`    pool=${id} owner=${owner}`);

          if (isToken0WethOrUsdc) {
            console.log(
              `    amount0=${formatAmount(currency0, amount0)} ${currency0.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : 'USDC'}`
            );
          }

          if (isToken1WethOrUsdc) {
            console.log(
              `    amount1=${formatAmount(currency1, amount1)} ${currency1.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : 'USDC'}`
            );
          }

          console.log(`    tx=${event.transactionHash}`);

          // Send Telegram alert
          const message =
            `🟣 *Uniswap V4 Liquidity Added*\n` +
            `Pool ID: \`${id}\`\n` +
            `Owner: \`${owner}\`\n` +
            `Currency0: ${currency0.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : currency0.toLowerCase() === config.USDC_ADDRESS.toLowerCase() ? 'USDC' : currency0}\n` +
            `Currency1: ${currency1.toLowerCase() === config.WETH_ADDRESS.toLowerCase() ? 'WETH' : currency1.toLowerCase() === config.USDC_ADDRESS.toLowerCase() ? 'USDC' : currency1}\n` +
            (isToken0WethOrUsdc ? `Amount0: ${formatAmount(currency0, amount0)}\n` : '') +
            (isToken1WethOrUsdc ? `Amount1: ${formatAmount(currency1, amount1)}\n` : '') +
            `TX: [View](https://basescan.org/tx/${event.transactionHash})`;

          telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        console.error(`Error processing V4 pool liquidity modification ${id}:`, error);
      }
    }
  );

  BaseContracts.zoraFactory.on('CoinCreatedV4', onCoinCreated);
  BaseContracts.zoraFactory.on('CreatorCoinCreated', onCoinCreated);
}
function stopMonitorNewPairs(): void {
  BaseContracts.factories.forEach(factory => {
    factory.off('PairCreated');
    factory.removeAllListeners();
  });

  BaseContracts.zoraFactory.off('CoinCreatedV4', onCoinCreated);
  BaseContracts.zoraFactory.off('CreatorCoinCreated', onCoinCreated);

  BaseContracts.uniswapV3Factory.off('PoolCreated');
  BaseContracts.uniswapV3Factory.removeAllListeners();

  BaseContracts.uniswapV4PoolManager.off('Initialize');
  BaseContracts.uniswapV4PoolManager.off('ModifyLiquidity');
  BaseContracts.uniswapV4PoolManager.removeAllListeners();
}

// Monitor big buy events on routers
function monitorBigBuys(): void {
  BaseContracts.routers.forEach((router, index) => {
    const routerName = BaseContracts.routerNames[index];

    router.on(
      'Swap',
      async (
        sender: string,
        amountIn: bigint,
        amountOutMin: bigint,
        path: string[],
        to: string,
        event: ethers.EventLog
      ) => {
        try {
          const txHash = event.transactionHash;

          if (trackedTransactions.has(txHash)) {
            return;
          }

          trackedTransactions.add(txHash);

          if (!Array.isArray(path) || path.length < 2) return;

          const inputToken = path[0].toLowerCase();
          const outputToken = path[path.length - 1].toLowerCase();

          // Check if buying with ETH
          if (inputToken === config.WETH_ADDRESS) {
            const ethAmount = parseFloat(ethers.formatEther(amountIn));

            if (ethAmount >= config.BIG_BUY_THRESHOLD) {
              const tokenInfo = await checkTokenInfo(outputToken);
              const buyData: BigBuyData = {
                sender,
                ethAmount,
                tokenInfo,
                routerName,
                txHash,
              };
              await MonitoringTelegram.sendBuyAlert(buyData);
            }
          }
        } catch (error) {
          console.error('Error processing swap event:', error);
        }
      }
    );
  });
}
function stopMonitorBigBuys(): void {
  BaseContracts.routers.forEach(router => {
    router.off('Swap');
    router.removeAllListeners();
  });
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
