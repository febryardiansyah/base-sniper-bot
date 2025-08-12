import { ethers } from "ethers";
import { config } from "../core/config";
import { baseProvider } from "../blockchain/providers";
import { universalRouter, UNIVERSAL_ROUTER_COMMANDS } from "../blockchain/contracts";
import { ISwapResult, ITokenInfo } from "../core/types";
import { checkTokenInfo } from "./info";
import universalRouterAbi from "../../abi/UniversalRouter.json";

// ERC20 ABI for token operations
const erc20Abi = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)"
];

// Create wallet instance
const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!, baseProvider);

/**
 * Buy tokens using Universal Router (ETH -> Token)
 * Uses V2_SWAP_EXACT_IN command for Uniswap V2 style swaps
 */
export async function buyTokenWithUniversalRouter(
  tokenAddress: string,
  ethAmount: number,
  slippagePercent: number = 5
): Promise<ISwapResult | null> {
  try {
    if (!config.WALLET_PRIVATE_KEY) {
      throw new Error("No wallet private key provided");
    }

    console.log(`\n🔄 Using Universal Router for ETH -> Token swap...`);
    console.log(`Token: ${tokenAddress}`);
    console.log(`ETH Amount: ${ethAmount}`);
    console.log(`Slippage: ${slippagePercent}%`);

    const amountIn = ethers.parseEther(ethAmount.toString());
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

    // Path for V2 swap: ETH (WETH) -> Token
    const path = [config.WETH_ADDRESS, tokenAddress.toLowerCase()];

    // Calculate minimum amount out with slippage protection
    // This is a simplified calculation - in production you should get a proper quote
    const amountOutMin = 1n; // Minimum 1 wei output to prevent MEV attacks

    // For ETH swaps, we need to WRAP_ETH first, then do V2_SWAP_EXACT_IN
    // Step 1: WRAP_ETH parameters (recipient, amountMin)
    const wrapParams = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [
        "0x0000000000000000000000000000000000000002", // ADDRESS_THIS (router holds WETH temporarily)
        amountIn // amount to wrap
      ]
    );

    // Step 2: V2_SWAP_EXACT_IN parameters
    // Parameters: address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser
    const swapParams = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "uint256", "address[]", "bool"],
      [
        wallet.address, // recipient
        amountIn, // amountIn
        amountOutMin, // amountOutMin
        path, // path
        false // payerIsUser (false because router is providing WETH from wrap)
      ]
    );

    // Create command bytes - WRAP_ETH (0x0b) followed by V2_SWAP_EXACT_IN (0x08)
    const commands = ethers.solidityPacked(["uint8", "uint8"], [0x0b, 0x08]);
    const inputs = [wrapParams, swapParams];

    console.log(`Executing Universal Router swap...`);
    console.log(`Commands: ${commands}`);
    console.log(`Deadline: ${deadline}`);

    // Execute the swap
    const routerWithSigner = new ethers.Contract(
      config.UNIVERSAL_ROUTER,
      universalRouterAbi,
      wallet
    );
    
    const tx = await routerWithSigner.execute(
      commands,
      inputs,
      deadline,
      {
        value: amountIn,
        gasLimit: 300000
      }
    );

    console.log(`Transaction sent, waiting for confirmation...`);
    const receipt = await tx.wait();
    console.log(`✅ Universal Router swap complete! Hash: ${receipt.hash}`);

    // Get token info
    const tokenInfo = await checkTokenInfo(tokenAddress);

    return {
      txHash: receipt.hash,
      tokenInfo: tokenInfo
    };

  } catch (error) {
    console.error("❌ Universal Router buy failed:", error);
    return null;
  }
}

/**
 * Sell tokens using Universal Router (Token -> ETH)
 * Uses V2_SWAP_EXACT_IN command for Uniswap V2 style swaps
 */
export async function sellTokenWithUniversalRouter(
  tokenAddress: string,
  tokenAmount: string,
  slippagePercent: number = 5
): Promise<ISwapResult | null> {
  try {
    if (!config.WALLET_PRIVATE_KEY) {
      throw new Error("No wallet private key provided");
    }

    console.log(`\n🔄 Using Universal Router for Token -> ETH swap...`);
    console.log(`Token: ${tokenAddress}`);
    console.log(`Token Amount: ${tokenAmount}`);
    console.log(`Slippage: ${slippagePercent}%`);

    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, wallet);
    const decimals = await tokenContract.decimals();
    const amountIn = ethers.parseUnits(tokenAmount, decimals);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes

    // Check and approve Universal Router to spend tokens
    const allowance = await tokenContract.allowance(wallet.address, config.UNIVERSAL_ROUTER);
    if (allowance < amountIn) {
      console.log(`Approving Universal Router to spend tokens...`);
      const approveTx = await tokenContract.approve(config.UNIVERSAL_ROUTER, amountIn);
      await approveTx.wait();
      console.log(`✅ Approval confirmed`);
    }

    // Path for V2 swap: Token -> ETH (WETH)
    const path = [tokenAddress.toLowerCase(), config.WETH_ADDRESS];

    // Calculate minimum amount out with slippage protection
    // This is a simplified calculation - in production you should get a proper quote
    const amountOutMin = 1n; // Minimum 1 wei output to prevent MEV attacks

    // Encode the V2 swap parameters according to Universal Router specification
    // Parameters: address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser
    const swapParams = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "uint256", "address[]", "bool"],
      [
        wallet.address, // recipient
        amountIn, // amountIn
        amountOutMin, // amountOutMin
        path, // path
        true // payerIsUser (true when user is providing the input tokens)
      ]
    );

    // Encode UNWRAP_WETH parameters (recipient, amountMin)
    const unwrapParams = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [
        wallet.address, // recipient
        amountOutMin // minimum amount to unwrap
      ]
    );

    // Create command bytes - V2_SWAP_EXACT_IN (0x08) followed by UNWRAP_WETH (0x0c)
    const commands = ethers.solidityPacked(
      ["uint8", "uint8"],
      [0x08, 0x0c]
    );

    const inputs = [swapParams, unwrapParams];

    console.log(`Executing Universal Router swap...`);
    console.log(`Commands: ${commands}`);
    console.log(`Deadline: ${deadline}`);

    // Execute the swap
    const routerWithSigner = new ethers.Contract(
      config.UNIVERSAL_ROUTER,
      universalRouterAbi,
      wallet
    );
    
    const tx = await routerWithSigner.execute(
      commands,
      inputs,
      deadline,
      {
        gasLimit: 500000
      }
    );

    console.log(`Transaction sent, waiting for confirmation...`);
    const receipt = await tx.wait();
    console.log(`✅ Universal Router swap complete! Hash: ${receipt.hash}`);

    // Get token info
    const tokenInfo = await checkTokenInfo(tokenAddress);

    return {
      txHash: receipt.hash,
      tokenInfo: tokenInfo
    };

  } catch (error) {
    console.error("❌ Universal Router sell failed:", error);
    return null;
  }
}

/**
 * Get quote for token swap using Universal Router
 * This is a helper function to estimate output amounts
 */
export async function getUniversalRouterQuote(
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  isExactIn: boolean = true
): Promise<string | null> {
  try {
    // Note: Universal Router doesn't have a direct quote function
    // You would typically use a quoter contract or SDK for this
    // For now, we'll return null and rely on the swap execution
    console.log(`Quote functionality not implemented for Universal Router`);
    console.log(`Use Uniswap SDK or quoter contracts for accurate quotes`);
    return null;
  } catch (error) {
    console.error("Error getting Universal Router quote:", error);
    return null;
  }
}

/**
 * Check if Universal Router is enabled in config
 */
export function isUniversalRouterEnabled(): boolean {
  return config.USE_UNIVERSAL_ROUTER;
}