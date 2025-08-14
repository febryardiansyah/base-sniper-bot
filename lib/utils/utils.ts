// Utility function to pause execution
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface ICommand {
  command: string;
  description: string;
}

export const commandList: ICommand[] = [
  {
    command: "/start",
    description: "Start monitoring"
  },
  {
    command: "/stop",
    description: "Stop monitoring"
  },
  {
    command: "/help",
    description: "Show this help message"
  },
  {
    command: "/buy <token_address> <eth_amount>",
    description: "Buy tokens with ETH\nExample: /buy 0x1234...abcd 0.1 0 5"
  },
  {
    command: "/sell <token_address> <token_amount> or /sell <token_address> max",
    description: "Sell tokens for ETH"
  },
  {
    command: "/tokenbalance <token_address>",
    description: "Get token balance"
  },

]
