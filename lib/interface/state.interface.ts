export interface IState {
  tokenBlacklist?: Array<string>;
  walletAddresses?: Array<string>;
  [key: string]: unknown;
}

export interface IStateServiceOptions {
  configPath?: string;
  autoSave?: boolean;
  encoding?: BufferEncoding;
}
