const { ethers } = require("ethers");
const { config } = require("./lib/core/config");
const { baseProvider } = require("./lib/blockchain/providers");
const { 
  findBestMultiHopPath, 
  smartBuyWithMultiHop, 
  getMultiHopQuote,
  isMultiHopBeneficial 
} = require("./lib/services/multiHopSwap");
const { buyTokenWithETH } = require("./lib/services/swap");

// Test configuration
const TEST_CONFIG = {
  // Test token with potentially limited direct liquidity
  TEST_TOKEN: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", // DEGEN token on Base
  ETH_AMOUNT: 0.001, // Small amount for testing
  SLIPPAGE: 5
};

async function testMultiHopFunctionality() {
  console.log("\n🧪 Testing Multi-Hop Swap Functionality");
  console.log("=".repeat(50));
  
  try {
    // Test 1: Find best multi-hop path
    console.log("\n📍 Test 1: Finding best multi-hop path...");
    const amountIn = ethers.parseEther(TEST_CONFIG.ETH_AMOUNT.toString());
    
    const bestPath = await findBestMultiHopPath(
      config.WETH_ADDRESS,
      TEST_CONFIG.TEST_TOKEN,
      amountIn.toString()
    );
    
    if (bestPath) {
      console.log(`✅ Best path found with ${bestPath.length} hops`);
      console.log(`Path: WETH -> ${bestPath.map(hop => hop.tokenAddress).join(' -> ')}`);
    } else {
      console.log(`❌ No viable path found`);
    }
    
    // Test 2: Check if multi-hop is beneficial
    console.log("\n📊 Test 2: Checking if multi-hop is beneficial...");
    const isBeneficial = await isMultiHopBeneficial(
      config.WETH_ADDRESS,
      TEST_CONFIG.TEST_TOKEN,
      amountIn.toString()
    );
    
    console.log(`Multi-hop beneficial: ${isBeneficial ? '✅ Yes' : '❌ No'}`);
    
    // Test 3: Get multi-hop quote
    console.log("\n💰 Test 3: Getting multi-hop quote...");
    const quote = await getMultiHopQuote(
      config.WETH_ADDRESS,
      TEST_CONFIG.TEST_TOKEN,
      amountIn.toString()
    );
    
    if (quote) {
      console.log(`✅ Quote received:`);
      console.log(`  Input: ${ethers.formatEther(amountIn)} ETH`);
      console.log(`  Expected output: ${ethers.formatUnits(quote.outputAmount, 18)} tokens`);
      console.log(`  Path: ${quote.path.join(' -> ')}`);
      
      // Calculate price impact
      const inputValue = parseFloat(ethers.formatEther(amountIn));
      const outputTokens = parseFloat(ethers.formatUnits(quote.outputAmount, 18));
      console.log(`  Rate: ${(outputTokens / inputValue).toFixed(2)} tokens per ETH`);
    } else {
      console.log(`❌ No quote available`);
    }
    
    // Test 4: Test integrated swap with multi-hop
    console.log("\n🔄 Test 4: Testing integrated swap with multi-hop detection...");
    console.log(`Attempting to buy ${TEST_CONFIG.TEST_TOKEN} with ${TEST_CONFIG.ETH_AMOUNT} ETH`);
    
    // This will automatically use multi-hop if beneficial
    const swapResult = await buyTokenWithETH(
      TEST_CONFIG.TEST_TOKEN,
      TEST_CONFIG.ETH_AMOUNT
    );
    
    if (swapResult) {
      console.log(`✅ Swap successful!`);
      console.log(`  Transaction: ${swapResult.txHash}`);
      console.log(`  Token: ${swapResult.tokenInfo.name} (${swapResult.tokenInfo.symbol})`);
      console.log(`  Balance: ${ethers.formatUnits(swapResult.tokenInfo.balance, swapResult.tokenInfo.decimals)}`);
    } else {
      console.log(`❌ Swap failed`);
    }
    
    // Test 5: Direct smart multi-hop buy
    console.log("\n🧠 Test 5: Testing direct smart multi-hop buy...");
    const smartResult = await smartBuyWithMultiHop(
      TEST_CONFIG.TEST_TOKEN,
      TEST_CONFIG.ETH_AMOUNT,
      TEST_CONFIG.SLIPPAGE
    );
    
    if (smartResult) {
      console.log(`✅ Smart multi-hop buy successful!`);
      console.log(`  Transaction: ${smartResult.txHash}`);
      console.log(`  Path used: ${smartResult.path.join(' -> ')}`);
      console.log(`  Gas used: ${smartResult.totalGasUsed}`);
      console.log(`  Token: ${smartResult.tokenInfo.name} (${smartResult.tokenInfo.symbol})`);
    } else {
      console.log(`❌ Smart multi-hop buy failed`);
    }
    
  } catch (error) {
    console.error(`\n❌ Test failed with error:`, error.message);
    if (error.code) {
      console.error(`Error code: ${error.code}`);
    }
  }
}

async function demonstrateMultiHopBenefits() {
  console.log("\n\n🎯 Multi-Hop Benefits Demonstration");
  console.log("=".repeat(50));
  
  const testTokens = [
    {
      name: "DEGEN",
      address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed",
      description: "Popular meme token with varying liquidity"
    },
    {
      name: "VIRTUAL", 
      address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
      description: "AI token with potential routing benefits"
    }
  ];
  
  for (const token of testTokens) {
    console.log(`\n🔍 Analyzing ${token.name} (${token.description})`);
    console.log("-".repeat(40));
    
    const amountIn = ethers.parseEther("0.001");
    
    try {
      // Check direct vs multi-hop
      const isBeneficial = await isMultiHopBeneficial(
        config.WETH_ADDRESS,
        token.address,
        amountIn.toString()
      );
      
      console.log(`Multi-hop beneficial: ${isBeneficial ? '🚀 YES' : '⚡ NO (direct is better)'}`);
      
      if (isBeneficial) {
        const quote = await getMultiHopQuote(
          config.WETH_ADDRESS,
          token.address,
          amountIn.toString()
        );
        
        if (quote) {
          console.log(`Recommended path: ${quote.path.join(' -> ')}`);
          console.log(`Expected output: ${ethers.formatUnits(quote.outputAmount, 18)} tokens`);
        }
      }
      
    } catch (error) {
      console.log(`❌ Analysis failed: ${error.message}`);
    }
  }
}

async function main() {
  console.log("🚀 Multi-Hop Swap Testing Suite");
  console.log(`Network: Base (Chain ID: ${await baseProvider.getNetwork().then(n => n.chainId)})`);
  console.log(`Wallet: ${new ethers.Wallet(config.WALLET_PRIVATE_KEY, baseProvider).address}`);
  
  // Run tests
  await testMultiHopFunctionality();
  await demonstrateMultiHopBenefits();
  
  console.log("\n\n✨ Multi-hop testing completed!");
  console.log("\n📚 Key Features Implemented:");
  console.log("  ✅ Automatic path finding through common base tokens");
  console.log("  ✅ Liquidity analysis and route optimization");
  console.log("  ✅ Integration with existing swap infrastructure");
  console.log("  ✅ Fallback to direct swaps when beneficial");
  console.log("  ✅ Support for both Universal Router and legacy routers");
  console.log("  ✅ Gas optimization and slippage protection");
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

// Run the tests
main().catch(console.error);