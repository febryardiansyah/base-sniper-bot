const { ethers } = require('ethers');

const RPC_URL = "https://mainnet.base.org";
const PRIVATE_KEY = "0xcbdf12bae04952a2db5cae8108509533ac3be9f63e6dcf7f825ef57b700afc9f";

// Router addresses from .env.example
const AERODROME_ROUTER = "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43";
const UNISWAP_V2_ROUTER = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
const WETH = "0x4200000000000000000000000000000000000006";

// The token we'll try to swap to first
const TOKEN_ADDRESS = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";
const ETH_AMOUNT = "0.00001";

// Router names for logging
const ROUTER_NAMES = {
  [AERODROME_ROUTER]: "Aerodrome",
  [UNISWAP_V2_ROUTER]: "Uniswap V2"
};

// More complete Router ABI
const routerABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
  "function factory() external pure returns (address)"
];

// Factory ABI
const factoryABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  // Create router instances for both DEXes
  const aerodromeRouter = new ethers.Contract(AERODROME_ROUTER, routerABI, wallet);
  const uniswapRouter = new ethers.Contract(UNISWAP_V2_ROUTER, routerABI, wallet);
  
  const path = [WETH, TOKEN_ADDRESS];
  const amountIn = ethers.parseEther(ETH_AMOUNT);
  
  // Try both routers
  const routers = [aerodromeRouter, uniswapRouter];
  const routerAddresses = [AERODROME_ROUTER, UNISWAP_V2_ROUTER];
  let swapSuccessful = false;
  
  for (let i = 0; i < routers.length; i++) {
    const router = routers[i];
    const routerAddress = routerAddresses[i];
    const routerName = ROUTER_NAMES[routerAddress];
    
    console.log(`\n🔄 Trying ${routerName} router...`);
    
    // Check if pair exists in factory
    try {
      const factoryAddress = await router.factory();
      console.log(`${routerName} Factory address: ${factoryAddress}`);
      
      // Create factory contract instance
      const factory = new ethers.Contract(factoryAddress, factoryABI, provider);
      
      // Check if pair exists
      const pairAddress = await factory.getPair(WETH, TOKEN_ADDRESS);
      
      if (pairAddress === ethers.ZeroAddress) {
        console.log(`❌ No liquidity pool exists for WETH and this token on ${routerName}`);
        continue; // Try next router
      }
      
      console.log(`✅ Found liquidity pool at ${pairAddress} on ${routerName}`);
    } catch (error) {
      console.error(`Error checking liquidity pool on ${routerName}: ${error.message}`);
      // Continue anyway as we'll check with getAmountsOut too
    }
  
    // Check if the pair exists and has liquidity
    try {
      console.log(`Checking if there's liquidity for the pair WETH/${TOKEN_ADDRESS} on ${routerName}...`);
      
      // Try to get expected output amount
      let amounts;
      try {
        amounts = await router.getAmountsOut(amountIn, path);
        console.log(`✅ Liquidity found on ${routerName}! Expected output: ${ethers.formatUnits(amounts[1], 18)} tokens`);
      } catch (error) {
        console.error(`❌ No liquidity found for this pair on ${routerName}. Error: ${error.message}`);
        continue; // Try next router
      }
      
      // Set min output to 95% of expected (5% slippage)
      const amountOutMin = amounts[1] * 95n / 100n;
      console.log(`Minimum output: ${ethers.formatUnits(amountOutMin, 18)} tokens`);
      
      // Check if token might have transfer fees
      const tokenContract = new ethers.Contract(
        TOKEN_ADDRESS,
        ["function name() view returns (string)", "function symbol() view returns (string)"],
        provider
      );
      
      let tokenInfo = "Unknown Token";
      try {
        const [name, symbol] = await Promise.all([
          tokenContract.name().catch(() => "Unknown"),
          tokenContract.symbol().catch(() => "???") 
        ]);
        tokenInfo = `${name} (${symbol})`;
        console.log(`Swapping ETH for ${tokenInfo}`);
      } catch (error) {
        console.log("Could not get token info, proceeding anyway");
      }
      
      console.log(`Swapping on ${routerName}...`);
      
      // Try regular swap first
      try {
        const tx = await router.swapExactETHForTokens(
          amountOutMin,
          path,
          wallet.address,
          Math.floor(Date.now() / 1000) + 60 * 10,
          { value: amountIn, gasLimit: 300000 }
        );
        
        console.log(`Transaction sent on ${routerName}, waiting for confirmation...`);
        const receipt = await tx.wait();
        console.log(`✅ Swap complete on ${routerName}! Hash: ${receipt.hash}`);
        swapSuccessful = true;
        break; // Exit the loop if successful
      } catch (error) {
        console.log(`Regular swap failed on ${routerName}, trying with fee on transfer support...`);
        
        try {
          // If regular swap fails, try with fee on transfer support
          const tx = await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
            0n, // Set to 0 for tokens with fees
            path,
            wallet.address,
            Math.floor(Date.now() / 1000) + 60 * 10,
            { value: amountIn, gasLimit: 500000 }
          );
          
          console.log(`Fee-supporting transaction sent on ${routerName}, waiting for confirmation...`);
          const receipt = await tx.wait();
          console.log(`✅ Fee-supporting swap complete on ${routerName}! Hash: ${receipt.hash}`);
          swapSuccessful = true;
          break; // Exit the loop if successful
        } catch (feeError) {
          console.error(`❌ Fee-supporting swap also failed on ${routerName}: ${feeError.message}`);
          // Continue to next router
        }
      }
    } catch (error) {
      console.error(`Error during swap on ${routerName}:`, error.message);
      // Continue to next router
    }
  }
  
  if (!swapSuccessful) {
    console.error("❌ Swap failed on all available routers for the primary token.");
    
    console.error("❌ All swap attempts failed. Please check your token addresses and try again.");
  }
  
  return swapSuccessful;
}

// Function to check token balance
async function checkTokenBalance(wallet, tokenAddress) {
  const tokenContract = new ethers.Contract(
    tokenAddress,
    [
      "function balanceOf(address owner) view returns (uint256)",
      "function decimals() view returns (uint8)",
      "function symbol() view returns (string)"
    ],
    wallet.provider
  );
  
  try {
    const [balance, decimals, symbol] = await Promise.all([
      tokenContract.balanceOf(wallet.address),
      tokenContract.decimals().catch(() => 18),
      tokenContract.symbol().catch(() => "TOKEN")
    ]);
    
    console.log(`\n📊 Token Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
    return balance > 0n;
  } catch (error) {
    console.error("Error checking token balance:", error.message);
    return false;
  }
}

// Run the main function and check balance after swap
async function runWithBalanceCheck() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  // Check ETH balance before swap
  const ethBalanceBefore = await provider.getBalance(wallet.address);
  console.log(`\n💰 ETH Balance Before: ${ethers.formatEther(ethBalanceBefore)} ETH`);
  
  // Run the main swap function
  const swapSuccessful = await main();
  
  if (!swapSuccessful) {
    console.log("\n❌ Swap was not successful. Not checking token balance.");
    return;
  }
  
  // Wait a moment for blockchain to update
  console.log("\nWaiting for blockchain to update...");
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check ETH balance after swap
  const ethBalanceAfter = await provider.getBalance(wallet.address);
  console.log(`💰 ETH Balance After: ${ethers.formatEther(ethBalanceAfter)} ETH`);
  console.log(`💸 ETH Spent: ${ethers.formatEther(ethBalanceBefore - ethBalanceAfter)} ETH`);
  
  // Check if we received tokens
  const received = await checkTokenBalance(wallet, TOKEN_ADDRESS);
  if (received) {
    console.log("✅ Tokens successfully received!");
  } else {
    console.log("❌ No tokens received. The swap transaction may have succeeded but token transfer failed.");
    console.log("This can happen with tokens that have unusual transfer mechanisms or restrictions.");
  }
}

runWithBalanceCheck().catch(console.error);
