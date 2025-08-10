import { ethers } from "ethers";
import * as dotenv from "dotenv";
import axios from "axios";
import TelegramBot from "node-telegram-bot-api";
import BigNumber from "bignumber.js";

// Import ABIs
import factoryAbi from "./abi/UniswapV2Factory.json";
import pairAbi from "./abi/UniswapV2Pair.json";
import erc20Abi from "./abi/ERC20.json";
import routerAbi from "./abi/Router.json";

dotenv.config();

// Configuration
const config = {
  ALCHEMY_WS_URL: process.env.ALCHEMY_WS_URL!,
  ALCHEMY_HTTP_URL: process.env.ALCHEMY_HTTP_URL!,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID!,
  BIG_BUY_THRESHOLD: parseFloat(process.env.BIG_BUY_THRESHOLD || "1.0"),
  MIN_LIQUIDITY_ETH: parseFloat(process.env.MIN_LIQUIDITY_ETH || "5.0"),
  MAX_SUPPLY_THRESHOLD: parseFloat(process.env.MAX_SUPPLY_THRESHOLD || "1000000000"),
  WETH_ADDRESS: process.env.WETH_ADDRESS!.toLowerCase(),
  UNISWAP_V2_FACTORY: process.env.UNISWAP_V2_FACTORY!,
  UNISWAP_V2_ROUTER: process.env.UNISWAP_V2_ROUTER!,
  AERODROME_FACTORY: process.env.AERODROME_FACTORY!,
  AERODROME_ROUTER: process.env.AERODROME_ROUTER!,
  BLOCK_CONFIRMATION_COUNT: parseInt(process.env.BLOCK_CONFIRMATION_COUNT || "3"),
  RETRY_ATTEMPTS: parseInt(process.env.RETRY_ATTEMPTS || "3"),
  RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS || "1000")
};

// Initialize providers
const wsProvider = new ethers.WebSocketProvider(config.ALCHEMY_WS_URL);
const httpProvider = new ethers.JsonRpcProvider(config.ALCHEMY_HTTP_URL);

// Initialize Telegram bot
const telegramBot = new TelegramBot(config.TELEGRAM_BOT_TOKEN);

// Tracked pairs to avoid duplicate alerts
const trackedPairs = new Set<string>();
const processedTransactions = new Set<string>();

interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

interface PairInfo {
  pairAddress: string;
  token0: TokenInfo;
  token1: TokenInfo;
  reserve0: string;
  reserve1: string;
  liquidityETH: number;
}

class BaseChainSniperBot {
  private factories: ethers.Contract[];
  private routers: ethers.Contract[];

  constructor() {
    // Initialize factory contracts
    this.factories = [
      new ethers.Contract(config.UNISWAP_V2_FACTORY, factoryAbi, wsProvider),
      new ethers.Contract(config.AERODROME_FACTORY, factoryAbi, wsProvider)
    ];

    // Initialize router contracts
    this.routers = [
      new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbi, wsProvider),
      new ethers.Contract(config.AERODROME_ROUTER, routerAbi, wsProvider)
    ];
  }

  async start() {
    console.log("🚀 Base Chain Sniper Bot Starting...");
    console.log(`📡 Monitoring ${this.factories.length} factories and ${this.routers.length} routers`);
    
    await this.sendTelegramMessage("🤖 Base Chain Sniper Bot is now ONLINE!\n\n📊 Monitoring new tokens with high liquidity...");

    // Monitor new pair creation
    this.monitorNewPairs();
    
    // Monitor big buys on existing pairs
    this.monitorBigBuys();
    
    // Monitor blocks
    this.monitorBlocks();
  }

  private monitorBlocks() {
    wsProvider.on("block", (blockNumber) => {
      console.log(`📦 Block ${blockNumber}`);
    });
  }

  private monitorNewPairs() {
    this.factories.forEach((factory, index) => {
      const factoryName = index === 0 ? "Uniswap V2" : "Aerodrome";
      
      factory.on("PairCreated", async (token0: string, token1: string, pairAddress: string, pairIndex: bigint) => {
        try {
          console.log(`🆕 New pair detected on ${factoryName}: ${pairAddress}`);
          
          if (trackedPairs.has(pairAddress.toLowerCase())) {
            return; // Already processed
          }
          
          trackedPairs.add(pairAddress.toLowerCase());
          
          // Wait for confirmations
          await this.sleep(config.RETRY_DELAY_MS * config.BLOCK_CONFIRMATION_COUNT);
          
          const pairInfo = await this.analyzePair(pairAddress, token0, token1);
          
          if (pairInfo && this.shouldAlert(pairInfo)) {
            await this.sendPairAlert(pairInfo, factoryName);
          }
        } catch (error) {
          console.error(`Error processing new pair ${pairAddress}:`, error);
        }
      });
    });
  }

  private monitorBigBuys() {
    this.routers.forEach((router, index) => {
      const routerName = index === 0 ? "Uniswap V2" : "Aerodrome";
      
      router.on("Swap", async (sender: string, amountIn: bigint, amountOutMin: bigint, path: string[], to: string, event: any) => {
        try {
          const txHash = event.log.transactionHash;
          
          if (processedTransactions.has(txHash)) {
            return;
          }
          
          processedTransactions.add(txHash);
          
          if (!Array.isArray(path) || path.length < 2) return;
          
          const inputToken = path[0].toLowerCase();
          const outputToken = path[path.length - 1].toLowerCase();
          
          // Check if buying with ETH
          if (inputToken === config.WETH_ADDRESS) {
            const ethAmount = parseFloat(ethers.formatEther(amountIn));
            
            if (ethAmount >= config.BIG_BUY_THRESHOLD) {
              const tokenInfo = await this.getTokenInfo(outputToken);
              await this.sendBuyAlert({
                sender,
                ethAmount,
                tokenInfo,
                routerName,
                txHash
              });
            }
          }
        } catch (error) {
          console.error("Error processing swap event:", error);
        }
      });
    });
  }

  private async analyzePair(pairAddress: string, token0Address: string, token1Address: string): Promise<PairInfo | null> {
    try {
      const pairContract = new ethers.Contract(pairAddress, pairAbi, httpProvider);
      
      // Get token information
      const [token0Info, token1Info] = await Promise.all([
        this.getTokenInfo(token0Address),
        this.getTokenInfo(token1Address)
      ]);
      
      if (!token0Info || !token1Info) {
        return null;
      }
      
      // Get reserves
      const reserves = await pairContract.getReserves();
      const reserve0 = reserves[0].toString();
      const reserve1 = reserves[1].toString();
      
      // Calculate ETH liquidity
      let liquidityETH = 0;
      
      if (token0Address.toLowerCase() === config.WETH_ADDRESS) {
        liquidityETH = parseFloat(ethers.formatEther(reserve0));
      } else if (token1Address.toLowerCase() === config.WETH_ADDRESS) {
        liquidityETH = parseFloat(ethers.formatEther(reserve1));
      }
      
      return {
        pairAddress,
        token0: token0Info,
        token1: token1Info,
        reserve0,
        reserve1,
        liquidityETH
      };
    } catch (error) {
      console.error(`Error analyzing pair ${pairAddress}:`, error);
      return null;
    }
  }

  private async getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, httpProvider);
      
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        tokenContract.name().catch(() => "Unknown"),
        tokenContract.symbol().catch(() => "???"),
        tokenContract.decimals().catch(() => 18),
        tokenContract.totalSupply().catch(() => "0")
      ]);
      
      return {
        address: tokenAddress,
        name,
        symbol,
        decimals,
        totalSupply: totalSupply.toString()
      };
    } catch (error) {
      console.error(`Error getting token info for ${tokenAddress}:`, error);
      return null;
    }
  }

  private shouldAlert(pairInfo: PairInfo): boolean {
    // Check minimum liquidity
    if (pairInfo.liquidityETH < config.MIN_LIQUIDITY_ETH) {
      return false;
    }
    
    // Check token supply (avoid tokens with extremely high supply)
    const nonWETHToken = pairInfo.token0.address.toLowerCase() === config.WETH_ADDRESS ? pairInfo.token1 : pairInfo.token0;
    const supply = new BigNumber(nonWETHToken.totalSupply).dividedBy(new BigNumber(10).pow(nonWETHToken.decimals));
    
    if (supply.isGreaterThan(config.MAX_SUPPLY_THRESHOLD)) {
      return false;
    }
    
    return true;
  }

  private async sendPairAlert(pairInfo: PairInfo, exchange: string) {
    const nonWETHToken = pairInfo.token0.address.toLowerCase() === config.WETH_ADDRESS ? pairInfo.token1 : pairInfo.token0;
    
    const message = 
      `🎯 *NEW HIGH-LIQUIDITY TOKEN DETECTED*\n\n` +
      `🏪 Exchange: *${exchange}*\n` +
      `🪙 Token: *${nonWETHToken.symbol}* (${nonWETHToken.name})\n` +
      `📍 Address: \`${nonWETHToken.address}\`\n` +
      `💧 Liquidity: *${pairInfo.liquidityETH.toFixed(2)} ETH*\n` +
      `📊 Total Supply: *${new BigNumber(nonWETHToken.totalSupply).dividedBy(new BigNumber(10).pow(nonWETHToken.decimals)).toFormat()}*\n` +
      `🔗 Pair: \`${pairInfo.pairAddress}\`\n\n` +
      `⚡ *SNIPE OPPORTUNITY DETECTED!*`;
    
    await this.sendTelegramMessage(message);
    console.log(`🚨 ALERT: New token ${nonWETHToken.symbol} with ${pairInfo.liquidityETH.toFixed(2)} ETH liquidity`);
  }

  private async sendBuyAlert(data: {
    sender: string;
    ethAmount: number;
    tokenInfo: TokenInfo | null;
    routerName: string;
    txHash: string;
  }) {
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
    
    await this.sendTelegramMessage(message);
    console.log(`🔥 BIG BUY: ${data.ethAmount.toFixed(4)} ETH spent on ${tokenSymbol}`);
  }

  private async sendTelegramMessage(message: string) {
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

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Base Chain Sniper Bot...');
  process.exit(0);
});

// Start the bot
const bot = new BaseChainSniperBot();
bot.start().catch(console.error);

console.log("🎯 Base Chain Sniper Bot initialized and ready to hunt!");