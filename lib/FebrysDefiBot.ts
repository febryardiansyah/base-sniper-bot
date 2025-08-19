import { factories, routers, uniswapV3Factory, uniswapV4PoolManager } from "./blockchain/contracts";
import { sendStartupMessage, setupCommandHandlers } from "./services/telegram";
import { config } from "./core/config";
import { startMonitor } from "./blockchain/monitoring";

export class FebrysDefiBot {
  async start(): Promise<void> {
    console.log("🚀 Febry's Defi Bot Starting...");
    console.log(`📡 Monitoring ${factories.length} factories and ${routers.length} routers`);
    console.log(`🔵 Monitoring Uniswap V3 pools for liquidity additions`);
    console.log(`🟣 Monitoring Uniswap V4 pools for liquidity additions`);

    await sendStartupMessage();

    // Set up Telegram command handlers
    setupCommandHandlers();
    console.log("📱 Telegram command interface enabled");

  }
}