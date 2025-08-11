import { factories, routers } from "./blockchain/contracts";
import { sendStartupMessage } from "./services/telegram";
import { monitorNewPairs, monitorBigBuys, monitorBlocks } from "./blockchain/monitoring";

export class BaseChainSniperBot {
  constructor() {
    // Bot initialization is handled by imported modules
  }

  async start(): Promise<void> {
    console.log("🚀 Base Chain Sniper Bot Starting...");
    console.log(`📡 Monitoring ${factories.length} factories and ${routers.length} routers`);
    
    await sendStartupMessage();

    // Start monitoring services
    monitorNewPairs();
    // monitorBigBuys();
    monitorBlocks();
  }
}