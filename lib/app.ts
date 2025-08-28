import { walletMonitoringService } from './blockchain/monitoring/walletMonitoring';
import * as BaseContracts from './blockchain/contracts';
import { setupCommandHandlers } from './telegram/telegram';

export class App {
  async start(): Promise<void> {
    console.log("🚀 Febry's Defi Bot Starting...");

    // Set up Telegram command handlers
    setupCommandHandlers();
    console.log('📱 Telegram command interface enabled');

    // Initialize wallet monitoring service
    const walletCount = walletMonitoringService.getMonitoredWalletCount();
    if (walletCount > 0) {
      console.log(`💳 Wallet monitoring ready for ${walletCount} addresses`);
    } else {
      console.log('💳 No wallet addresses configured for monitoring');
    }
  }
}
