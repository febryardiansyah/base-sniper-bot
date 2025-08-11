import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import BigNumber from "bignumber.js";
import { config } from "../core/config";
import { PairInfo, BigBuyData } from "../core/types";
import { getNonWETHToken } from "../blockchain/pairAnalyzer";

// Initialize Telegram bot
export const telegramBot = new TelegramBot(config.TELEGRAM_BOT_TOKEN);

// Send generic Telegram message
export async function sendTelegramMessage(message: string): Promise<void> {
  try {
    await telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
  } catch (error) {
    console.error("Error sending Telegram message:", error);
    // Fallback to axios if telegram bot fails
    try {
      await axios.post(`https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: config.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown",
        disable_web_page_preview: true
      });
    } catch (axiosError) {
      console.error("Error sending message via axios:", axiosError);
    }
  }
}

// Send new pair alert
export async function sendPairAlert(pairInfo: PairInfo, exchange: string): Promise<void> {
  const nonWETHToken = getNonWETHToken(pairInfo);
  
  const message = 
    `🎯 *NEW HIGH-LIQUIDITY TOKEN DETECTED*\n\n` +
    `🏪 Exchange: *${exchange}*\n` +
    `🪙 Token: *${nonWETHToken.symbol}* (${nonWETHToken.name})\n` +
    `📍 Address: \`${nonWETHToken.address}\`\n` +
    `💧 Liquidity: *${pairInfo.liquidityETH.toFixed(2)} ETH*\n` +
    `📊 Total Supply: *${new BigNumber(nonWETHToken.totalSupply).dividedBy(new BigNumber(10).pow(nonWETHToken.decimals)).toFormat()}*\n` +
    `🔗 Pair: \`${pairInfo.pairAddress}\`\n\n` +
    `⚡ *SNIPE OPPORTUNITY DETECTED!*`;
  
  await sendTelegramMessage(message);
  console.log(`🚨 ALERT: New token ${nonWETHToken.symbol} with ${pairInfo.liquidityETH.toFixed(2)} ETH liquidity`);
}

// Send big buy alert
export async function sendBuyAlert(data: BigBuyData): Promise<void> {
  const tokenSymbol = data.tokenInfo?.symbol || "Unknown";
  const tokenAddress = data.tokenInfo?.address || "Unknown";
  
  const message = 
    `🔥 *BIG BUY DETECTED ON BASE*\n\n` +
    `👤 Buyer: \`${data.sender}\`\n` +
    `💰 Amount: *${data.ethAmount.toFixed(4)} ETH*\n` +
    `🪙 Token: *${tokenSymbol}*\n` +
    `📍 Token Address: \`${tokenAddress}\`\n` +
    `🏪 Router: *${data.routerName}*\n` +
    `🔗 TX: \`${data.txHash}\`\n\n` +
    `💡 *Someone just made a big purchase!*`;
  
  await sendTelegramMessage(message);
  console.log(`🔥 BIG BUY: ${data.ethAmount.toFixed(4)} ETH spent on ${tokenSymbol}`);
}

// Send bot startup message
export async function sendStartupMessage(): Promise<void> {
  await sendTelegramMessage("🤖 Base Chain Sniper Bot is now ONLINE!\n\n📊 Monitoring new tokens with high liquidity...");
}