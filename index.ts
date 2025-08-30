import { App } from './lib/app';

// Error handling
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Base Sniper Bot...');
  process.exit(0);
});

// Start the bot
const bot = new App();
bot.start().catch(console.error);

console.log('🎯 Base Sniper Bot initialized and ready to hunt!');
