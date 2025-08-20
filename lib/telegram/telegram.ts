import TelegramBot from 'node-telegram-bot-api';
import { checkAddressInfo } from '../services/info';
import { BlacklistUtils } from '../utils/blacklistUtils';
import { config } from '../utils/config';
import { commandList } from '../utils/utils';
import * as MonitoringTelegram from './monitoringTelegram';
import * as TokenTelegram from './tokenTelegram';

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
  TokenTelegram.commandHandlers();

  // Token blacklist commands
  // Show all blacklisted tokens
  telegramBot.onText(/\/blacklist$/, async msg => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    try {
      const blacklist = BlacklistUtils.getBlacklist();
      if (blacklist.length === 0) {
        await telegramBot.sendMessage(chatId, '📝 Token blacklist is empty');
        return;
      }

      let message = `🚫 *Token Blacklist* (${blacklist.length} tokens)\n\n`;
      blacklist.forEach((token, index) => {
        message += `${index + 1}. \`${token}\`\n`;
      });

      await telegramBot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error retrieving blacklist: ${error}`);
    }
  });

  // Add token to blacklist
  telegramBot.onText(/\/addblacklist (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    if (!match || !match[1]) {
      await telegramBot.sendMessage(
        chatId,
        '❌ Please provide a token name\nUsage: /addblacklist <token_name>'
      );
      return;
    }

    const tokenName = match[1].trim();

    try {
      const added = BlacklistUtils.addToBlacklist(tokenName);
      if (added) {
        await telegramBot.sendMessage(chatId, `✅ Token \`${tokenName}\` added to blacklist`, {
          parse_mode: 'Markdown',
        });
      } else {
        await telegramBot.sendMessage(
          chatId,
          `⚠️ Token \`${tokenName}\` is already in the blacklist`,
          {
            parse_mode: 'Markdown',
          }
        );
      }
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error adding token to blacklist: ${error}`);
    }
  });

  // Remove token from blacklist
  telegramBot.onText(/\/removeblacklist (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    if (!match || !match[1]) {
      await telegramBot.sendMessage(
        chatId,
        '❌ Please provide a token name\nUsage: /removeblacklist <token_name>'
      );
      return;
    }

    const tokenName = match[1].trim();

    try {
      const removed = BlacklistUtils.removeFromBlacklist(tokenName);
      if (removed) {
        await telegramBot.sendMessage(chatId, `✅ Token \`${tokenName}\` removed from blacklist`, {
          parse_mode: 'Markdown',
        });
      } else {
        await telegramBot.sendMessage(chatId, `⚠️ Token \`${tokenName}\` not found in blacklist`, {
          parse_mode: 'Markdown',
        });
      }
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error removing token from blacklist: ${error}`);
    }
  });

  // Reset blacklist to default tokens
  telegramBot.onText(/\/resetblacklist$/, async msg => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    try {
      BlacklistUtils.resetToDefault();
      const blacklist = BlacklistUtils.getBlacklist();
      await telegramBot.sendMessage(
        chatId,
        `✅ Token blacklist reset to default (${blacklist.length} tokens)`,
        {
          parse_mode: 'Markdown',
        }
      );
    } catch (error) {
      await telegramBot.sendMessage(chatId, `❌ Error resetting blacklist: ${error}`);
    }
  });

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
