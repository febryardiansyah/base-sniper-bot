import { factories, routers, uniswapV3Factory, uniswapV4PoolManager } from "./blockchain/contracts";
import { sendStartupMessage, setupCommandHandlers } from "./services/telegram";
import { config } from "./core/config";
import { startMonitor } from "./blockchain/monitoring";

export class BaseChainSniperBot {
  async start(): Promise<void> {
    console.log("🚀 Base Chain Sniper Bot Starting...");
    console.log(`📡 Monitoring ${factories.length} factories and ${routers.length} routers`);
    console.log(`🔵 Monitoring Uniswap V3 pools for liquidity additions`);
    console.log(`🟣 Monitoring Uniswap V4 pools for liquidity additions`);

    await sendStartupMessage();

    // Set up Telegram command handlers
    setupCommandHandlers();
    console.log("📱 Telegram command interface enabled");
    
    // Start monitoring
    startMonitor();
    console.log("🔍 Monitoring started automatically");

    // Log auto swap status
    if (config.AUTO_SWAP_ENABLED) {
      console.log(`🤖 Auto swap is ENABLED with ${config.AUTO_SWAP_BUY_AMOUNT} ETH per trade`);
    } else {
      console.log(`🤖 Auto swap is DISABLED`);
    }
  }
}