import { ethers } from "ethers";
import { config } from "../core/config";
import { BigBuyData } from "../core/types";
import { factories, routers, factoryNames, routerNames } from "./contracts";
import { analyzePair, shouldAlert, shouldAutoSwap, getNonWETHToken } from "./pairAnalyzer";
import { sendPairAlert, sendBuyAlert } from "../services/telegram";
import { wsProvider } from "./providers";
import { sleep } from "../utils/utils";
import { buyTokenWithETH } from "../services/swap";
import { checkTokenInfo } from "../services/info";

// Tracked pairs and transactions to avoid duplicates
const trackedPairs = new Set<string>();
const processedTransactions = new Set<string>();

// Monitor new pair creation events
export function monitorNewPairs(): void {
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
          
          // Check if auto swap is enabled and should be executed
          if (config.AUTO_SWAP_ENABLED && pairInfo && shouldAutoSwap(pairInfo)) {
            try {
              const nonWETHToken = getNonWETHToken(pairInfo);
              console.log(`🤖 Auto swap triggered for ${nonWETHToken.symbol}`);
              
              // Execute the swap
              await buyTokenWithETH(
                nonWETHToken.address,
                config.AUTO_SWAP_BUY_AMOUNT,
              );
            } catch (swapError) {
              console.error(`Error executing auto swap:`, swapError);
            }
          }
        }
      } catch (error) {
        console.error(`Error processing new pair ${pairAddress}:`, error);
      }
    });
  });
}

// Monitor big buy events on routers
export function monitorBigBuys(): void {
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
export function monitorBlocks(): void {
  wsProvider.on("block", (blockNumber) => {
    console.log(`📦 Block ${blockNumber}`);
  });
}