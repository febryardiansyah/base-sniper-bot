// Interface for the configuration structure
export interface IState {
  current_chain: string | 'Base' | 'Solana';
  chains: Array<string>;
  tokenBlacklist?: Array<string>;
  walletAddresses?: Array<string>;
  [key: string]: unknown; // Allow for additional configuration fields
}

// Interface for state management options
export interface IStateServiceOptions {
  configPath?: string;
  autoSave?: boolean;
  encoding?: BufferEncoding;
}
