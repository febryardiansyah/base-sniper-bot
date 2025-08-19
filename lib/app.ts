import { baseContracts } from "./contracts/contracts";
import { sendStartupMessage, setupCommandHandlers } from "./services/telegram";

export class App {
  async start(): Promise<void> {
    console.log("🚀 Febry's Defi Bot Starting...");
    console.log(`📡 Monitoring ${baseContracts.factories.length} factories and ${baseContracts.routers.length} routers`);
    console.log(`🔵 Monitoring Uniswap V3 pools for liquidity additions`);
    console.log(`🟣 Monitoring Uniswap V4 pools for liquidity additions`);

    await sendStartupMessage();

    // Set up Telegram command handlers
    setupCommandHandlers();
    console.log("📱 Telegram command interface enabled");

  }
}