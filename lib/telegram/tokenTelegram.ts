import { ethers } from 'ethers';
import { buyTokenWithRelayRouter, sellTokenWithRelayRouter } from '../services/relay.service';
import { config } from '../utils/config';
import { telegramBot } from './telegram';
import { checkUserTokenInfo } from '../services/info.service';
import { stateService } from '../services/state.service';

export function commandHandlers(): void {
  // Handle /swap command
  telegramBot.onText(/\/buy (.+)/, async (msg, match) => {
    try {
      const chatId = msg.chat.id;

      // Check if the chat ID matches the configured chat ID
      if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
        await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
        return;
      }

      // Parse command arguments
      const args = (match ?? '')[1].split(' ');

      if (args.length < 2) {
        await telegramBot.sendMessage(
          chatId,
          '⚠️ Invalid format. Use: /buy <token_address> <eth_amount> [router_index] [slippage]\n\n' +
            'Example: /buy 0x1234...abcd 0.1 0 5\n' +
            'Router index: 0 for Uniswap V2, 1 for Aerodrome\n' +
            'Slippage: percentage (default 5%)'
        );
        return;
      }

      const tokenAddress = args[0];
      const ethAmount = parseFloat(args[1]);
      const routerIndex = args.length > 2 ? parseInt(args[2]) : 0;
      const slippage = args.length > 3 ? parseInt(args[3]) : 5;

      // Validate inputs
      if (isNaN(ethAmount) || ethAmount <= 0) {
        await telegramBot.sendMessage(chatId, '⚠️ Invalid ETH amount. Must be a positive number.');
        return;
      }

      if (![0, 1].includes(routerIndex)) {
        await telegramBot.sendMessage(
          chatId,
          '⚠️ Invalid router index. Use 0 for Uniswap V2 or 1 for Aerodrome.'
        );
        return;
      }

      if (isNaN(slippage) || slippage < 1 || slippage > 100) {
        await telegramBot.sendMessage(chatId, '⚠️ Invalid slippage. Must be between 1 and 100.');
        return;
      }

      // Check if wallet private key is configured
      if (!config.WALLET_PRIVATE_KEY) {
        await telegramBot.sendMessage(
          chatId,
          '⚠️ No wallet private key configured. Cannot execute swap.'
        );
        return;
      }

      // Validate token address
      if (!ethers.isAddress(tokenAddress)) {
        await telegramBot.sendMessage(chatId, '⚠️ Invalid token address format.');
        return;
      }

      // Send processing message
      await telegramBot.sendMessage(
        chatId,
        `🔄 Processing swap of ${ethAmount} ETH for token ${tokenAddress}`
      );

      // Execute the swap using Relay Router
      const buyResult = await buyTokenWithRelayRouter(tokenAddress, ethAmount, slippage);

      await telegramBot.sendMessage(
        chatId,
        `✅ *Swap transaction submitted! Tx Hash*: \`${buyResult.txHash}\n\n\`` +
          `📊 *Purchased* : ${ethers.formatUnits(
            buyResult.tokenInfo.balance.toString(),
            buyResult.tokenInfo.decimals
          )} *${buyResult.tokenInfo.symbol}*`,
        {
          parse_mode: 'Markdown',
        }
      );
    } catch (error) {
      console.error('Error handling swap command:', error);
      try {
        await telegramBot.sendMessage(
          msg.chat.id,
          `❌ An error occurred while processing your swap request.\n ${error}`
        );
      } catch (telegramError) {
        console.error('Error sending Telegram error message:', telegramError);
      }
    }
  });

  // Handle /sell command
  telegramBot.onText(/\/sell (.+)/, async (msg, match) => {
    try {
      const chatId = msg.chat.id;

      // Check if the chat ID matches the configured chat ID
      if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
        await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
        return;
      }

      // Parse command arguments
      const args = (match ?? '')[1].split(' ');

      if (args.length < 2) {
        await telegramBot.sendMessage(
          chatId,
          '⚠️ Invalid format. Use: /sell <token_address> <token_amount> [router_index] [slippage]\n\n' +
            'Example: /sell 0x1234...abcd 100 0 5\n' +
            'Router index: 0 for Uniswap V2, 1 for Aerodrome\n' +
            'Slippage: percentage (default 5%)\n\n' +
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
          await telegramBot.sendMessage(
            chatId,
            "⚠️ Invalid token amount. Must be a positive number or 'max'."
          );
          return;
        }
      }

      if (![0, 1].includes(routerIndex)) {
        await telegramBot.sendMessage(
          chatId,
          '⚠️ Invalid router index. Use 0 for Uniswap V2 or 1 for Aerodrome.'
        );
        return;
      }

      if (isNaN(slippage) || slippage < 1 || slippage > 100) {
        await telegramBot.sendMessage(chatId, '⚠️ Invalid slippage. Must be between 1 and 100.');
        return;
      }

      // Check if wallet private key is configured
      if (!config.WALLET_PRIVATE_KEY) {
        await telegramBot.sendMessage(
          chatId,
          '⚠️ No wallet private key configured. Cannot execute swap.'
        );
        return;
      }

      // Validate token address
      if (!ethers.isAddress(tokenAddress)) {
        await telegramBot.sendMessage(chatId, '⚠️ Invalid token address format.');
        return;
      }

      // Send processing message
      await telegramBot.sendMessage(
        chatId,
        `🔄 Processing swap to sell ${
          tokenAmount === 'max' ? 'all' : tokenAmount
        } tokens of ${tokenAddress} for ETH...`
      );

      // Execute the swap using Relay Router
      const sellResult = await sellTokenWithRelayRouter(tokenAddress, tokenAmount, slippage);

      await telegramBot.sendMessage(
        chatId,
        `✅ *Sell transaction submitted! Tx Hash*: \`${sellResult.txHash}\`\n\n` +
          `💰 *Remaining* : ${ethers.formatUnits(
            sellResult.tokenInfo.balance.toString(),
            sellResult.tokenInfo.decimals
          )} *${sellResult.tokenInfo.symbol}*`,
        {
          parse_mode: 'Markdown',
        }
      );
    } catch (error) {
      console.error('Error handling sell command:', error);
      try {
        await telegramBot.sendMessage(
          msg.chat.id,
          `❌ An error occurred while processing your sell request.\n ${error}`
        );
      } catch (telegramError) {
        console.error('Error sending Telegram error message:', telegramError);
      }
    }
  });

  telegramBot.onText(/\/tokenbalance (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    // Check if the chat ID matches the configured chat ID
    if (chatId.toString() !== config.TELEGRAM_CHAT_ID) {
      await telegramBot.sendMessage(chatId, '⛔ Unauthorized access');
      return;
    }

    const args = (match ?? '')[1].split(' ');
    const tokenAddress = args[0];

    try {
      const balance = await checkUserTokenInfo(tokenAddress);
      await telegramBot.sendMessage(
        chatId,
        `\n📊 *Token Balance*: ${ethers.formatUnits(
          balance.balance.toString(),
          balance.decimals
        )} *${balance.symbol}*`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      await telegramBot.sendMessage(chatId, `Error checking token balance: ${error}`);
    }
  });
}
