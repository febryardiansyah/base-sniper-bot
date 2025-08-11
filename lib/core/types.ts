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