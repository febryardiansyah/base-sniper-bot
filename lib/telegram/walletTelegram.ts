import { walletMonitoringService } from '../blockchain/monitoring/walletMonitoring';
import { config } from '../utils/config';
import { telegramBot } from './telegram';

export function commandHandlers(): void {
  // Add wallet address to monitoring list
  telegramBot.onText(/^\/listen (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    if (!match || !match[1]) {
      await telegramBot.sendMessage(
        chatId,
        '❌ Please provide a wallet address\nUsage: /listen <wallet_address>'
      );
      return;
    }

    const walletAddress = match[1].trim();

    try {
      const added = walletMonitoringService.addWalletAddress(walletAddress);
      if (added) {
        await telegramBot.sendMessage(
          chatId,
          `✅ Wallet \`${walletAddress}\` added to monitoring list\n` +
            `🔍 Now monitoring ${walletMonitoringService.getMonitoredWalletCount()} wallet(s)`,
          {
            parse_mode: 'Markdown',
          }
        );
      } else {
        const isAlreadyMonitored = walletMonitoringService.isWalletMonitored(walletAddress);
        if (isAlreadyMonitored) {
          await telegramBot.sendMessage(
            chatId,
            `⚠️ Wallet \`${walletAddress}\` is already being monitored`,
            {
              parse_mode: 'Markdown',
            }
          );
        } else {
          await telegramBot.sendMessage(chatId, `❌ Invalid wallet address: \`${walletAddress}\``, {
            parse_mode: 'Markdown',
          });
        }
      }
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error adding wallet to monitoring: ${error}`);
    }
  });

  // Remove wallet address from monitoring list
  telegramBot.onText(/^\/unlisten (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    if (!match || !match[1]) {
      await telegramBot.sendMessage(
        chatId,
        '❌ Please provide a wallet address\nUsage: /unlisten <wallet_address>'
      );
      return;
    }

    const walletAddress = match[1].trim();

    try {
      const removed = walletMonitoringService.removeWalletAddress(walletAddress);
      if (removed) {
        await telegramBot.sendMessage(
          chatId,
          `✅ Wallet \`${walletAddress}\` removed from monitoring list\n` +
            `🔍 Now monitoring ${walletMonitoringService.getMonitoredWalletCount()} wallet(s)`,
          {
            parse_mode: 'Markdown',
          }
        );
      } else {
        await telegramBot.sendMessage(
          chatId,
          `⚠️ Wallet \`${walletAddress}\` is not in the monitoring list`,
          {
            parse_mode: 'Markdown',
          }
        );
      }
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error removing wallet from monitoring: ${error}`);
    }
  });

  // Remove all wallet addresses from monitoring list
  telegramBot.onText(/^\/unlistenall$/, async msg => {
    const chatId = msg.chat.id;
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }
    try {
      const count = walletMonitoringService.getMonitoredWalletCount();
      if (count === 0) {
        await telegramBot.sendMessage(chatId, '📝 No wallets to remove');
        return;
      }
      const { removed, wasMonitoring } = walletMonitoringService.clearAllWallets();
      // If previously monitoring and wallets cleared, user can re-start after adding new wallets
      await telegramBot.sendMessage(
        chatId,
        `🧹 Removed all monitored wallets (total ${removed}).${
          wasMonitoring ? '\n🛑 Monitoring stopped automatically.' : ''
        }`
      );
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error clearing monitored wallets: ${error}`);
    }
  });

  // Show all monitored wallets
  telegramBot.onText(/^\/wallets$/, async msg => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    try {
      const wallets = walletMonitoringService.getMonitoredWallets();
      if (wallets.length === 0) {
        await telegramBot.sendMessage(chatId, '📝 No wallets are being monitored');
        return;
      }

      let message = `🔍 *Monitored Wallets* (${wallets.length} addresses)\n\n`;
      wallets.forEach((wallet, index) => {
        message += `${index + 1}. \`${wallet}\`\n`;
      });

      await telegramBot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error retrieving wallet list: ${error}`);
    }
  });

  // Show wallet monitoring status
  telegramBot.onText(/^\/walletstatus$/, async msg => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    try {
      const isMonitoring = walletMonitoringService.getMonitoringStatus();
      const walletCount = walletMonitoringService.getMonitoredWalletCount();
      const status = isMonitoring ? 'Running 🟢' : 'Stopped 🛑';

      const message =
        `💳 *Wallet Monitoring Status*\n\n` +
        `📊 Status: *${status}*\n` +
        `🔍 Monitored Wallets: *${walletCount}*\n` +
        `⛓️ Network: *Base Chain*`;

      await telegramBot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error getting wallet monitoring status: ${error}`);
    }
  });

  // Start wallet monitoring
  telegramBot.onText(/^\/startwallet$/, async msg => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    try {
      if (walletMonitoringService.getMonitoringStatus()) {
        await telegramBot.sendMessage(chatId, '⚠️ Wallet monitoring is already running');
        return;
      }

      const walletCount = walletMonitoringService.getMonitoredWalletCount();
      if (walletCount === 0) {
        await telegramBot.sendMessage(
          chatId,
          '⚠️ No wallets to monitor. Add wallets using /listen <wallet_address> first'
        );
        return;
      }

      walletMonitoringService.startMonitoring();
      await telegramBot.sendMessage(
        chatId,
        `🟢 Wallet monitoring started\n🔍 Monitoring ${walletCount} wallet(s) on Base chain`
      );
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error starting wallet monitoring: ${error}`);
    }
  });

  // Stop wallet monitoring
  telegramBot.onText(/^\/stopwallet$/, async msg => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    try {
      if (!walletMonitoringService.getMonitoringStatus()) {
        await telegramBot.sendMessage(chatId, '⚠️ Wallet monitoring is not running');
        return;
      }

      walletMonitoringService.stopMonitoring();
      await telegramBot.sendMessage(chatId, '🛑 Wallet monitoring stopped');
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error stopping wallet monitoring: ${error}`);
    }
  });
}
