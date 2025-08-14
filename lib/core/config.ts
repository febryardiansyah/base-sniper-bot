import * as dotenv from "dotenv";

dotenv.config();

// Configuration interface
export interface Config {
  ALCHEMY_WS_URL: string;
  ALCHEMY_HTTP_URL: string;
  BASE_MAINET_RPC_URL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  BIG_BUY_THRESHOLD: number;
  MIN_LIQUIDITY_ETH: number;
  MAX_SUPPLY_THRESHOLD: number;
  WETH_ADDRESS: string;
  ETH_ADDRESS: string;
  UNISWAP_V2_FACTORY: string;
  UNISWAP_V2_ROUTER: string;
  AERODROME_FACTORY: string;
  AERODROME_ROUTER: string;
  BLOCK_CONFIRMATION_COUNT: number;
  RETRY_ATTEMPTS: number;
  RETRY_DELAY_MS: number;
  // Auto swap configuration
  WALLET_PRIVATE_KEY?: string;
  AUTO_SWAP_ENABLED: boolean;
  AUTO_SWAP_BUY_AMOUNT: number;
  AUTO_SWAP_SLIPPAGE_PERCENT: number;
  AUTO_SWAP_ROUTER_INDEX: number;
  AUTO_SWAP_MIN_LIQUIDITY_ETH: number;
  AUTO_SWAP_MAX_SUPPLY_THRESHOLD: number;
  AUTO_SWAP_GAS_LIMIT?: number;
  AUTO_SWAP_GAS_PRICE?: string;
}

// Configuration object
export const config: Config = {
  ALCHEMY_WS_URL: process.env.ALCHEMY_WS_URL!,
  ALCHEMY_HTTP_URL: process.env.ALCHEMY_HTTP_URL!,
  BASE_MAINET_RPC_URL: process.env.BASE_MAINET_RPC_URL!,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN!,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID!,
  BIG_BUY_THRESHOLD: parseFloat(process.env.BIG_BUY_THRESHOLD || "1.0"),
  MIN_LIQUIDITY_ETH: parseFloat(process.env.MIN_LIQUIDITY_ETH || "5.0"),
  MAX_SUPPLY_THRESHOLD: parseFloat(process.env.MAX_SUPPLY_THRESHOLD || "1000000000"),
  WETH_ADDRESS: '0x4200000000000000000000000000000000000006',
  UNISWAP_V2_FACTORY: process.env.UNISWAP_V2_FACTORY!,
  UNISWAP_V2_ROUTER: process.env.UNISWAP_V2_ROUTER!,
  AERODROME_FACTORY: process.env.AERODROME_FACTORY!,
  AERODROME_ROUTER: process.env.AERODROME_ROUTER!,
  // Universal Router configuration (Base chain)
  BLOCK_CONFIRMATION_COUNT: parseInt(process.env.BLOCK_CONFIRMATION_COUNT || "3"),
  RETRY_ATTEMPTS: parseInt(process.env.RETRY_ATTEMPTS || "3"),
  RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS || "1000"),
  // Auto swap configuration
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
  AUTO_SWAP_ENABLED: process.env.AUTO_SWAP_ENABLED === "true",
  AUTO_SWAP_BUY_AMOUNT: parseFloat(process.env.AUTO_SWAP_BUY_AMOUNT || "0.1"),
  AUTO_SWAP_SLIPPAGE_PERCENT: parseFloat(process.env.AUTO_SWAP_SLIPPAGE_PERCENT || "5"),
  AUTO_SWAP_ROUTER_INDEX: parseInt(process.env.AUTO_SWAP_ROUTER_INDEX || "0"),
  AUTO_SWAP_MIN_LIQUIDITY_ETH: parseFloat(process.env.AUTO_SWAP_MIN_LIQUIDITY_ETH || "10.0"),
  AUTO_SWAP_MAX_SUPPLY_THRESHOLD: parseFloat(process.env.AUTO_SWAP_MAX_SUPPLY_THRESHOLD || "1000000000"),
  AUTO_SWAP_GAS_LIMIT: process.env.AUTO_SWAP_GAS_LIMIT ? parseInt(process.env.AUTO_SWAP_GAS_LIMIT) : undefined,
  AUTO_SWAP_GAS_PRICE: process.env.AUTO_SWAP_GAS_PRICE,
  // Universal Router settings
  ETH_ADDRESS: '0x0000000000000000000000000000000000000000',
};