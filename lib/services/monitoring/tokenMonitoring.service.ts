import { ethers } from 'ethers';
import { isContractVerified } from '../etherscan.service';
import { MonitoringTelegram, telegramService } from '../../telegram/telegram';
import { BlacklistUtils } from '../../utils/blacklistUtils';
import { config } from '../../utils/config';
import { sleep } from '../../utils/utils';
import { analyzePair, shouldAlert } from '../../contracts/pairAnalyzer';
import { BaseProviders } from '../../contracts/providers';
import {
  createPairContract,
  uniswapV2Factory,
  uniswapV3Factory,
  zoraFactory,
} from '../../contracts/contracts';
import { stateService } from '../state.service';
import { TFactorySelected } from '../../interface/token.interface';

class TokenMonitoringService {
  private trackedPairsUniswapV2 = new Set<string>();
  private trackedPairsUniswapV3 = new Set<string>();
  private monitoring = false;
  private selectedFactories = new Set<TFactorySelected>();

  // Bound handlers for removal
  private onPairCreatedHandler?: (
    token0: string,
    token1: string,
    pairAddress: string,
    pairIndex: bigint
  ) => void;
  private onPoolCreatedHandler?: (
    token0: string,
    token1: string,
    fee: number,
    tickSpacing: number,
    pool: string
  ) => void;
  private onCoinCreatedHandler?: (
    caller: string,
    payoutRecipient: string,
    platformReferrer: string,
    currency: string,
    uri: string,
    name: string,
    symbol: string,
    coin: string,
    poolKey: unknown,
    poolKeyHash: string,
    version: string
  ) => void;

  private async onCoinCreated(
    caller: string,
    payoutRecipient: string,
    platformReferrer: string,
    currency: string,
    uri: string,
    name: string,
    symbol: string,
    coin: string,
    poolKey: unknown,
    poolKeyHash: string,
    version: string
  ): Promise<void> {
    console.log(`🆕 New coin created on Zora: ${coin}`);
    try {
      await telegramService.bot.sendMessage(
        config.TELEGRAM_CHAT_ID,
        `🆕 New coin created on Zora: ${coin}`
      );
    } catch (e) {
      console.error('Failed to send Zora coin created message', e);
    }
  }

  private refreshSelectedFactories(): void {
    const cfg = stateService.getConfig();
    const list = (cfg.factorySelected || []) as TFactorySelected[];
    this.selectedFactories = new Set(list);
  }

  private async attachListeners(): Promise<void> {
    // Load current selection before attaching
    this.refreshSelectedFactories();

    // Uniswap V2 / Aerodrome PairCreated
    this.onPairCreatedHandler = async (
      token0: string,
      token1: string,
      pairAddress: string,
      pairIndex: bigint
    ) => {
      try {
        console.log(`🆕 New pair detected on Uniswap V2: ${pairAddress}`);
        if (this.trackedPairsUniswapV2.has(pairAddress.toLowerCase())) return;

        this.trackedPairsUniswapV2.add(pairAddress.toLowerCase());
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
    };
    if (this.selectedFactories.has('uniswapV2')) {
      uniswapV2Factory.on('PairCreated', this.onPairCreatedHandler);
    } else {
      this.onPairCreatedHandler = undefined; // ensure detach won't try to remove nonexistent listener
    }

    // Uniswap V3 PoolCreated
    this.onPoolCreatedHandler = async (
      token0: string,
      token1: string,
      fee: number,
      tickSpacing: number,
      pool: string
    ) => {
      console.log(`🟦 New V3 pool detected: ${pool}`);
      try {
        const poolContract = createPairContract(pool, 3);
        const [token0Addr, token1Addr] = await Promise.all([
          poolContract.token0(),
          poolContract.token1(),
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
            if (this.trackedPairsUniswapV3.has(pool.toLowerCase())) return;
            this.trackedPairsUniswapV3.add(pool.toLowerCase());
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
    };
    if (this.selectedFactories.has('uniswapV3')) {
      uniswapV3Factory.on('PoolCreated', this.onPoolCreatedHandler);
    } else {
      this.onPoolCreatedHandler = undefined;
    }

    // Zora coin events (currently optional/commented in original)
    this.onCoinCreatedHandler = this.onCoinCreated.bind(this);
    // BaseContracts.zoraFactory.on('CoinCreatedV4', this.onCoinCreatedHandler);
    // BaseContracts.zoraFactory.on('CreatorCoinCreated', this.onCoinCreatedHandler);
  }

  private detachListeners(): void {
    if (this.onPairCreatedHandler) {
      uniswapV2Factory.off('PairCreated', this.onPairCreatedHandler);
      uniswapV2Factory.removeAllListeners('PairCreated');
      this.onPairCreatedHandler = undefined;
    }

    if (this.onPoolCreatedHandler) {
      uniswapV3Factory.off('PoolCreated', this.onPoolCreatedHandler);
      uniswapV3Factory.removeAllListeners('PoolCreated');
      this.onPoolCreatedHandler = undefined;
    }

    if (this.onCoinCreatedHandler) {
      zoraFactory.off(
        'CoinCreatedV4',
        this.onCoinCreatedHandler as typeof this.onCoinCreatedHandler
      );
      zoraFactory.off(
        'CreatorCoinCreated',
        this.onCoinCreatedHandler as typeof this.onCoinCreatedHandler
      );
      this.onCoinCreatedHandler = undefined;
    }
  }

  public async start(): Promise<void> {
    if (this.monitoring) return;
    this.monitoring = true;
    await this.attachListeners();
  }

  public async reloadFactories(): Promise<void> {
    if (!this.monitoring) {
      // Just refresh the cached selection for when start() is called later
      this.refreshSelectedFactories();
      return;
    }
    // Re-bind
    this.detachListeners();
    await this.attachListeners();
  }

  public getSelectedFactories(): string[] {
    return Array.from(this.selectedFactories.values());
  }

  public stop(): void {
    if (!this.monitoring) return;
    this.monitoring = false;
    this.detachListeners();
  }

  public status(): boolean {
    return this.monitoring;
  }
}

export const tokenMonitoringService = new TokenMonitoringService();
