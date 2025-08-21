import { ethers } from 'ethers';
import { stateService } from '../../services/state';
import { telegramBot } from '../../telegram/telegram';
import { config } from '../../utils/config';
import { BaseProviders } from '../providers';

// Interface for wallet transaction data
interface WalletTransactionData {
  walletAddress: string;
  txHash: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  blockNumber: number;
  timestamp: number;
}

class WalletMonitoringService {
  private isMonitoring = false;
  private monitoredWallets = new Set<string>();
  private lastProcessedBlock = 0;

  constructor() {
    this.loadWalletAddresses();
  }

  private loadWalletAddresses(): void {
    const walletAddresses = stateService.get<string[]>('walletAddresses') || [];
    this.monitoredWallets.clear();
    walletAddresses.forEach(address => {
      this.monitoredWallets.add(address.toLowerCase());
    });
  }

  public addWalletAddress(address: string): boolean {
    // Validate Ethereum address
    if (!ethers.isAddress(address)) {
      return false;
    }

    const normalizedAddress = address.toLowerCase();

    // Check if already exists
    if (this.monitoredWallets.has(normalizedAddress)) {
      return false;
    }

    // Add to memory
    this.monitoredWallets.add(normalizedAddress);

    // Add to state and save
    const currentAddresses = stateService.get<string[]>('walletAddresses') || [];
    currentAddresses.push(address); // Keep original case for display
    stateService.set('walletAddresses', currentAddresses);

    return true;
  }

  public removeWalletAddress(address: string): boolean {
    const normalizedAddress = address.toLowerCase();

    if (!this.monitoredWallets.has(normalizedAddress)) {
      return false;
    }

    // Remove from memory
    this.monitoredWallets.delete(normalizedAddress);

    // Remove from state and save
    const currentAddresses = stateService.get<string[]>('walletAddresses') || [];
    const filteredAddresses = currentAddresses.filter(
      addr => addr.toLowerCase() !== normalizedAddress
    );
    stateService.set('walletAddresses', filteredAddresses);

    return true;
  }

  public getMonitoredWallets(): string[] {
    return stateService.get<string[]>('walletAddresses') || [];
  }

  public isWalletMonitored(address: string): boolean {
    return this.monitoredWallets.has(address.toLowerCase());
  }

  private async sendWalletAlert(data: WalletTransactionData): Promise<void> {
    const ethValue = parseFloat(ethers.formatEther(data.value));
    const gasCost = parseFloat(
      ethers.formatEther((BigInt(data.gasUsed) * BigInt(data.gasPrice)).toString())
    );

    const message =
      `🔍 *WALLET ACTIVITY DETECTED*\n\n` +
      `👤 Wallet: \`${data.walletAddress}\`\n` +
      `📤 From: \`${data.from}\`\n` +
      `📥 To: \`${data.to}\`\n` +
      `💰 Value: *${ethValue.toFixed(6)} ETH*\n` +
      `⛽ Gas Used: *${data.gasUsed}*\n` +
      `💸 Gas Cost: *${gasCost.toFixed(6)} ETH*\n` +
      `📦 Block: *${data.blockNumber}*\n` +
      `🔗 TX: [View on BaseScan](https://basescan.org/tx/${data.txHash})\n\n` +
      `⏰ Base Chain Transaction`;

    try {
      await telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      });
    } catch (error) {
      console.error('Error sending wallet alert:', error);
    }

    console.log(`💳 WALLET ACTIVITY: ${data.walletAddress} - ${ethValue.toFixed(6)} ETH`);
  }

  private async processTransaction(tx: ethers.TransactionResponse): Promise<void> {
    try {
      const receipt = await tx.wait();
      if (!receipt) return;

      const from = tx.from.toLowerCase();
      const to = tx.to?.toLowerCase() || '';
      if (
        from === '0xf886746ff689c8020aca226c7ebd19027c3be2ba' ||
        to === '0xf886746ff689c8020aca226c7ebd19027c3be2ba'
      ) {
        console.log("Skipping transaction involving Febry's Defi Bot address");
      }

      // Check if this transaction involves any monitored wallet
      const isFromMonitored = this.monitoredWallets.has(from);
      const isToMonitored = this.monitoredWallets.has(to);

      if (!isFromMonitored && !isToMonitored) {
        return;
      }

      // Get block timestamp
      const block = await BaseProviders.wsProvider.getBlock(receipt.blockNumber);
      if (!block) return;

      const walletAddress = isFromMonitored ? tx.from : tx.to!;

      const transactionData: WalletTransactionData = {
        walletAddress,
        txHash: tx.hash,
        from: tx.from,
        to: tx.to || '',
        value: tx.value.toString(),
        gasUsed: receipt.gasUsed.toString(),
        gasPrice: tx.gasPrice?.toString() || '0',
        blockNumber: receipt.blockNumber,
        timestamp: block.timestamp,
      };

      await this.sendWalletAlert(transactionData);
    } catch (error) {
      console.error('Error processing wallet transaction:', error);
    }
  }

  public startMonitoring(): void {
    if (this.isMonitoring) {
      return;
    }

    if (this.monitoredWallets.size === 0) {
      console.log('⚠️ No wallet addresses to monitor');
      return;
    }

    this.isMonitoring = true;
    console.log(`🔍 Started monitoring ${this.monitoredWallets.size} wallet addresses`);

    // Listen for new blocks and check transactions
    BaseProviders.wsProvider.on('block', async (blockNumber: number) => {
      try {
        if (blockNumber <= this.lastProcessedBlock) {
          return;
        }

        this.lastProcessedBlock = blockNumber;
        const block = await BaseProviders.wsProvider.getBlock(blockNumber, true);
        const test = await BaseProviders.wsProvider.getTransaction(
          '0x551c80b6a5bd526b35a348c8b550bebbc0e2ccf3094df9c2966f49797ea30cce'
        );
        console.log(
          `Transaction: ${test?.from} -> ${test?.to} || value: ${test?.value ? parseFloat(ethers.formatEther(test.value)).toFixed(6) + ' ETH' : '0 ETH'}`
        );

        if (!block || !block.transactions) {
          return;
        }

        // Process transactions in the block
        for (const tx of block.transactions) {
          if (typeof tx === 'string') {
            continue; // Skip if it's just a hash
          }
          await this.processTransaction(tx as ethers.TransactionResponse);
        }
      } catch (error) {
        console.error('Error processing block for wallet monitoring:', error);
      }
    });
  }

  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    BaseProviders.wsProvider.off('block');
    console.log('🛑 Stopped wallet monitoring');
  }

  public getMonitoringStatus(): boolean {
    return this.isMonitoring;
  }

  public getMonitoredWalletCount(): number {
    return this.monitoredWallets.size;
  }

  public reloadWallets(): void {
    this.loadWalletAddresses();
    console.log(`🔄 Reloaded wallet addresses: ${this.monitoredWallets.size} addresses`);
  }
}

export const walletMonitoringService = new WalletMonitoringService();
