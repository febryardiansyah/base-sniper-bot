import { walletMonitoringService } from './services/monitoring/walletMonitoring.service';
import { telegramService } from './telegram/telegram';

export class App {
  async start(): Promise<void> {
    console.log('🚀 Base Sniper Bot Starting...');
    await telegramService.init();
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
