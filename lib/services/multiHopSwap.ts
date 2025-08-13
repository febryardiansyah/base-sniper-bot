import { ethers } from "ethers";
import { config } from "../core/config";
import { baseProvider } from "../blockchain/providers";
import { IMultiHopSwapConfig, IMultiHopSwapResult, ITokenInfo, IHopPath } from "../core/types";
import { checkTokenInfo } from "./info";
import { buyTokenWithUniversalRouter } from "./universalRouterSwap";
import universalRouterAbi from "../../abi/UniversalRouter.json";

// Common intermediate tokens on Base for routing
const COMMON_BASES = {
  WETH: config.WETH_ADDRESS,
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
  USDbC: "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA", // USD Base Coin
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", // DAI on Base
  CBETH: "0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22" // Coinbase Wrapped Staked ETH
};

// Router ABI for multi-hop swaps
const routerAbi = [
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
  "function factory() external pure returns (address)"
];

const factoryABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!, baseProvider);

/**
 * Find the best multi-hop path between two tokens
 * @param inputToken Input token address
 * @param outputToken Output token address
 * @param amountIn Amount of input tokens
 * @returns Best path configuration or null if no path found
 */
export async function findBestMultiHopPath(
  inputToken: string,
  outputToken: string,
  amountIn: string
): Promise<IHopPath[] | null> {
  try {
    console.log(`🔍 Finding best multi-hop path from ${inputToken} to ${outputToken}`);
    
    // Direct path (no intermediate hops)
    const directPath = await checkDirectPath(inputToken, outputToken, amountIn);
    if (directPath) {
      console.log(`✅ Direct path found with good liquidity`);
      return [{ tokenAddress: outputToken }];
    }

    // Try paths through common base tokens
    const bestPath = await findBestIntermediatePath(inputToken, outputToken, amountIn);
    
    if (bestPath) {
      console.log(`✅ Multi-hop path found: ${inputToken} -> ${bestPath.intermediate} -> ${outputToken}`);
      return [
        { tokenAddress: bestPath.intermediate },
        { tokenAddress: outputToken }
      ];
    }

    console.log(`❌ No viable path found`);
    return null;
  } catch (error) {
    console.error(`Error finding multi-hop path:`, error);
    return null;
  }
}

/**
 * Check if a direct path exists with sufficient liquidity
 */
async function checkDirectPath(
  tokenA: string,
  tokenB: string,
  amountIn: string
): Promise<boolean> {
  try {
    const routers = [
      new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbi, baseProvider),
      new ethers.Contract(config.AERODROME_ROUTER, routerAbi, baseProvider)
    ];

    for (const router of routers) {
      try {
        const path = [tokenA, tokenB];
        const amounts = await router.getAmountsOut(amountIn, path);
        
        // Check if we get reasonable output (not dust)
        if (amounts[1] > ethers.parseUnits("0.001", 18)) {
          return true;
        }
      } catch (error) {
        // Continue to next router if this one fails
        continue;
      }
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Find the best intermediate token for routing
 */
async function findBestIntermediatePath(
  inputToken: string,
  outputToken: string,
  amountIn: string
): Promise<{ intermediate: string; expectedOutput: bigint } | null> {
  const intermediates = Object.values(COMMON_BASES).filter(
    addr => addr !== inputToken && addr !== outputToken
  );

  let bestPath: { intermediate: string; expectedOutput: bigint } | null = null;
  let bestOutput = 0n;

  for (const intermediate of intermediates) {
    try {
      const output = await simulateMultiHopSwap(inputToken, intermediate, outputToken, amountIn);
      if (output && output > bestOutput) {
        bestOutput = output;
        bestPath = { intermediate, expectedOutput: output };
      }
    } catch (error) {
      // Continue to next intermediate
      continue;
    }
  }

  return bestPath;
}

/**
 * Simulate a multi-hop swap to get expected output
 */
async function simulateMultiHopSwap(
  inputToken: string,
  intermediateToken: string,
  outputToken: string,
  amountIn: string
): Promise<bigint | null> {
  try {
    const router = new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbi, baseProvider);
    
    // First hop: input -> intermediate
    const path1 = [inputToken, intermediateToken];
    const amounts1 = await router.getAmountsOut(amountIn, path1);
    
    // Second hop: intermediate -> output
    const path2 = [intermediateToken, outputToken];
    const amounts2 = await router.getAmountsOut(amounts1[1], path2);
    
    return amounts2[1];
  } catch (error) {
    return null;
  }
}

/**
 * Execute a multi-hop swap
 * @param swapConfig Multi-hop swap configuration
 * @returns Swap result with path information
 */
export async function executeMultiHopSwap(
  swapConfig: IMultiHopSwapConfig
): Promise<IMultiHopSwapResult | null> {
  try {
    console.log(`\n🔄 Executing multi-hop swap...`);
    console.log(`Input: ${swapConfig.inputToken}`);
    console.log(`Output: ${swapConfig.outputToken}`);
    console.log(`Amount: ${swapConfig.amountIn}`);
    console.log(`Path length: ${swapConfig.path.length}`);

    // Build full path array
    const fullPath = [swapConfig.inputToken, ...swapConfig.path.map(hop => hop.tokenAddress)];
    console.log(`Full path: ${fullPath.join(' -> ')}`);

    // Use Universal Router for multi-hop if available
    if (config.USE_UNIVERSAL_ROUTER && fullPath.length === 2) {
      // For 2-token paths, use existing Universal Router implementation
      const result = await buyTokenWithUniversalRouter(
        swapConfig.outputToken,
        parseFloat(ethers.formatEther(swapConfig.amountIn)),
        swapConfig.slippagePercent
      );
      
      if (result) {
        return {
          ...result,
          path: fullPath,
          intermediateAmounts: [swapConfig.amountIn],
          totalGasUsed: "0", // Will be filled by actual transaction
          effectivePrice: "0" // Will be calculated
        };
      }
    }

    // Fallback to legacy router for multi-hop
    return await executeMultiHopWithLegacyRouter(swapConfig, fullPath);
    
  } catch (error) {
    console.error(`Error executing multi-hop swap:`, error);
    return null;
  }
}

/**
 * Execute multi-hop swap using legacy routers
 */
async function executeMultiHopWithLegacyRouter(
  swapConfig: IMultiHopSwapConfig,
  fullPath: string[]
): Promise<IMultiHopSwapResult | null> {
  try {
    const router = new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbi, wallet);
    const deadline = swapConfig.deadline || Math.floor(Date.now() / 1000) + 60 * 20;
    
    let tx;
    
    // Check if input token is ETH (WETH)
    if (swapConfig.inputToken.toLowerCase() === config.WETH_ADDRESS.toLowerCase()) {
      // ETH -> Token(s) swap
      tx = await router.swapExactETHForTokens(
        swapConfig.amountOutMin,
        fullPath,
        wallet.address,
        deadline,
        {
          value: swapConfig.amountIn,
          gasLimit: 400000 // Higher gas limit for multi-hop
        }
      );
    } else {
      // Token -> Token(s) swap
      // First approve the router to spend input tokens
      const inputTokenContract = new ethers.Contract(
        swapConfig.inputToken,
        ["function approve(address spender, uint256 amount) external returns (bool)"],
        wallet
      );
      
      const approveTx = await inputTokenContract.approve(router.target, swapConfig.amountIn);
      await approveTx.wait();
      
      tx = await router.swapExactTokensForTokens(
        swapConfig.amountIn,
        swapConfig.amountOutMin,
        fullPath,
        wallet.address,
        deadline,
        { gasLimit: 400000 }
      );
    }

    console.log(`Transaction sent, waiting for confirmation...`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`✅ Multi-hop swap successful!`);
      console.log(`Transaction hash: ${receipt.hash}`);
      
      // Get token info for the output token
      const tokenInfo = await checkTokenInfo(swapConfig.outputToken);
      
      return {
        txHash: receipt.hash,
        tokenInfo: tokenInfo!,
        path: fullPath,
        intermediateAmounts: [], // Would need to parse logs to get actual amounts
        totalGasUsed: receipt.gasUsed.toString(),
        effectivePrice: "0" // Would need to calculate based on actual amounts
      };
    } else {
      throw new Error("Transaction failed");
    }
    
  } catch (error) {
    console.error(`Error in legacy multi-hop swap:`, error);
    return null;
  }
}

/**
 * Smart buy function that automatically finds and executes the best path
 * @param tokenAddress Target token to buy
 * @param ethAmount Amount of ETH to spend
 * @param slippagePercent Slippage tolerance
 * @returns Multi-hop swap result
 */
export async function smartBuyWithMultiHop(
  tokenAddress: string,
  ethAmount: number,
  slippagePercent: number = 5
): Promise<IMultiHopSwapResult | null> {
  try {
    console.log(`\n🧠 Smart multi-hop buy initiated...`);
    console.log(`Target token: ${tokenAddress}`);
    console.log(`ETH amount: ${ethAmount}`);
    
    const amountIn = ethers.parseEther(ethAmount.toString());
    
    // Find the best path
    const bestPath = await findBestMultiHopPath(
      config.WETH_ADDRESS,
      tokenAddress,
      amountIn.toString()
    );
    
    if (!bestPath) {
      console.log(`❌ No viable path found for ${tokenAddress}`);
      return null;
    }
    
    // Calculate minimum output with slippage
    const amountOutMin = 1n; // Minimum output to prevent MEV
    
    const swapConfig: IMultiHopSwapConfig = {
      inputToken: config.WETH_ADDRESS,
      outputToken: tokenAddress,
      path: bestPath,
      amountIn: amountIn.toString(),
      amountOutMin: amountOutMin.toString(),
      slippagePercent
    };
    
    return await executeMultiHopSwap(swapConfig);
    
  } catch (error) {
    console.error(`Error in smart multi-hop buy:`, error);
    return null;
  }
}

/**
 * Get quote for multi-hop swap
 * @param inputToken Input token address
 * @param outputToken Output token address
 * @param amountIn Input amount
 * @returns Expected output amount
 */
export async function getMultiHopQuote(
  inputToken: string,
  outputToken: string,
  amountIn: string
): Promise<{ outputAmount: string; path: string[] } | null> {
  try {
    const bestPath = await findBestMultiHopPath(inputToken, outputToken, amountIn);
    
    if (!bestPath) {
      return null;
    }
    
    const fullPath = [inputToken, ...bestPath.map(hop => hop.tokenAddress)];
    
    // Get quote using the path
    const router = new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbi, baseProvider);
    const amounts = await router.getAmountsOut(amountIn, fullPath);
    
    return {
      outputAmount: amounts[amounts.length - 1].toString(),
      path: fullPath
    };
    
  } catch (error) {
    console.error(`Error getting multi-hop quote:`, error);
    return null;
  }
}

/**
 * Check if multi-hop routing is beneficial compared to direct swap
 * @param inputToken Input token address
 * @param outputToken Output token address
 * @param amountIn Input amount
 * @returns True if multi-hop provides better output
 */
export async function isMultiHopBeneficial(
  inputToken: string,
  outputToken: string,
  amountIn: string
): Promise<boolean> {
  try {
    // Get direct swap quote
    const router = new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbi, baseProvider);
    let directOutput = 0n;
    
    try {
      const directAmounts = await router.getAmountsOut(amountIn, [inputToken, outputToken]);
      directOutput = directAmounts[1];
    } catch {
      // Direct swap not available
      directOutput = 0n;
    }
    
    // Get multi-hop quote
    const multiHopQuote = await getMultiHopQuote(inputToken, outputToken, amountIn);
    
    if (!multiHopQuote) {
      return false;
    }
    
    const multiHopOutput = BigInt(multiHopQuote.outputAmount);
    
    // Multi-hop is beneficial if it provides more output or if direct swap is not available
    return multiHopOutput > directOutput || directOutput === 0n;
    
  } catch (error) {
    console.error(`Error checking multi-hop benefit:`, error);
    return false;
  }
}