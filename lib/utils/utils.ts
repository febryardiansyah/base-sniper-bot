// Utility function to pause execution
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface ICommand {
  command: string;
  description: string;
}

export const commandList: ICommand[] = [
  {
    command: "/start",
    description: "Start monitoring",
  },
  {
    command: "/stop",
    description: "Stop monitoring",
  },
  {
    command: "/status",
    description: "Show monitoring status",
  },
  {
    command: "/help",
    description: "Show this help message",
  },
  {
    command: "/buy <token_address> <eth_amount>",
    description: "Buy tokens with ETH\nExample: /buy 0x1234...abcd 0.1 0 5",
  },
  {
    command:
      "/sell <token_address> <token_amount> or /sell <token_address> max",
    description: "Sell tokens for ETH",
  },
  {
    command: "/tokenbalance <token_address>",
    description: "Get token balance",
  },
];

export function getTimeAgo(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp * 1000);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  // Time intervals in seconds
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };

  if (seconds < 60) {
    return `${seconds} seconds ago`;
  } else if (seconds < intervals.hour) {
    const minutes = Math.floor(seconds / intervals.minute);
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  } else if (seconds < intervals.day) {
    const hours = Math.floor(seconds / intervals.hour);
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  } else if (seconds < intervals.week) {
    const days = Math.floor(seconds / intervals.day);
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  } else if (seconds < intervals.month) {
    const weeks = Math.floor(seconds / intervals.week);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  } else if (seconds < intervals.year) {
    const months = Math.floor(seconds / intervals.month);
    return `${months} ${months === 1 ? "month" : "months"} ago`;
  } else {
    const years = Math.floor(seconds / intervals.year);
    return `${years} ${years === 1 ? "year" : "years"} ago`;
  }
}
