import { ethers } from "ethers";
import { config } from "../core/config";
import { httpProvider } from "../blockchain/providers";
import { routers, routerNames } from "../blockchain/contracts";
import { sendSwapExecutionMessage } from "./telegram";

// Complete Router ABI with swap functions
const routerAbi = [
  // Swap functions
  {
    "inputs": [
      { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
      { "internalType": "address[]", "name": "path", "type": "address[]" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" }
    ],
    "name": "swapExactETHForTokens",
    "outputs": [{ "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
      { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
      { "internalType": "address[]", "name": "path", "type": "address[]" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" }
    ],
    "name": "swapExactTokensForETH",
    "outputs": [{ "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
      { "internalType": "uint256", "name": "amountOutMin", "type": "uint256" },
      { "internalType": "address[]", "name": "path", "type": "address[]" },
      { "internalType": "address", "name": "to", "type": "address" },
      { "internalType": "uint256", "name": "deadline", "type": "uint256" }
    ],
    "name": "swapExactTokensForTokens",
    "outputs": [{ "internalType": "uint256[]", "name": "amounts", "type": "uint256[]" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

/**
 * Execute a swap to buy a token with ETH
 * @param tokenAddress The address of the token to buy
 * @param ethAmount The amount of ETH to spend
 * @param routerIndex The index of the router to use (0 for Uniswap V2, 1 for Aerodrome)
 * @param slippagePercent The slippage tolerance percentage
 * @returns Transaction hash if successful
 */
export async function buyTokenWithETH(
  tokenAddress: string,
  ethAmount: number,
  routerIndex: number = 0,
  slippagePercent: number = 5
): Promise<string | null> {
  try {
    if (!config.WALLET_PRIVATE_KEY) {
      console.error("❌ No wallet private key provided for auto swap");
      return null;
    }

    // Create wallet instance
    const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY, httpProvider);
    const routerAddress = routerIndex === 0 ? config.UNISWAP_V2_ROUTER : config.AERODROME_ROUTER;
    const routerName = routerNames[routerIndex];
    
    // Create router contract instance with full ABI
    const router = new ethers.Contract(routerAddress, routerAbi, wallet);
    
    // Calculate deadline (30 minutes from now)
    const deadline = Math.floor(Date.now() / 1000) + 30 * 60;
    
    // Create path for the swap (ETH -> Token)
    const path = [config.WETH_ADDRESS, tokenAddress];
    
    // Convert ETH amount to wei
    const ethAmountWei = ethers.parseEther(ethAmount.toString());
    
    // Calculate minimum amount out with slippage
    // Note: In a real implementation, you would get a price quote first
    // This is a simplified version that assumes a 1:1 ratio minus slippage
    const amountOutMin = ethers.parseEther(ethAmount.toString()) * 
      BigInt(100 - slippagePercent) / 
      BigInt(100);
    
    console.log(`🔄 Executing swap: ${ethAmount} ETH for ${tokenAddress} on ${routerName}`);
    console.log(`💰 Wallet: ${wallet.address}`);
    
    // Execute the swap
    const tx = await router.swapExactETHForTokens(
      amountOutMin,
      path,
      wallet.address,
      deadline,
      { value: ethAmountWei, gasLimit: 300000 }
    );
    
    console.log(`⏳ Swap transaction submitted: ${tx.hash}`);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    console.log(`✅ Swap transaction confirmed: ${receipt.hash}`);
    
    // Send notification
    await sendSwapExecutionMessage({
      tokenAddress,
      ethAmount,
      routerName,
      txHash: receipt.hash,
      walletAddress: wallet.address
    });
    
    return receipt.hash;
  } catch (error) {
    console.error("❌ Error executing swap:", error);
    throw error;
  }
}

/**
 * Execute a swap to sell a token for ETH
 * @param tokenAddress The address of the token to sell
 * @param tokenAmount The amount of tokens to sell
 * @param routerIndex The index of the router to use (0 for Uniswap V2, 1 for Aerodrome)
 * @param slippagePercent The slippage tolerance percentage
 * @returns Transaction hash if successful
 */
export async function sellTokenForETH(
  tokenAddress: string,
  tokenAmount: string,
  routerIndex: number = 0,
  slippagePercent: number = 5
): Promise<string | null> {
  try {
    if (!config.WALLET_PRIVATE_KEY) {
      console.error("❌ No wallet private key provided for auto swap");
      return null;
    }

    // Create wallet instance
    const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY, httpProvider);
    const routerAddress = routerIndex === 0 ? config.UNISWAP_V2_ROUTER : config.AERODROME_ROUTER;
    const routerName = routerNames[routerIndex];
    
    // Create router contract instance with full ABI
    const router = new ethers.Contract(routerAddress, routerAbi, wallet);
    
    // Create ERC20 token contract instance
    const tokenContract = new ethers.Contract(
      tokenAddress,
      [
        "function approve(address spender, uint256 amount) returns (bool)",
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ],
      wallet
    );
    
    // Get token decimals
    const decimals = await tokenContract.decimals();
    
    // If tokenAmount is 'max', get the wallet's token balance
    let amount;
    if (tokenAmount.toLowerCase() === 'max') {
      amount = await tokenContract.balanceOf(wallet.address);
    } else {
      amount = ethers.parseUnits(tokenAmount, decimals);
    }
    
    // Calculate deadline (30 minutes from now)
    const deadline = Math.floor(Date.now() / 1000) + 30 * 60;
    
    // Create path for the swap (Token -> ETH)
    const path = [tokenAddress, config.WETH_ADDRESS];
    
    // Approve router to spend tokens
    console.log(`🔑 Approving ${routerName} to spend tokens...`);
    const approveTx = await tokenContract.approve(routerAddress, amount);
    await approveTx.wait();
    console.log(`✅ Approval confirmed: ${approveTx.hash}`);
    
    // Calculate minimum amount out with slippage
    // Note: In a real implementation, you would get a price quote first
    // This is a simplified version that assumes a minimal output
    const amountOutMin = ethers.parseEther("0");
    
    console.log(`🔄 Executing swap: ${tokenAmount} tokens for ETH on ${routerName}`);
    
    // Execute the swap
    const tx = await router.swapExactTokensForETH(
      amount,
      amountOutMin,
      path,
      wallet.address,
      deadline
    );
    
    console.log(`⏳ Swap transaction submitted: ${tx.hash}`);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    
    console.log(`✅ Swap transaction confirmed: ${receipt.hash}`);
    
    // Send notification
    await sendSwapExecutionMessage({
      tokenAddress,
      ethAmount: 0, // We don't know the exact ETH amount received
      routerName,
      txHash: receipt.hash,
      walletAddress: wallet.address,
      isSell: true
    });
    
    return receipt.hash;
  } catch (error) {
    console.error("❌ Error executing swap:", error);
    throw error;
  }
}