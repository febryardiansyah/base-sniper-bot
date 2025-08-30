import { IUserTokenInfo } from './token.interface';

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

export interface ISwapResult {
  txHash: string;
  tokenInfo: IUserTokenInfo;
}
