import { BaseChainSniperBot } from "./lib/BaseChainSniperBot";

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Base Chain Sniper Bot...');
  process.exit(0);
});

// Start the bot
const bot = new BaseChainSniperBot();
bot.start().catch(console.error);

console.log("🎯 Base Chain Sniper Bot initialized and ready to hunt!");