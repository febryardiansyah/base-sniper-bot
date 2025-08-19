import TelegramBot from 'node-telegram-bot-api';
import { config } from '../utils/config';
import { checkAddressInfo } from '../services/info';
import { commandList } from '../utils/utils';
import * as MonitoringTelegram from './monitoringTelegram';
import * as SwapTelegram from './swapTelegram';

export { MonitoringTelegram };

// Initialize Telegram bot
export const telegramBot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, {
  polling: true,
});

// Send bot startup message
export async function sendStartupMessage(): Promise<void> {
  const message =
    `🤖 Febry's Defi Bot is now ONLINE!\n\n` +
    `📊 Monitoring new tokens with high liquidity...\n\n` +
    `💬 Use /help to see available commands`;

  try {
    await telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
}

// Setup Telegram command handlers
export function setupCommandHandlers(): void {
  // Handle /help command
  telegramBot.onText(/\/help/, async msg => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    let helpMessage = "🤖 *Febry's Defi Bot Commands*\n";

    for (const e of commandList) {
      helpMessage += `\n${e.command} - *${e.description}*`;
    }

    await telegramBot.sendMessage(chatId, helpMessage, {
      parse_mode: 'Markdown',
    });
  });

  MonitoringTelegram.commandHandlers();
  SwapTelegram.commandHandlers();

  // check address info
  telegramBot.onText(/\/myinfo/, async msg => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    try {
      const info = checkAddressInfo();
      await telegramBot.sendMessage(chatId, `🔒 Check your balance here ${info}`);
    } catch (error) {
      await telegramBot.sendMessage(chatId, `Error checking address info: ${error}`);
    }
  });

  console.log('🤖 Telegram command handlers set up');
}
