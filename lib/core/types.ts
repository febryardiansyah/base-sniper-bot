// Token information interface
export interface TokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

// Pair information interface
export interface PairInfo {
  pairAddress: string;
  token0: TokenInfo;
  token1: TokenInfo;
  reserve0: string;
  reserve1: string;
  liquidityETH: number;
}

// Big buy alert data interface
export interface BigBuyData {
  sender: string;
  ethAmount: number;
  tokenInfo: TokenInfo | null;
  routerName: string;
  txHash: string;
}

// Auto swap configuration interface
export interface AutoSwapConfig {
  enabled: boolean;
  buyAmount: number;  // Amount of ETH to spend on each buy
  slippagePercent: number;
  routerIndex: number; // 0 for Uniswap V2, 1 for Aerodrome
  minLiquidityETH: number; // Minimum liquidity required to auto swap
  maxSupplyThreshold: number; // Maximum token supply to consider for auto swap
  gasLimit?: number; // Optional gas limit for swap transactions
  gasPrice?: string; // Optional gas price in gwei
}

export interface ITokenInfo {
  balance: BigNumber;
  decimals: number;
  symbol: string;
}

export interface ISwapResult {
  txHash: string;
  tokenInfo: ITokenInfo;
}

