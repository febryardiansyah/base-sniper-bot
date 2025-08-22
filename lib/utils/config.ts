import * as dotenv from 'dotenv';

dotenv.config();

// Configuration interface
export interface IConfig {
  ALCHEMY_WS_URL: string;
  ALCHEMY_HTTP_URL: string;
  BASE_MAINET_RPC_URL: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  BIG_BUY_THRESHOLD: number;
  MIN_LIQUIDITY_ETH: number;
  MAX_LIQUIDITY_ETH: number;
  MAX_SUPPLY_THRESHOLD: number;
  WETH_ADDRESS: string;
  ETH_ADDRESS: string;
  UNISWAP_V2_FACTORY: string;
  UNISWAP_V2_ROUTER: string;
  UNISWAP_V3_FACTORY: string;
  UNISWAP_V4_POOL_MANAGER: string;
  AERODROME_FACTORY: string;
  AERODROME_ROUTER: string;
  BLOCK_CONFIRMATION_COUNT: number;
  RETRY_ATTEMPTS: number;
  RETRY_DELAY_MS: number;
  WALLET_PRIVATE_KEY?: string;
  ZORA_FACTORY: string;
  ETHER_SCAN_API: string;
  ETHER_SCAN_API_KEY: string;
  BASE_CHAIN_ID: number;
  USDC_ADDRESS: string;
  NODE_ENV: string;
  IS_DEVELOPMENT: boolean;
}

// Configuration object
export const config: IConfig = {
  ALCHEMY_WS_URL: process.env.ALCHEMY_WS_URL!,
  ALCHEMY_HTTP_URL: process.env.ALCHEMY_HTTP_URL!,
  BASE_MAINET_RPC_URL: process.env.BASE_MAINET_RPC_URL!,
  TELEGRAM_BOT_TOKEN: getTelegramBotToken(),
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID!,
  BIG_BUY_THRESHOLD: parseFloat('1.0'),
  MIN_LIQUIDITY_ETH: process.env.MIN_LIQUIDITY_ETH
    ? parseFloat(process.env.MIN_LIQUIDITY_ETH)
    : 0.1,
  MAX_LIQUIDITY_ETH: process.env.MAX_LIQUIDITY_ETH
    ? parseFloat(process.env.MAX_LIQUIDITY_ETH)
    : 10.0,
  MAX_SUPPLY_THRESHOLD: parseFloat('1000000000'),
  WETH_ADDRESS: '0x4200000000000000000000000000000000000006',
  UNISWAP_V2_FACTORY: process.env.UNISWAP_V2_FACTORY!,
  UNISWAP_V2_ROUTER: process.env.UNISWAP_V2_ROUTER!,
  UNISWAP_V3_FACTORY: process.env.UNISWAP_V3_FACTORY!,
  UNISWAP_V4_POOL_MANAGER: process.env.UNISWAP_V4_POOL_MANAGER!,
  AERODROME_FACTORY: process.env.AERODROME_FACTORY!,
  AERODROME_ROUTER: process.env.AERODROME_ROUTER!,
  BLOCK_CONFIRMATION_COUNT: parseInt('3'),
  RETRY_ATTEMPTS: parseInt('3'),
  RETRY_DELAY_MS: parseInt('1000'),
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY,
  ETH_ADDRESS: '0x0000000000000000000000000000000000000000',
  ZORA_FACTORY: process.env.ZORA_FACTORY!,
  ETHER_SCAN_API: 'https://api.etherscan.io/v2/api',
  ETHER_SCAN_API_KEY: process.env.ETHER_SCAN_API_KEY!,
  BASE_CHAIN_ID: 8453,
  USDC_ADDRESS: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  NODE_ENV: process.env.NODE_ENV || 'production',
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
};

function getTelegramBotToken(): string {
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    // Development token
    console.log('🔧 Using DEVELOPMENT Telegram bot token');
    return '1151405565:AAGDshF4H_GEtaxjG7Rjhwu0FHPR5Lw16Tg';
  } else {
    // Production token from environment variable
    console.log('🚀 Using PRODUCTION Telegram bot token from environment');
    return process.env.TELEGRAM_BOT_TOKEN!;
  }
}
