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
  buyAmount: number; // Amount of ETH to spend on each buy
  slippagePercent: number;
  routerIndex: number; // 0 for Uniswap V2, 1 for Aerodrome
  minLiquidityETH: number; // Minimum liquidity required to auto swap
  maxSupplyThreshold: number; // Maximum token supply to consider for auto swap
  gasLimit?: number; // Optional gas limit for swap transactions
  gasPrice?: string; // Optional gas price in gwei
}

export interface IUserTokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  balance: BigNumber;
}

export interface ISwapResult {
  txHash: string;
  tokenInfo: IUserTokenInfo;
}

export interface ITokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
}

// Define interfaces for Relay API responses
export interface IRelayQuoteResponse {
  details: {
    currencyIn: {
      amount: string;
      currency: {
        address: string;
        symbol: string;
        decimals: number;
        chainId: number;
      };
    };
    currencyOut: {
      amount: string;
      currency: {
        address: string;
        symbol: string;
        decimals: number;
        chainId: number;
      };
    };
    rate: string;
    totalImpact: {
      percent: string;
    };
  };
  steps: Array<{
    id: string;
    description: string;
    requestId?: string;
    items: Array<{
      data: {
        to: string;
        data: string;
        value: string;
        chainId: number;
        gasLimit?: string;
        maxFeePerGas?: string;
        maxPriorityFeePerGas?: string;
      };
    }>;
  }>;
}

export interface IRelaySwapStatusResponse {
  status: string;
  message: string;
  timestamp: string;
}

export interface ITransaction {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  isError: string;
  txreceipt_status: string;
}

export interface IEtherscanResponse {
  status: string;
  message: string;
  result: ITransaction[];
}
