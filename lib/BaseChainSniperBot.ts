import { factories, routers } from "./blockchain/contracts";
import { sendStartupMessage, setupCommandHandlers } from "./services/telegram";
import { monitorNewPairs, monitorBigBuys, monitorBlocks } from "./blockchain/monitoring";
import { config } from "./core/config";

export class BaseChainSniperBot {
  constructor() {
    // Bot initialization is handled by imported modules
  }

  async start(): Promise<void> {
    console.log("🚀 Base Chain Sniper Bot Starting...");
    console.log(`📡 Monitoring ${factories.length} factories and ${routers.length} routers`);
    
    await sendStartupMessage();

    // Start monitoring services
    // monitorNewPairs();
    // monitorBigBuys();
    // monitorBlocks();
    
    // Set up Telegram command handlers
    setupCommandHandlers();
    console.log("📱 Telegram command interface enabled");
    
    // Log auto swap status
    if (config.AUTO_SWAP_ENABLED) {
      console.log(`🤖 Auto swap is ENABLED with ${config.AUTO_SWAP_BUY_AMOUNT} ETH per trade`);
    } else {
      console.log(`🤖 Auto swap is DISABLED`);
    }
  }
}