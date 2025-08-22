export interface WalletTransactionData {
  walletAddress: string;
  txHash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  blockNumber: number;
  timestamp: number;
}
