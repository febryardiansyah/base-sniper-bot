import { ethers } from "ethers";
import { config } from "../core/config";
import { baseProvider } from "../blockchain/providers";
import { routerNames } from "../blockchain/contracts";
import { ISwapResult } from "../core/types";
import { checkUserTokenInfo } from "./info";

// Complete Router ABI with swap functions
const routerAbi = [
  // Buy functions (ETH -> Token)
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable",
  // Sell functions (Token -> ETH)
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external",
  // Utility functions
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
  "function factory() external pure returns (address)",
];

const factoryABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)",
];

// Create wallet instance
const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!, baseProvider);

const aerodromeRouter = new ethers.Contract(
  config.AERODROME_ROUTER,
  routerAbi,
  wallet
);
const uniswapRouter = new ethers.Contract(
  config.UNISWAP_V2_ROUTER,
  routerAbi,
  wallet
);

const swapRouters = [aerodromeRouter, uniswapRouter];

export async function buyTokenWithETH(
  tokenAddress: string,
  ethAmount: number
): Promise<ISwapResult | null> {
  try {
    if (!config.WALLET_PRIVATE_KEY) {
      console.error("❌ No wallet private key provided for auto swap");
      throw new Error("No wallet private key provided");
    }

    const amountIn = ethers.parseEther(ethAmount.toString());

    // Check if multi-hop routing would be beneficial
    console.log("🔍 Analyzing routing options...");

    // path for the swap (ETH -> Token)
    const path = [config.WETH_ADDRESS, tokenAddress];

    let txResult: ISwapResult | null = null;

    for (let i = 0; i < swapRouters.length; i++) {
      const router = swapRouters[i];
      const routerName = routerNames[i];

      console.log(`\n🔄 Trying ${routerName} router...`);

      // check if pair exist in factory
      try {
        const factoryAddress = await router.factory();
        console.log(`${routerName} Factory address: ${factoryAddress}`);

        const factory = new ethers.Contract(
          factoryAddress,
          factoryABI,
          baseProvider
        );

        const pairAddress = await factory.getPair(
          config.WETH_ADDRESS,
          tokenAddress
        );

        if (pairAddress === ethers.ZeroAddress) {
          console.log(
            `❌ No liquidity pool exists for WETH and this token on ${routerName}`
          );
          continue;
        }

        console.log(
          `✅ Found liquidity pool at ${pairAddress} on ${routerName}`
        );
      } catch (error) {
        console.error(
          `Error checking liquidity pool on ${routerName}: ${error}`
        );
      }

      try {
        console.log(
          `Checking if there's liquidity for the pair WETH/${tokenAddress} on ${routerName}...`
        );

        let amounts;
        try {
          amounts = await router.getAmountsOut(amountIn, path);
          console.log(
            `✅ Liquidity found on ${routerName}! Expected output: ${ethers.formatUnits(
              amounts[1],
              18
            )} tokens`
          );
        } catch (error) {
          console.log(`❌ No liquidity found on ${routerName}. Error ${error}`);
          continue;
        }

        const amountOutMin = (amounts[1] * 95n) / 100n;
        console.log(
          `Minimum output: ${ethers.formatUnits(amountOutMin, 18)} tokens`
        );

        const tokenInfo = await checkUserTokenInfo(tokenAddress);
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

          console.log(
            `Transaction sent on ${routerName}, waiting for confirmation...`
          );
          const receipt = await tx.wait();
          console.log(
            `✅ Swap complete on ${routerName}! Hash: ${receipt.hash}`
          );
          tokenInfo.balance = amounts[1].toString();
          txResult = {
            txHash: receipt.hash,
            tokenInfo: tokenInfo,
          };
          break; // Exit the loop if successful
        } catch (error) {
          console.log(
            `Regular swap failed on ${routerName}, trying with fee on transfer support...`
          );

          try {
            // If regular swap fails, try with fee on transfer support
            const tx =
              await router.swapExactETHForTokensSupportingFeeOnTransferTokens(
                0n, // Set to 0 for tokens with fees
                path,
                wallet.address,
                Math.floor(Date.now() / 1000) + 60 * 10,
                { value: amountIn, gasLimit: 500000 }
              );

            console.log(
              `Fee-supporting transaction sent on ${routerName}, waiting for confirmation...`
            );
            const receipt = await tx.wait();
            console.log(
              `✅ Fee-supporting swap complete on ${routerName}! Hash: ${receipt.hash}`
            );
            tokenInfo.balance = amounts[1].toString();
            txResult = {
              txHash: receipt.hash,
              tokenInfo: tokenInfo,
            };
            break; // Exit the loop if successful
          } catch (feeError) {
            console.error(
              `❌ Fee-supporting swap also failed on ${routerName}: ${feeError}`
            );
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
  slippagePercent: number = 5
): Promise<ISwapResult | null> {
  try {
    if (!config.WALLET_PRIVATE_KEY) {
      console.error("❌ No wallet private key provided for swap");
      throw new Error("No wallet private key provided");
    }

    // Create ERC20 token contract instance
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ["function approve(address spender, uint256 amount) returns (bool)"],
      wallet
    );

    // Get token decimals
    const tokenInfo = await checkUserTokenInfo(tokenAddress);

    // If tokenAmount is 'max', get the wallet's token balance
    let amount;
    if (tokenAmount.toLowerCase() === "max") {
      amount = tokenInfo.balance;
    } else {
      amount = ethers.parseUnits(tokenAmount, tokenInfo.decimals);
    }

    // Create path for the swap (Token -> ETH)
    const path = [tokenAddress, config.WETH_ADDRESS];

    let txResult: ISwapResult | null = null;

    // Try each router in sequence
    for (let i = 0; i < swapRouters.length; i++) {
      const router = swapRouters[i];
      const routerName = routerNames[i];

      console.log(`\n🔄 Trying ${routerName} router for selling tokens...`);

      // check if pair exist in factory
      try {
        const factoryAddress = await router.factory();
        console.log(`${routerName} Factory address: ${factoryAddress}`);

        const factory = new ethers.Contract(
          factoryAddress,
          factoryABI,
          baseProvider
        );

        const pairAddress = await factory.getPair(
          tokenAddress,
          config.WETH_ADDRESS
        );

        if (pairAddress === ethers.ZeroAddress) {
          console.log(
            `❌ No liquidity pool exists for this token and WETH on ${routerName}`
          );
          continue;
        }

        console.log(
          `✅ Found liquidity pool at ${pairAddress} on ${routerName}`
        );
      } catch (error) {
        console.error(
          `Error checking liquidity pool on ${routerName}: ${error}`
        );
        continue;
      }

      try {
        console.log(
          `Checking if there's liquidity for the pair ${tokenAddress}/WETH on ${routerName}...`
        );

        let amounts;
        try {
          amounts = await router.getAmountsOut(amount, path);
          console.log(
            `✅ Liquidity found on ${routerName}! Expected output: ${ethers.formatEther(
              amounts[1]
            )} ETH`
          );
        } catch (error) {
          console.log(
            `❌ No liquidity found on ${routerName}. Error: ${error}`
          );
          continue;
        }

        const amountOutMin =
          (amounts[1] * BigInt(100 - slippagePercent)) / 100n;
        console.log(`Minimum output: ${ethers.formatEther(amountOutMin)} ETH`);

        // Approve router to spend tokens
        console.log(`🔑 Approving ${routerName} to spend tokens...`);
        const approveTx = await tokenContract.approve(router.target, amount);
        await approveTx.wait();
        console.log(`✅ Approval confirmed: ${approveTx.hash}`);

        console.log(`Swapping on ${routerName}...`);
        const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 minutes

        // Try regular swap first
        try {
          const tx = await router.swapExactTokensForETH(
            amount,
            amountOutMin,
            path,
            wallet.address,
            deadline,
            { gasLimit: 300000 }
          );

          console.log(
            `Transaction sent on ${routerName}, waiting for confirmation...`
          );
          const receipt = await tx.wait();
          console.log(
            `✅ Swap complete on ${routerName}! Hash: ${receipt.hash}`
          );

          txResult = {
            txHash: receipt.hash,
            tokenInfo: tokenInfo,
          };

          // Send notification
          // await sendSwapExecutionMessage({
          //   tokenAddress,
          //   ethAmount: parseFloat(ethers.formatEther(amounts[1])),
          //   routerName,
          //   txHash: receipt.hash,
          //   walletAddress: wallet.address,
          //   isSell: true,
          // });

          break; // Exit the loop if successful
        } catch (error) {
          console.log(
            `Regular swap failed on ${routerName}, trying with fee on transfer support...`
          );

          try {
            // If regular swap fails, try with fee on transfer support
            const tx =
              await router.swapExactTokensForETHSupportingFeeOnTransferTokens(
                amount,
                0n, // Set to 0 for tokens with fees
                path,
                wallet.address,
                deadline,
                { gasLimit: 500000 }
              );

            console.log(
              `Fee-supporting transaction sent on ${routerName}, waiting for confirmation...`
            );
            const receipt = await tx.wait();
            console.log(
              `✅ Fee-supporting swap complete on ${routerName}! Hash: ${receipt.hash}`
            );

            txResult = {
              txHash: receipt.hash,
              tokenInfo: tokenInfo,
            };

            // Send notification
            // await sendSwapExecutionMessage({
            //   tokenAddress,
            //   ethAmount: parseFloat(ethers.formatEther(amounts[1])),
            //   routerName,
            //   txHash: receipt.hash,
            //   walletAddress: wallet.address,
            //   isSell: true,
            // });

            break; // Exit the loop if successful
          } catch (feeError) {
            console.error(
              `❌ Fee-supporting swap also failed on ${routerName}: ${feeError}`
            );
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
