import { ethers } from "ethers";
import { config } from "../core/config";
import { BigBuyData } from "../core/types";
import { factories, routers, factoryNames, routerNames } from "./contracts";
import { analyzePair, shouldAlert, shouldAutoSwap, getNonWETHToken } from "./pairAnalyzer";
import { sendPairAlert, sendBuyAlert } from "../services/telegram";
import { wsProvider } from "./providers";
import { sleep } from "../utils/utils";
import { buyTokenWithETH } from "../services/swap";
import { checkTokenInfo, checkUserTokenInfo } from "../services/info";

// Tracked pairs and transactions to avoid duplicates
const trackedPairs = new Set<string>();
const processedTransactions = new Set<string>();

let isMonitoring = false;

// Monitor new pair creation events
function monitorNewPairs(): void {
  factories.forEach((factory, index) => {
    const factoryName = factoryNames[index];
    
    factory.on("PairCreated", async (token0: string, token1: string, pairAddress: string, pairIndex: bigint) => {
      try {
        console.log(`🆕 New pair detected on ${factoryName}: ${pairAddress}`);
        
        if (trackedPairs.has(pairAddress.toLowerCase())) {
          return; // Already processed
        }
        
        trackedPairs.add(pairAddress.toLowerCase());
        
        // Wait for confirmations
        await sleep(config.RETRY_DELAY_MS * config.BLOCK_CONFIRMATION_COUNT);
        
        const pairInfo = await analyzePair(pairAddress, token0, token1);
        const isShouldAlert = pairInfo && shouldAlert(pairInfo);
        
        if (isShouldAlert) {
          await sendPairAlert(pairInfo, factoryName);
        }
      } catch (error) {
        console.error(`Error processing new pair ${pairAddress}:`, error);
      }
    });
  });
}

function stopMonitorNewPairs(): void {
  factories.forEach((factory) => {
    factory.off("PairCreated");
    factory.removeAllListeners();
  });
}

// Monitor big buy events on routers
function monitorBigBuys(): void {
  routers.forEach((router, index) => {
    const routerName = routerNames[index];
    
    router.on("Swap", async (sender: string, amountIn: bigint, amountOutMin: bigint, path: string[], to: string, event: any) => {
      try {
        const txHash = event.log.transactionHash;
        
        if (processedTransactions.has(txHash)) {
          return;
        }
        
        processedTransactions.add(txHash);
        
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
              txHash
            };
            await sendBuyAlert(buyData);
          }
        }
      } catch (error) {
        console.error("Error processing swap event:", error);
      }
    });
  });
}

// Monitor blocks for logging
function monitorBlocks(): void {
  wsProvider.on("block", (blockNumber) => {
    console.log(`📦 Block ${blockNumber}`);
  });
}

function stopMonitorBlocks(): void {
  wsProvider.off("block");
  wsProvider.removeAllListeners();
  wsProvider.destroy();
}

export function startMonitor(): void {
  isMonitoring = true;
  monitorNewPairs();
  monitorBlocks();
}

export function stopMonitor(): void {
  isMonitoring = false;
  stopMonitorNewPairs();
  stopMonitorBlocks();
}

export function statusMonitoring(): boolean {
  return isMonitoring;
}