// Pair information interface
export interface PairInfo {
  pairAddress: string;
  token0: ITokenInfo;
  token1: ITokenInfo;
  reserve0: string;
  reserve1: string;
  liquidityETH: number;
}

// Big buy alert data interface
export interface BigBuyData {
  sender: string;
  ethAmount: number;
  tokenInfo: ITokenInfo | null;
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
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  balance: BigNumber;
}

export interface ISwapResult {
  txHash: string;
  tokenInfo: ITokenInfo;
}

// Multi-hop swap path interface
export interface IHopPath {
  tokenAddress: string;
  poolFee?: number; // For V3 pools
  router?: string; // Specific router for this hop
}

// Multi-hop swap configuration
export interface IMultiHopSwapConfig {
  inputToken: string;
  outputToken: string;
  path: IHopPath[];
  amountIn: string;
  amountOutMin: string;
  slippagePercent: number;
  deadline?: number;
}

// Multi-hop swap result with path information
export interface IMultiHopSwapResult extends ISwapResult {
  path: string[];
  intermediateAmounts: string[];
  totalGasUsed: string;
  effectivePrice: string;
}

