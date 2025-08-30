import TelegramBot from 'node-telegram-bot-api';
import { checkAddressInfo } from '../services/info.service';
import { BlacklistUtils } from '../utils/blacklistUtils';
import { config } from '../utils/config';
import { commandList } from '../utils/utils';
import * as MonitoringTelegram from './monitoringTelegram';
import * as TokenTelegram from './tokenTelegram';
import * as WalletTelegram from './walletTelegram';

export { MonitoringTelegram };

export class TelegramService {
  public readonly bot: TelegramBot;
  private handlersInitialized = false;

  constructor() {
    this.bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });
  }

  async sendStartupMessage(): Promise<void> {
    const envStatus = config.IS_DEVELOPMENT ? 'DEVELOPMENT' : 'PRODUCTION';
    const botName = config.IS_DEVELOPMENT ? 'Base Sniper Bot (DEV)' : 'Base Sniper Bot';

    if (config.IS_DEVELOPMENT) return; // Skip in development

    const message =
      `🤖 ${botName} is now ONLINE! (${envStatus})\n\n` +
      `📊 Monitoring new tokens with high liquidity...\n\n` +
      `💬 Use /help to see available commands`;

    try {
      await this.bot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (error) {
      console.error('Error sending Telegram message:', error);
    }
  }

  setupCommandHandlers(): void {
    if (this.handlersInitialized) return; // idempotent
    const telegramBot = this.bot; // preserve original variable name inside handler closures

    // /help
    telegramBot.onText(/^\/help$/, async msg => {
      const chatId = msg.chat.id;
      if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
        await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
        return;
      }
      const envStatus = config.IS_DEVELOPMENT ? ' (DEV)' : '';
      let helpMessage = `🤖 *Febry's Defi Bot Commands${envStatus}*\n`;
      for (const e of commandList) helpMessage += `\n${e.command} - *${e.description}*`;
      await telegramBot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
    });

    // Delegate feature-specific handlers
    MonitoringTelegram.commandHandlers();
    TokenTelegram.commandHandlers();
    WalletTelegram.commandHandlers();

    // /blacklist
    telegramBot.onText(/\/blacklist$/, async msg => {
      const chatId = msg.chat.id;
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
        await telegramBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      } catch (error) {
        await telegramBot.sendMessage(chatId, `❌ Error retrieving blacklist: ${error}`);
      }
    });

    // /addblacklist
    telegramBot.onText(/^\/addblacklist (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
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
            { parse_mode: 'Markdown' }
          );
        }
      } catch (error) {
        await telegramBot.sendMessage(chatId, `❌ Error adding token to blacklist: ${error}`);
      }
    });

    // /removeblacklist
    telegramBot.onText(/^\/removeblacklist (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
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
          await telegramBot.sendMessage(
            chatId,
            `✅ Token \`${tokenName}\` removed from blacklist`,
            {
              parse_mode: 'Markdown',
            }
          );
        } else {
          await telegramBot.sendMessage(
            chatId,
            `⚠️ Token \`${tokenName}\` not found in blacklist`,
            {
              parse_mode: 'Markdown',
            }
          );
        }
      } catch (error) {
        await telegramBot.sendMessage(chatId, `❌ Error removing token from blacklist: ${error}`);
      }
    });

    // /resetblacklist
    telegramBot.onText(/\/resetblacklist$/, async msg => {
      const chatId = msg.chat.id;
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
          { parse_mode: 'Markdown' }
        );
      } catch (error) {
        await telegramBot.sendMessage(chatId, `❌ Error resetting blacklist: ${error}`);
      }
    });

    // /myinfo
    telegramBot.onText(/^\/myinfo$/, async msg => {
      const chatId = msg.chat.id;
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

    this.handlersInitialized = true;
    console.log(
      `🤖 Telegram command handlers set up for ${config.IS_DEVELOPMENT ? 'DEVELOPMENT' : 'PRODUCTION'} environment`
    );
  }

  async init(): Promise<void> {
    this.setupCommandHandlers();
    await this.sendStartupMessage();
  }
}

// Singleton instance
export const telegramService = new TelegramService();
export const telegramBot = telegramService.bot;
