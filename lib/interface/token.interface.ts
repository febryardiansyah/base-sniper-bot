// Pair information interface
export interface IPairInfo {
  pairAddress: string;
  token0: ITokenInfo;
  token1: ITokenInfo;
  liquidityETH: number;
  token0Verified?: boolean;
  token1Verified?: boolean;
}

export interface IUserTokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  balance: BigNumber;
}

export interface ITokenInfo {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
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
