import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import BigNumber from "bignumber.js";
import { config } from "../core/config";
import { PairInfo, BigBuyData } from "../core/types";
import { getNonWETHToken } from "../blockchain/pairAnalyzer";
import { buyTokenWithETH, sellTokenForETH } from "./swap";
import { ethers } from "ethers";

// Initialize Telegram bot
export const telegramBot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

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
    `🔗 Pair: \`${pairInfo.pairAddress}\`\n` +
    `🔗 *DexScreener URL:* \[Open Link](http://dexscreener.com/base/${nonWETHToken.address})\`\n\n` +
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
  await sendTelegramMessage(
    `🤖 Base Chain Sniper Bot is now ONLINE!\n\n` +
    `📊 Monitoring new tokens with high liquidity...\n\n` +
    `💬 Use /help to see available commands`
  );
}

// Send swap execution message
export async function sendSwapExecutionMessage(data: {
  tokenAddress: string;
  ethAmount: number;
  routerName: string;
  txHash: string;
  walletAddress: string;
  isSell?: boolean;
}): Promise<void> {
  const action = data.isSell ? "SOLD" : "BOUGHT";
  const amountText = data.isSell ? "tokens" : `${data.ethAmount.toFixed(4)} ETH`;

  const message =
    `🤖 *SWAP ${action}*\n\n` +
    `💰 Amount: *${amountText}*\n` +
    `🪙 Token Address: \`${data.tokenAddress}\`\n` +
    `🏪 Router: *${data.routerName}*\n` +
    `👛 Wallet: \`${data.walletAddress}\`\n` +
    `🔗 TX: \`${data.txHash}\`\n\n` +
    `✅ *Swap executed successfully!*`;

  await sendTelegramMessage(message);
  console.log(`🤖 SWAP: ${action} ${amountText} of ${data.tokenAddress}`);
}

// Setup Telegram command handlers
export function setupCommandHandlers(): void {

  // Handle /swap command
  telegramBot.onText(/\/buy (.+)/, async (msg, match) => {
    try {
      const chatId = msg.chat.id;

      // Check if the chat ID matches the configured chat ID
      if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
        await telegramBot.sendMessage(chatId, "⛔ Unauthorized access");
        return;
      }

      // Parse command arguments
      const args = (match ?? '')[1].split(' ');

      if (args.length < 2) {
        await telegramBot.sendMessage(
          chatId,
          "⚠️ Invalid format. Use: /buy <token_address> <eth_amount> [router_index] [slippage]\n\n" +
          "Example: /buy 0x1234...abcd 0.1 0 5\n" +
          "Router index: 0 for Uniswap V2, 1 for Aerodrome\n" +
          "Slippage: percentage (default 5%)"
        );
        return;
      }

      const tokenAddress = args[0];
      const ethAmount = parseFloat(args[1]);
      const routerIndex = args.length > 2 ? parseInt(args[2]) : 0;
      const slippage = args.length > 3 ? parseInt(args[3]) : 5;

      // Validate inputs
      if (isNaN(ethAmount) || ethAmount <= 0) {
        await telegramBot.sendMessage(chatId, "⚠️ Invalid ETH amount. Must be a positive number.");
        return;
      }

      if (![0, 1].includes(routerIndex)) {
        await telegramBot.sendMessage(chatId, "⚠️ Invalid router index. Use 0 for Uniswap V2 or 1 for Aerodrome.");
        return;
      }

      if (isNaN(slippage) || slippage < 1 || slippage > 100) {
        await telegramBot.sendMessage(chatId, "⚠️ Invalid slippage. Must be between 1 and 100.");
        return;
      }

      // Check if wallet private key is configured
      if (!config.WALLET_PRIVATE_KEY) {
        await telegramBot.sendMessage(chatId, "⚠️ No wallet private key configured. Cannot execute swap.");
        return;
      }

      // Validate token address
      if (!ethers.isAddress(tokenAddress)) {
        await telegramBot.sendMessage(chatId, "⚠️ Invalid token address format.");
        return;
      }

      // Send processing message
      await telegramBot.sendMessage(chatId, `🔄 Processing swap of ${ethAmount} ETH for token ${tokenAddress}`);

      // Execute the swap
      const txHash = await buyTokenWithETH(tokenAddress, ethAmount, routerIndex, slippage);

      if (txHash) {
        await telegramBot.sendMessage(chatId, `✅ Swap transaction submitted! TX: ${txHash}`);
      } else {
        await telegramBot.sendMessage(chatId, "❌ Swap failed. Check console logs for details.");
      }
    } catch (error) {
      console.error("Error handling swap command:", error);
      try {
        await telegramBot.sendMessage(msg.chat.id, `❌ An error occurred while processing your swap request.\n ${error}`);

      } catch (telegramError) {
        console.error("Error sending Telegram error message:", telegramError);
      }
    }
  });

  // Handle /help command
  telegramBot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, "⛔ Unauthorized access");
      return;
    }

    const helpMessage =
      "🤖 *Base Chain Sniper Bot Commands*\n\n" +
      "/buy <token_address> <eth_amount> - *Buy tokens with ETH*\n" +
      "/sell <token_address> <token_amount> - *Sell tokens for ETH*\n" +
      // "/buy <token_address> <eth_amount> [router_index] [slippage] - Buy tokens with ETH\n" +
      // "  Example: /buy 0x1234...abcd 0.1 0 5\n" +
      // "  Router index: 0 for Uniswap V2, 1 for Aerodrome\n" +
      // "  Slippage: percentage (default 5%)\n\n" +
      "/help - *Show this help message*";

    await telegramBot.sendMessage(chatId, helpMessage, { parse_mode: "Markdown" });
  });

  // Handle /sell command
  telegramBot.onText(/\/sell (.+)/, async (msg, match) => {
    try {
      const chatId = msg.chat.id;

      // Check if the chat ID matches the configured chat ID
      if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
        await telegramBot.sendMessage(chatId, "⛔ Unauthorized access");
        return;
      }

      // Parse command arguments
      const args = (match ?? '')[1].split(' ');

      if (args.length < 2) {
        await telegramBot.sendMessage(
          chatId,
          "⚠️ Invalid format. Use: /sell <token_address> <token_amount> [router_index] [slippage]\n\n" +
          "Example: /sell 0x1234...abcd 100 0 5\n" +
          "Router index: 0 for Uniswap V2, 1 for Aerodrome\n" +
          "Slippage: percentage (default 5%)\n\n" +
          "Use 'max' as token_amount to sell all tokens"
        );
        return;
      }

      const tokenAddress = args[0];
      const tokenAmount = args[1];
      const routerIndex = args.length > 2 ? parseInt(args[2]) : 0;
      const slippage = args.length > 3 ? parseInt(args[3]) : 5;

      // Validate inputs
      if (tokenAmount.toLowerCase() !== 'max') {
        const amount = parseFloat(tokenAmount);
        if (isNaN(amount) || amount <= 0) {
          await telegramBot.sendMessage(chatId, "⚠️ Invalid token amount. Must be a positive number or 'max'.");
          return;
        }
      }

      if (![0, 1].includes(routerIndex)) {
        await telegramBot.sendMessage(chatId, "⚠️ Invalid router index. Use 0 for Uniswap V2 or 1 for Aerodrome.");
        return;
      }

      if (isNaN(slippage) || slippage < 1 || slippage > 100) {
        await telegramBot.sendMessage(chatId, "⚠️ Invalid slippage. Must be between 1 and 100.");
        return;
      }

      // Check if wallet private key is configured
      if (!config.WALLET_PRIVATE_KEY) {
        await telegramBot.sendMessage(chatId, "⚠️ No wallet private key configured. Cannot execute swap.");
        return;
      }

      // Validate token address
      if (!ethers.isAddress(tokenAddress)) {
        await telegramBot.sendMessage(chatId, "⚠️ Invalid token address format.");
        return;
      }

      // Send processing message
      await telegramBot.sendMessage(chatId, `🔄 Processing swap to sell ${tokenAmount === 'max' ? 'all' : tokenAmount} tokens of ${tokenAddress} for ETH...`);

      // Execute the swap
      const txHash = await sellTokenForETH(tokenAddress, tokenAmount, routerIndex, slippage);

      if (txHash) {
        await telegramBot.sendMessage(chatId, `✅ Sell transaction submitted! TX: ${txHash}`);
      } else {
        await telegramBot.sendMessage(chatId, "❌ Sell failed. Check console logs for details.");
      }
    } catch (error) {
      console.error("Error handling sell command:", error);
      try {
        await telegramBot.sendMessage(msg.chat.id, `❌ An error occurred while processing your sell request.\n ${error}`);
      } catch (telegramError) {
        console.error("Error sending Telegram error message:", telegramError);
      }
    }
  });

  console.log("🤖 Telegram command handlers set up");
}