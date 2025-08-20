import BigNumber from 'bignumber.js';
import { BaseMonitoring } from '../blockchain/monitoring/monitoring';
import { getNonWETHToken } from '../blockchain/pairAnalyzer';
import { BigBuyData, PairInfo } from '../interface/types';
import { config } from '../utils/config';
import { telegramBot } from './telegram';

// Send new pair alert
export async function sendPairAlert(pairInfo: PairInfo, exchange: string): Promise<void> {
  const nonWETHToken = getNonWETHToken(pairInfo);

  const message =
    `🎯 *NEW HIGH-LIQUIDITY TOKEN DETECTED*\n\n` +
    `🏪 Exchange: *${exchange}*\n` +
    `🪙 Token: *${nonWETHToken.symbol}* (${nonWETHToken.name})\n` +
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

// Send big buy alert
export async function sendBuyAlert(data: BigBuyData): Promise<void> {
  const tokenSymbol = data.tokenInfo?.symbol || 'Unknown';
  const tokenAddress = data.tokenInfo?.address || 'Unknown';

  const message =
    `🔥 *BIG BUY DETECTED ON BASE*\n\n` +
    `👤 Buyer: \`${data.sender}\`\n` +
    `💰 Amount: *${data.ethAmount.toFixed(4)} ETH*\n` +
    `🪙 Token: *${tokenSymbol}*\n` +
    `📍 Token Address: \`${tokenAddress}\`\n` +
    `🏪 Router: *${data.routerName}*\n` +
    `🔗 TX: \`${data.txHash}\`\n\n` +
    `💡 *Someone just made a big purchase!*`;

  try {
    await telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
  } catch (error) {
    console.error('Error sending Telegram message:', error);
  }
  console.log(`🔥 BIG BUY: ${data.ethAmount.toFixed(4)} ETH spent on ${tokenSymbol}`);
}

export function commandHandlers(): void {
  telegramBot.onText(/\/start/, async msg => {
    const chatId = msg.chat.id;
    if (BaseMonitoring.statusMonitoring()) {
      await telegramBot.sendMessage(chatId, '⚠️ Monitoring is already running');
      return;
    }
    BaseMonitoring.startMonitor();
    await telegramBot.sendMessage(chatId, '🟢 Monitoring started');
  });

  telegramBot.onText(/\/stop/, async msg => {
    const chatId = msg.chat.id;
    if (!BaseMonitoring.statusMonitoring()) {
      await telegramBot.sendMessage(chatId, '⚠️ Monitoring is not running');
      return;
    }
    BaseMonitoring.stopMonitor();
    await telegramBot.sendMessage(chatId, '🛑 Monitoring stopped');
  });

  telegramBot.onText(/\/status/, async msg => {
    const chatId = msg.chat.id;
    const status = BaseMonitoring.statusMonitoring() ? 'Running 🟢' : 'Stopped 🛑';
    await telegramBot.sendMessage(chatId, `Monitoring Status: ${status}`);
  });
}
