import * as dotenv from "dotenv";

dotenv.config();

// Configuration interface
export interface Config {
  ALCHEMY_WS_URL: string;
  ALCHEMY_HTTP_URL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  BIG_BUY_THRESHOLD: number;
  MIN_LIQUIDITY_ETH: number;
  MAX_SUPPLY_THRESHOLD: number;
  WETH_ADDRESS: string;
  UNISWAP_V2_FACTORY: string;
  UNISWAP_V2_ROUTER: string;
  AERODROME_FACTORY: string;
  AERODROME_ROUTER: string;
  BLOCK_CONFIRMATION_COUNT: number;
  RETRY_ATTEMPTS: number;
  RETRY_DELAY_MS: number;
}

// Configuration object
export const config: Config = {
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