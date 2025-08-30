import { ethers } from 'ethers';
import axios from 'axios';
import { config } from '../utils/config';
import { BaseProviders } from '../contracts/providers';
import {
  IRelayQuoteResponse,
  IRelaySwapStatusResponse,
  ISwapResult,
} from '../interface/relay.interface';
import { checkUserTokenInfo } from './info.service';

// Constants
const RELAY_API_URL = 'https://api.relay.link';

// RelayService class encapsulating wallet and related methods
class RelayService {
  private wallet: ethers.Wallet;

  constructor() {
    if (!config.WALLET_PRIVATE_KEY) {
      throw new Error('WALLET_PRIVATE_KEY not configured');
    }
    this.wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY, BaseProviders.baseProvider);
  }

  getQuote = async ({
    originCurrency = config.ETH_ADDRESS,
    destinationCurrency,
    amount, // Amount in wei
    tradeType = 'EXACT_INPUT',
    slippageTolerance = '50',
  }: {
    originCurrency?: string;
    destinationCurrency: string;
    amount: string;
    tradeType?: string;
    slippageTolerance?: string;
  }): Promise<IRelayQuoteResponse> => {
    try {
      console.log(`🔍 Getting quote for swap on Base chain...`);

      const response = await axios.post(`${RELAY_API_URL}/quote`, {
        user: this.wallet.address,
        originChainId: 8453,
        destinationChainId: 8453,
        originCurrency,
        destinationCurrency,
        amount,
        tradeType,
        slippageTolerance,
      });

      console.log(`Quote response:`, response.data);
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
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { data?: unknown } };

      console.error(`Error getting quote: ${err?.message}`);
      if (err?.response) {
        console.error(`Response data: ${JSON.stringify(err.response.data)}`);
      }

      throw error as Error;
    }
  };

  executeSwap = async (
    quote: IRelayQuoteResponse
  ): Promise<{ requestId: string; txHash: string }> => {
    try {
      console.log(`🔄 Executing swap via Relay...`);
      const { details } = quote;

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

      if (!quote.steps || !Array.isArray(quote.steps) || quote.steps.length === 0) {
        throw new Error('No steps found in quote');
      }
      const step = quote.steps[0];
      console.log(`\n🔄 Processing step: ${step.id} - ${step.description}`);
      if (!step.items || !Array.isArray(step.items) || step.items.length === 0) {
        throw new Error('No items found in step');
      }

      const txData = step.items[0].data;
      if (!txData) {
        throw new Error('No transaction data found in step item');
      }
      console.log(`\n🔄 Sending transaction to execute swap...`);

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
        value: txData.value ? ethers.parseUnits(txData.value, 0) : ethers.parseEther('0'),
        chainId: txData.chainId,
      };

      if (txData.gasLimit) {
        tx.gasLimit = ethers.parseUnits(txData.gasLimit);
      }

      if (txData.maxFeePerGas) {
        tx.maxFeePerGas = txData.maxFeePerGas;
      }

      if (txData.maxPriorityFeePerGas) {
        tx.maxPriorityFeePerGas = txData.maxPriorityFeePerGas;
      }

      const balance = await this.wallet.provider?.getBalance(this.wallet.address);

      console.log(`Wallet balance: ${balance ? ethers.formatEther(balance) : '0'} ETH`);
      console.log(`Transaction value: ${ethers.formatEther(tx.value)} ETH`);
      console.log(`Transaction details:`);
      console.log(`- To: ${tx.to}`);
      console.log(`- Value: ${ethers.formatEther(tx.value)} ETH`);
      console.log(`- Data: ${tx.data.substring(0, 50)}...`);
      const txResponse = await this.wallet.sendTransaction(tx);
      console.log(`Transaction sent: ${txResponse.hash}`);
      console.log(`Waiting for transaction confirmation...`);
      const receipt = await txResponse.wait();
      console.log(`Transaction confirmed in block ${receipt?.blockNumber ?? 'unknown'}`);
      const requestId = step.requestId || `relay-${Date.now()}`;
      console.log(`\n✅ Swap execution complete!`);
      console.log(`- Request ID: ${requestId}`);
      console.log(`- Transaction Hash: ${txResponse.hash}`);

      return { requestId, txHash: txResponse.hash };
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(`Error executing swap: ${err?.message}`);
      throw error as Error;
    }
  };

  checkSwapStatus = async (requestId: string): Promise<IRelaySwapStatusResponse> => {
    try {
      console.log(`🔍 Checking status for request ID: ${requestId}...`);

      if (requestId.startsWith('relay-')) {
        console.log(`This is a local request ID, no status check needed`);
        return {
          status: 'success',
          message: 'Local swap completed successfully',
          timestamp: new Date().toISOString(),
        };
      }
      // prettier-ignore
      const response = await axios.get(`${RELAY_API_URL}/intents/status/v2?requestId=${requestId}`);
      console.log(`Status: ${response.data.status}`);

      return response.data;
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(`Error checking swap status: ${err?.message}`);
      throw error as Error;
    }
  };

  buyTokenWithRelayRouter = async (
    tokenAddress: string,
    ethAmount: number,
    slippagePercent: number = 5
  ): Promise<ISwapResult> => {
    try {
      if (!config.WALLET_PRIVATE_KEY) {
        console.error('❌ No wallet private key provided for relay swap');
        throw new Error('No wallet private key provided');
      }

      console.log(`🔄 Attempting to buy ${tokenAddress} with ${ethAmount} ETH via Relay router...`);
      const amountInWei = ethers.parseEther(ethAmount.toString()).toString();
      const slippageTolerance = (slippagePercent * 100).toString();
      const quote = await this.getQuote({
        originCurrency: config.ETH_ADDRESS,
        destinationCurrency: tokenAddress,
        amount: amountInWei,
        tradeType: 'EXACT_INPUT',
        slippageTolerance,
      });

      const { txHash } = await this.executeSwap(quote);
      const tokenInfo = await checkUserTokenInfo(tokenAddress);

      return { txHash, tokenInfo };
    } catch (error) {
      console.error('❌ Error executing relay swap:', error);
      throw error;
    }
  };

  sellTokenWithRelayRouter = async (
    tokenAddress: string,
    tokenAmount: string,
    slippagePercent: number = 5
  ): Promise<ISwapResult> => {
    try {
      if (!config.WALLET_PRIVATE_KEY) {
        console.error('❌ No wallet private key provided for relay swap');
        throw new Error('No wallet private key provided');
      }
      console.log(
        `🔄 Attempting to sell ${tokenAmount} of token ${tokenAddress} via Relay router...`
      );
      const tokenInfo = await checkUserTokenInfo(tokenAddress);
      let amount;
      if (tokenAmount.toLowerCase() === 'max') {
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

      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function approve(address spender, uint256 amount) returns (bool)'],
        this.wallet
      );
      const slippageTolerance = (slippagePercent * 100).toString();
      const quote = await this.getQuote({
        originCurrency: tokenAddress,
        destinationCurrency: config.ETH_ADDRESS,
        amount,
        tradeType: 'EXACT_INPUT',
        slippageTolerance,
      });

      const spender = quote.steps[0].items[0].data.to;
      console.log(`🔑 Approving ${spender} to spend ${tokenInfo.symbol}...`);
      const approveTx = await tokenContract.approve(spender, amount);
      await approveTx.wait();
      console.log(`✅ Approval confirmed: ${approveTx.hash}`);

      let { txHash } = await this.executeSwap(quote);
      if (quote.steps.length > 1) {
        const newQuote = await this.getQuote({
          originCurrency: tokenAddress,
          destinationCurrency: config.ETH_ADDRESS,
          amount,
          tradeType: 'EXACT_INPUT',
          slippageTolerance,
        });
        ({ txHash } = await this.executeSwap(newQuote));
      }

      const updatedTokenInfo = await checkUserTokenInfo(tokenAddress);
      return { txHash, tokenInfo: updatedTokenInfo };
    } catch (error) {
      console.error('❌ Error executing relay swap:', error);
      throw error;
    }
  };
}

// Export singleton instance and class (class export in case advanced usage needed)
export const relayService = new RelayService();
export { RelayService };
