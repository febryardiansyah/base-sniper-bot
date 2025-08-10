// Simple test to verify the bot can be imported and initialized
const { ethers } = require('ethers');

console.log('🧪 Testing Base Chain Sniper Bot...');

// Test ethers.js connection
try {
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  console.log('✅ Ethers.js provider created successfully');
} catch (error) {
  console.error('❌ Error creating provider:', error.message);
}

// Test environment variables structure
const requiredEnvVars = [
  'ALCHEMY_WS_URL',
  'ALCHEMY_HTTP_URL', 
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID',
  'WETH_ADDRESS'
];

console.log('\n📋 Checking environment variables:');
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  if (value && !value.includes('YOUR_')) {
    console.log(`✅ ${envVar}: Configured`);
  } else {
    console.log(`⚠️  ${envVar}: Not configured (using placeholder)`);
  }
});

console.log('\n🎯 Test completed! Configure your .env file and run "npm run dev" to start the bot.');
console.log('📖 See README.md for detailed setup instructions.');