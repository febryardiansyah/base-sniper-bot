import BigNumber from 'bignumber.js';
import { tokenMonitoringService } from '../services/monitoring/tokenMonitoring.service';
import { getNonWETHToken } from '../contracts/pairAnalyzer';
import { IPairInfo } from '../interface/token.interface';
import { config } from '../utils/config';
import { telegramBot } from './telegram';

// Send new pair alert
export async function sendPairAlert(pairInfo: IPairInfo, exchange: string): Promise<void> {
  const nonWETHToken = getNonWETHToken(pairInfo);
  const now = new Date();
  const timestamp = now.toISOString().replace('T', ' ').replace('Z', ' UTC');

  // Determine which side is non-WETH for flag placement
  const lowerWeth = config.WETH_ADDRESS.toLowerCase();
  const nonWethIsToken0 = pairInfo.token0.address.toLowerCase() !== lowerWeth;
  const nonWethVerified = nonWethIsToken0 ? pairInfo.token0Verified : pairInfo.token1Verified;
  const verifiedEmoji = nonWethVerified === undefined ? '❔' : nonWethVerified ? '✅' : '❌';

  const message =
    `🎯 *NEW HIGH-LIQUIDITY TOKEN DETECTED*\n\n` +
    `🕒 Time: ${timestamp}\n` +
    `🏪 Exchange: *${exchange}*\n` +
    `🪙 Token: *${nonWETHToken.symbol}* (${nonWETHToken.name}) ${verifiedEmoji}\n` +
    `📍 Address: \`${nonWETHToken.address}\`\n` +
    `💧 Liquidity: *${pairInfo.liquidityETH.toFixed(2)} ETH*\n` +
    `📊 Total Supply: *${new BigNumber(nonWETHToken.totalSupply)
      .dividedBy(new BigNumber(10).pow(nonWETHToken.decimals))
      .toFormat()}*\n` +
    `🔗 Pair: \`${pairInfo.pairAddress}\`\n` +
    `🔗 DexScreener URL: [Open Link](http://dexscreener.com/base/${nonWETHToken.address})`;

  try {
    await telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
  console.log(
    `🚨 ALERT: New token ${
      nonWETHToken.symbol
    } with ${pairInfo.liquidityETH.toFixed(2)} ETH liquidity`
  );
}

export function commandHandlers(): void {
  telegramBot.onText(/^\/start$/, async msg => {
    const chatId = msg.chat.id;
    if (tokenMonitoringService.status()) {
      await telegramBot.sendMessage(chatId, '⚠️ Monitoring is already running');
      return;
    }
    tokenMonitoringService.start();
    await telegramBot.sendMessage(chatId, '🟢 Monitoring started');
  });

  telegramBot.onText(/^\/stop$/, async msg => {
    const chatId = msg.chat.id;
    if (!tokenMonitoringService.status()) {
      await telegramBot.sendMessage(chatId, '⚠️ Monitoring is not running');
      return;
    }
    tokenMonitoringService.stop();
    await telegramBot.sendMessage(chatId, '🛑 Monitoring stopped');
  });

  telegramBot.onText(/^\/status$/, async msg => {
    const chatId = msg.chat.id;
    const status = tokenMonitoringService.status() ? 'Running 🟢' : 'Stopped 🛑';
    await telegramBot.sendMessage(chatId, `Monitoring Status: ${status}`);
  });
}
