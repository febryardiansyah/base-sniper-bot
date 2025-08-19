import { ethers } from "ethers";
import axios from "axios";
import { config } from "../core/config";
import { BaseProviders } from "../blockchain/providers";
import {
  IRelayQuoteResponse,
  IRelaySwapStatusResponse,
  ISwapResult,
} from "../core/types";
import { checkUserTokenInfo } from "./info";

// Constants
const RELAY_API_URL = "https://api.relay.link";

// Create wallet instance
const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!, BaseProviders.baseProvider);

async function getQuote({
  originCurrency = config.ETH_ADDRESS,
  destinationCurrency,
  amount, // Amount in wei
  tradeType = "EXACT_INPUT", // EXACT_INPUT, EXACT_OUTPUT, or EXPECTED_OUTPUT
  slippageTolerance = "50", // 0.5% slippage by default
}: {
  originCurrency?: string;
  destinationCurrency: string;
  amount: string;
  tradeType?: string;
  slippageTolerance?: string;
}): Promise<IRelayQuoteResponse> {
  try {
    console.log(`🔍 Getting quote for swap on Base chain...`);

    // For ETH swaps, use zero address
    // if (originCurrency.toLowerCase() === WETH.toLowerCase()) {
    //   originCurrency = "0x0000000000000000000000000000000000000000";
    // }

    const response = await axios.post(`${RELAY_API_URL}/quote`, {
      user: wallet.address,
      originChainId: 8453, // Base chain
      destinationChainId: 8453, // Same chain for swapping on Base
      originCurrency,
      destinationCurrency,
      amount,
      tradeType,
      slippageTolerance,
    });

    console.log(`Quote response:`, response.data);

    // Log the quote details
    console.log(`Quote received:`);
    console.log(
      `- Input: ${ethers.formatUnits(
        response.data.details.currencyIn.amount,
        response.data.details.currencyIn.currency.decimals
      )} ${response.data.details.currencyIn.currency.symbol}`
    );
    console.log(
      `- Output: ${ethers.formatUnits(
        response.data.details.currencyOut.amount,
        response.data.details.currencyOut.currency.decimals
      )} ${response.data.details.currencyOut.currency.symbol}`
    );
    console.log(`- Rate: ${response.data.details.rate}`);
    console.log(`- Impact: ${response.data.details.totalImpact.percent}%`);

    return response.data;
  } catch (error: any) {
    console.error(`Error getting quote: ${error.message}`);
    if (error.response) {
      console.error(`Response data: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

async function executeSwap(
  quote: IRelayQuoteResponse
): Promise<{ requestId: string; txHash: string }> {
  try {
    console.log(`🔄 Executing swap via Relay...`);

    // Extract necessary details from the quote
    const { details } = quote;

    // Log the details we would use for a real swap
    console.log(`Swap details:`);
    console.log(
      `- From: ${details.currencyIn.currency.symbol} (${details.currencyIn.currency.address}) on chain ${details.currencyIn.currency.chainId}`
    );
    console.log(
      `- To: ${details.currencyOut.currency.symbol} (${details.currencyOut.currency.address}) on chain ${details.currencyOut.currency.chainId}`
    );
    console.log(
      `- Amount: ${ethers.formatUnits(
        details.currencyIn.amount,
        details.currencyIn.currency.decimals
      )} ${details.currencyIn.currency.symbol}`
    );
    console.log(
      `- Expected output: ${ethers.formatUnits(
        details.currencyOut.amount,
        details.currencyOut.currency.decimals
      )} ${details.currencyOut.currency.symbol}`
    );
    console.log(`- Rate: ${details.rate}`);

    // Check if we have steps in the quote
    if (
      !quote.steps ||
      !Array.isArray(quote.steps) ||
      quote.steps.length === 0
    ) {
      throw new Error("No steps found in quote");
    }

    // Get the first step from the quote
    const step = quote.steps[0];
    console.log(`\n🔄 Processing step: ${step.id} - ${step.description}`);

    // Check if we have items in the step
    if (!step.items || !Array.isArray(step.items) || step.items.length === 0) {
      throw new Error("No items found in step");
    }

    // Get the transaction data from the first item
    const txData = step.items[0].data;
    if (!txData) {
      throw new Error("No transaction data found in step item");
    }

    console.log(`\n🔄 Sending transaction to execute swap...`);

    // Create transaction object
    const tx: {
      to: string;
      data: string;
      value: ethers.BigNumberish;
      chainId: number;
      gasLimit?: ethers.BigNumberish;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
    } = {
      to: txData.to,
      data: txData.data,
      value: txData.value
        ? ethers.parseUnits(txData.value, 0)
        : ethers.parseEther("0"),
      chainId: txData.chainId,
    };

    // Add gas parameters if available
    if (txData.gasLimit) {
      tx.gasLimit = ethers.parseUnits(txData.gasLimit);
    }
    if (txData.maxFeePerGas) {
      tx.maxFeePerGas = txData.maxFeePerGas;
    }
    if (txData.maxPriorityFeePerGas) {
      tx.maxPriorityFeePerGas = txData.maxPriorityFeePerGas;
    }

    // Check wallet balance
    const balance = await wallet.provider?.getBalance(wallet.address);
    console.log(
      `Wallet balance: ${balance ? ethers.formatEther(balance) : "0"} ETH`
    );
    console.log(`Transaction value: ${ethers.formatEther(tx.value)} ETH`);

    // Convert to BigNumber objects for comparison
    // if (
    //   balance &&
    //   ethers.getBigInt(balance.toString()).toString() <
    //     ethers.getBigInt(tx.value.toString()).toString()
    // ) {
    //   throw new Error(
    //     `Insufficient funds: Wallet has ${ethers.formatEther(
    //       balance
    //     )} ETH but transaction requires ${ethers.formatEther(tx.value)} ETH`
    //   );
    // }

    // Log transaction details
    console.log(`Transaction details:`);
    console.log(`- To: ${tx.to}`);
    console.log(`- Value: ${ethers.formatEther(tx.value)} ETH`);
    console.log(`- Data: ${tx.data.substring(0, 50)}...`);

    // Send the transaction
    const txResponse = await wallet.sendTransaction(tx);
    console.log(`Transaction sent: ${txResponse.hash}`);

    // Wait for transaction to be mined
    console.log(`Waiting for transaction confirmation...`);
    const receipt = await txResponse.wait();
    console.log(
      `Transaction confirmed in block ${receipt?.blockNumber ?? "unknown"}`
    );

    // Get the request ID from the step or generate one if not available
    const requestId = step.requestId || `relay-${Date.now()}`;

    console.log(`\n✅ Swap execution complete!`);
    console.log(`- Request ID: ${requestId}`);
    console.log(`- Transaction Hash: ${txResponse.hash}`);

    return {
      requestId: requestId,
      txHash: txResponse.hash,
    };
  } catch (error: any) {
    console.error(`Error executing swap: ${error.message}`);
    throw error;
  }
}

async function checkSwapStatus(
  requestId: string
): Promise<IRelaySwapStatusResponse> {
  try {
    console.log(`🔍 Checking status for request ID: ${requestId}...`);

    // Check if this is a mock request ID (starts with 'relay-')
    if (requestId.startsWith("relay-")) {
      console.log(`This is a local request ID, no status check needed`);
      return {
        status: "success",
        message: "Local swap completed successfully",
        timestamp: new Date().toISOString(),
      };
    }

    // Call the Relay API to check the status for real request IDs
    const response = await axios.get(
      `${RELAY_API_URL}/intents/status/v2?requestId=${requestId}`
    );

    // Log the status
    console.log(`Status: ${response.data.status}`);

    return response.data;
  } catch (error: any) {
    console.error(`Error checking swap status: ${error.message}`);
    throw error;
  }
}

export async function buyTokenWithRelayRouter(
  tokenAddress: string,
  ethAmount: number,
  slippagePercent: number = 5
): Promise<ISwapResult | null> {
  try {
    if (!config.WALLET_PRIVATE_KEY) {
      console.error("❌ No wallet private key provided for relay swap");
      throw new Error("No wallet private key provided");
    }

    console.log(
      `🔄 Attempting to buy ${tokenAddress} with ${ethAmount} ETH via Relay router...`
    );

    // Convert ETH amount to wei
    const amountInWei = ethers.parseEther(ethAmount.toString()).toString();

    // Set slippage tolerance (convert from percentage to basis points)
    const slippageTolerance = (slippagePercent * 100).toString();

    // Get quote from Relay API
    const quote = await getQuote({
      originCurrency: config.ETH_ADDRESS,
      destinationCurrency: tokenAddress,
      amount: amountInWei,
      tradeType: "EXACT_INPUT",
      slippageTolerance,
    });

    // Execute the swap
    const { txHash } = await executeSwap(quote);

    // Get token info after swap
    const tokenInfo = await checkUserTokenInfo(tokenAddress);

    return {
      txHash,
      tokenInfo,
    };
  } catch (error: any) {
    console.error("❌ Error executing relay swap:", error);
    return null;
  }
}

export async function sellTokenWithRelayRouter(
  tokenAddress: string,
  tokenAmount: string,
  slippagePercent: number = 5
): Promise<ISwapResult | null> {
  try {
    if (!config.WALLET_PRIVATE_KEY) {
      console.error("❌ No wallet private key provided for relay swap");
      throw new Error("No wallet private key provided");
    }

    console.log(
      `🔄 Attempting to sell ${tokenAmount} of token ${tokenAddress} via Relay router...`
    );

    // Get token info
    const tokenInfo = await checkUserTokenInfo(tokenAddress);

    // If tokenAmount is 'max', get the wallet's token balance
    let amount;
    if (tokenAmount.toLowerCase() === "max") {
      amount = tokenInfo.balance.toString();
      console.log(
        `Using max token balance: ${ethers.formatUnits(
          amount,
          tokenInfo.decimals
        )} ${tokenInfo.symbol}`
      );
    } else {
      amount = ethers.parseUnits(tokenAmount, tokenInfo.decimals).toString();
    }

    // Create ERC20 token contract instance for approval
    const tokenContract = new ethers.Contract(
      tokenAddress,
      ["function approve(address spender, uint256 amount) returns (bool)"],
      wallet
    );

    // Set slippage tolerance (convert from percentage to basis points)
    const slippageTolerance = (slippagePercent * 100).toString();

    const quote = await getQuote({
      originCurrency: tokenAddress,
      destinationCurrency: config.ETH_ADDRESS,
      amount,
      tradeType: "EXACT_INPUT",
      slippageTolerance,
    });

    // Check if we need to approve the token spend
    const spender = quote.steps[0].items[0].data.to;
    console.log(`🔑 Approving ${spender} to spend ${tokenInfo.symbol}...`);

    // Approve token spend
    const approveTx = await tokenContract.approve(spender, amount);
    await approveTx.wait();
    console.log(`✅ Approval confirmed: ${approveTx.hash}`);

    // Execute the swap
    let { txHash } = await executeSwap(quote);

    if (quote.steps.length > 1) {
      const newQuote = await getQuote({
        originCurrency: tokenAddress,
        destinationCurrency: config.ETH_ADDRESS,
        amount,
        tradeType: "EXACT_INPUT",
        slippageTolerance,
      });

      ({ txHash } = await executeSwap(newQuote));
    }

    // Get updated token info after swap
    const updatedTokenInfo = await checkUserTokenInfo(tokenAddress);

    return {
      txHash,
      tokenInfo: updatedTokenInfo,
    };
  } catch (error: any) {
    console.error("❌ Error executing relay swap:", error);
    return null;
  }
}

// Export functions
export { getQuote, executeSwap, checkSwapStatus };
