import { ethers } from "ethers";
import { config } from "../core/config";
import { baseProvider, httpProvider } from "../blockchain/providers";
import { routers, routerNames } from "../blockchain/contracts";
import { sendSwapExecutionMessage } from "./telegram";
import { ISwapResult } from "../core/types";
import { checkTokenInfo } from "./info";

// Complete Router ABI with swap functions
const routerAbi = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
  "function factory() external pure returns (address)"
];

const factoryABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

// Create wallet instance
const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!, baseProvider);

const aerodromeRouter = new ethers.Contract(config.AERODROME_ROUTER, routerAbi, wallet);
const uniswapRouter = new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbi, wallet);

const swapRouters = [aerodromeRouter, uniswapRouter];

export async function buyTokenWithETH(
  tokenAddress: string,
  ethAmount: number,
): Promise<ISwapResult | null> {
  try {
    if (!config.WALLET_PRIVATE_KEY) {
      console.error("❌ No wallet private key provided for auto swap");
      throw new Error("No wallet private key provided");
    }

    // path for the swap (ETH -> Token)
    const path = [config.WETH_ADDRESS, tokenAddress];
    const amountIn = ethers.parseEther(ethAmount.toString());

    let txResult: ISwapResult | null = null;

    for (let i = 0; i < swapRouters.length; i++) {
      const router = swapRouters[i];
      const routerName = routerNames[i];

      console.log(`\n🔄 Trying ${routerName} router...`);

      // check if pair exist in factory
      try {
        const factoryAddress = await router.factory();
        console.log(`${routerName} Factory address: ${factoryAddress}`);

        const factory = new ethers.Contract(factoryAddress, factoryABI, baseProvider);

        const pairAddress = await factory.getPair(config.WETH_ADDRESS, tokenAddress);

        if (pairAddress === ethers.ZeroAddress) {
          console.log(`❌ No liquidity pool exists for WETH and this token on ${routerName}`);
          continue;
        }

        console.log(`✅ Found liquidity pool at ${pairAddress} on ${routerName}`);
      } catch (error) {
        console.error(`Error checking liquidity pool on ${routerName}: ${error}`);
      }

      try {
        console.log(`Checking if there's liquidity for the pair WETH/${tokenAddress} on ${routerName}...`);

        let amounts;
        try {
          amounts = await router.getAmountsOut(amountIn, path)
          console.log(`✅ Liquidity found on ${routerName}! Expected output: ${ethers.formatUnits(amounts[1], 18)} tokens`);
        } catch (error) {
          console.log(`❌ No liquidity found on ${routerName}. Error ${error}`);
          continue;
        }

        const amountOutMin = amounts[1] * 95n / 100n;
        console.log(`Minimum output: ${ethers.formatUnits(amountOutMin, 18)} tokens`);

        const tokenContract = new ethers.Contract(
          tokenAddress,
          ["function name() view returns (string)", "function symbol() view returns (string)"],
          baseProvider
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
          const balance = await checkTokenInfo(tokenAddress);
          balance.balance = amounts[1].toString()
          txResult = {
            txHash: receipt.hash,
            tokenInfo: balance,
          };
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
            const balance = await checkTokenInfo(tokenAddress);
            balance.balance = amounts[1].toString()
            txResult = {
              txHash: receipt.hash,
              tokenInfo: balance,
            };
            break; // Exit the loop if successful
          } catch (feeError) {
            console.error(`❌ Fee-supporting swap also failed on ${routerName}: ${feeError}`);
            // Continue to next router
          }
        }
      } catch (error) {
        console.error(`Error during swap on ${routerName}:`, error);
      }
    }

    return txResult;
  } catch (error) {
    console.error("❌ Error executing swap:", error);
    throw error;
  }
}

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