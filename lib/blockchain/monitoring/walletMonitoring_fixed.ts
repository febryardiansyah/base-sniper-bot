import {
  ethers,
  getAddress,
  formatEther,
  formatUnits,
  id,
  zeroPadValue,
  Interface,
  Log,
  TransactionResponse,
} from 'ethers';
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
  private eventListeners = new Map<string, () => void>();

  // ERC-20 Transfer event interface
  private erc20Iface = new Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
  ]);

  // ERC-1155 Transfer event interface
  private erc1155Iface = new Interface([
    'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
    'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
  ]);

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

  private async handleNativeEthTransfer(blockNumber: number): Promise<void> {
    try {
      const block = await BaseProviders.wsProvider.getBlock(blockNumber, true);
      if (!block || !block.transactions) return;

      for (const txData of block.transactions) {
        if (typeof txData === 'string') continue;

        const tx = txData as TransactionResponse;
        const from = tx.from && getAddress(tx.from);
        const to = tx.to ? getAddress(tx.to) : null;

        // Check if transaction involves any monitored wallet
        const fromMonitored = from && this.monitoredWallets.has(from.toLowerCase());
        const toMonitored = to && this.monitoredWallets.has(to.toLowerCase());

        if ((fromMonitored || toMonitored) && tx.value && tx.value > 0n) {
          // Skip if it's the bot's own address
          if (
            from?.toLowerCase() === '0xf886746ff689c8020aca226c7ebd19027c3be2ba' ||
            to?.toLowerCase() === '0xf886746ff689c8020aca226c7ebd19027c3be2ba'
          ) {
            continue;
          }

          const receipt = await tx.wait();
          if (!receipt) continue;

          const transactionData: WalletTransactionData = {
            walletAddress: fromMonitored ? from! : to!,
            txHash: tx.hash,
            from: from!,
            to: to ?? 'contract-creation',
            value: tx.value.toString(),
            gasUsed: receipt.gasUsed.toString(),
            gasPrice: tx.gasPrice?.toString() || '0',
            blockNumber: receipt.blockNumber,
            timestamp: Date.now(),
          };

          await this.sendWalletAlert(transactionData);
        }
      }
    } catch (error) {
      console.error('Error processing ETH transfers:', error);
    }
  }

  private async handleErc20Transfer(log: Log, dir: 'IN' | 'OUT'): Promise<void> {
    try {
      const parsed = this.erc20Iface.parseLog(log);
      if (!parsed) return;

      const from = getAddress(parsed.args.from);
      const to = getAddress(parsed.args.to);
      const raw = parsed.args.value as bigint;

      // Skip if it's the bot's own address
      if (
        from.toLowerCase() === '0xf886746ff689c8020aca226c7ebd19027c3be2ba' ||
        to.toLowerCase() === '0xf886746ff689c8020aca226c7ebd19027c3be2ba'
      ) {
        return;
      }

      // Try to get token metadata
      let symbol = 'TOKEN';
      let decimals = 18;
      try {
        const decData = await BaseProviders.wsProvider.call({
          to: log.address,
          data: this.erc20Iface.encodeFunctionData('decimals'),
        });
        decimals = Number(this.erc20Iface.decodeFunctionResult('decimals', decData)[0]);

        const symData = await BaseProviders.wsProvider.call({
          to: log.address,
          data: this.erc20Iface.encodeFunctionData('symbol'),
        });
        symbol = String(this.erc20Iface.decodeFunctionResult('symbol', symData)[0]);
      } catch {
        // Failed to get metadata, keep defaults
      }

      const walletAddress = dir === 'OUT' ? from : to;
      const tokenAmount = formatUnits(raw, decimals);

      const message =
        `🪙 *TOKEN TRANSFER DETECTED*\n\n` +
        `👤 Wallet: \`${walletAddress}\`\n` +
        `📤 From: \`${from}\`\n` +
        `📥 To: \`${to}\`\n` +
        `💰 Amount: *${tokenAmount} ${symbol}*\n` +
        `🏷️ Token: \`${log.address}\`\n` +
        `🔗 TX: [View on BaseScan](https://basescan.org/tx/${log.transactionHash})\n\n` +
        `⏰ ERC-20 Transfer`;

      try {
        await telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        });
      } catch (error) {
        console.error('Error sending token transfer alert:', error);
      }

      console.log(`🪙 TOKEN ${dir}: ${walletAddress} - ${tokenAmount} ${symbol}`);
    } catch (error) {
      console.error('Error processing ERC-20 transfer:', error);
    }
  }

  private async handleErc1155Transfer(log: Log, dir: 'IN' | 'OUT'): Promise<void> {
    try {
      const parsed = this.erc1155Iface.parseLog(log);
      if (!parsed) {
        console.warn('Failed to parse ERC1155 log');
        return;
      }

      const from = getAddress(parsed.args.from);
      const to = getAddress(parsed.args.to);

      // Skip if it's the bot's own address
      if (
        from.toLowerCase() === '0xf886746ff689c8020aca226c7ebd19027c3be2ba' ||
        to.toLowerCase() === '0xf886746ff689c8020aca226c7ebd19027c3be2ba'
      ) {
        return;
      }

      const walletAddress = dir === 'OUT' ? from : to;

      if (parsed.name === 'TransferSingle') {
        const id = (parsed.args.id as bigint).toString();
        const value = (parsed.args.value as bigint).toString();

        const message =
          `🎨 *ERC1155 SINGLE TRANSFER DETECTED*\n\n` +
          `👤 Wallet: \`${walletAddress}\`\n` +
          `📤 From: \`${from}\`\n` +
          `📥 To: \`${to}\`\n` +
          `🆔 Token ID: *${id}*\n` +
          `💰 Amount: *${value}*\n` +
          `🏷️ Token: \`${log.address}\`\n` +
          `🔗 TX: [View on BaseScan](https://basescan.org/tx/${log.transactionHash})\n\n` +
          `⏰ ERC-1155 Single Transfer`;

        try {
          await telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          });
        } catch (error) {
          console.error('Error sending ERC1155 single transfer alert:', error);
        }

        console.log(`🎨 ERC1155 ${dir} Single: ${walletAddress} - ID:${id} x${value}`);
      } else if (parsed.name === 'TransferBatch') {
        const ids = (parsed.args.ids as readonly bigint[]).map(x => x.toString());
        const values = Array.isArray(parsed.args.values)
          ? (parsed.args.values as unknown as readonly bigint[]).map(x => x.toString())
          : [];

        const message =
          `🎨 *ERC1155 BATCH TRANSFER DETECTED*\n\n` +
          `👤 Wallet: \`${walletAddress}\`\n` +
          `📤 From: \`${from}\`\n` +
          `📥 To: \`${to}\`\n` +
          `🆔 Token IDs: *${ids.join(', ')}*\n` +
          `💰 Amounts: *${values.join(', ')}*\n` +
          `🏷️ Token: \`${log.address}\`\n` +
          `🔗 TX: [View on BaseScan](https://basescan.org/tx/${log.transactionHash})\n\n` +
          `⏰ ERC-1155 Batch Transfer`;

        try {
          await telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          });
        } catch (error) {
          console.error('Error sending ERC1155 batch transfer alert:', error);
        }

        console.log(
          `🎨 ERC1155 ${dir} Batch: ${walletAddress} - IDs:${ids.join(',')} x:${values.join(',')}`
        );
      }
    } catch (error) {
      console.error('Error processing ERC-1155 transfer:', error);
    }
  }

  private setupEventListeners(): void {
    // Clear existing listeners
    this.clearEventListeners();

    const transferTopic = id('Transfer(address,address,uint256)');
    const transferSingleTopic = id('TransferSingle(address,address,address,uint256,uint256)');
    const transferBatchTopic = id('TransferBatch(address,address,address,uint256[],uint256[])');

    // Setup filters for each monitored wallet
    this.monitoredWallets.forEach(walletAddress => {
      const checksummedAddress = getAddress(walletAddress);
      const addrTopic = zeroPadValue(checksummedAddress, 32);

      // ERC-20 Transfer events where wallet is sender
      const transferFromFilter = { topics: [transferTopic, addrTopic] };
      const fromListener = (log: Log) => this.handleErc20Transfer(log, 'OUT');
      BaseProviders.wsProvider.on(transferFromFilter, fromListener);
      this.eventListeners.set(`transfer_from_${walletAddress}`, () => {
        BaseProviders.wsProvider.off(transferFromFilter, fromListener);
      });

      // ERC-20 Transfer events where wallet is receiver
      const transferToFilter = { topics: [transferTopic, null, addrTopic] };
      const toListener = (log: Log) => this.handleErc20Transfer(log, 'IN');
      BaseProviders.wsProvider.on(transferToFilter, toListener);
      this.eventListeners.set(`transfer_to_${walletAddress}`, () => {
        BaseProviders.wsProvider.off(transferToFilter, toListener);
      });

      // ERC-1155 TransferSingle events where wallet is sender
      const erc1155FromSingle = { topics: [transferSingleTopic, null, addrTopic] };
      const singleFromListener = (log: Log) => this.handleErc1155Transfer(log, 'OUT');
      BaseProviders.wsProvider.on(erc1155FromSingle, singleFromListener);
      this.eventListeners.set(`erc1155_single_from_${walletAddress}`, () => {
        BaseProviders.wsProvider.off(erc1155FromSingle, singleFromListener);
      });

      // ERC-1155 TransferSingle events where wallet is receiver
      const erc1155ToSingle = { topics: [transferSingleTopic, null, null, addrTopic] };
      const singleToListener = (log: Log) => this.handleErc1155Transfer(log, 'IN');
      BaseProviders.wsProvider.on(erc1155ToSingle, singleToListener);
      this.eventListeners.set(`erc1155_single_to_${walletAddress}`, () => {
        BaseProviders.wsProvider.off(erc1155ToSingle, singleToListener);
      });

      // ERC-1155 TransferBatch events where wallet is sender
      const erc1155FromBatch = { topics: [transferBatchTopic, null, addrTopic] };
      const batchFromListener = (log: Log) => this.handleErc1155Transfer(log, 'OUT');
      BaseProviders.wsProvider.on(erc1155FromBatch, batchFromListener);
      this.eventListeners.set(`erc1155_batch_from_${walletAddress}`, () => {
        BaseProviders.wsProvider.off(erc1155FromBatch, batchFromListener);
      });

      // ERC-1155 TransferBatch events where wallet is receiver
      const erc1155ToBatch = { topics: [transferBatchTopic, null, null, addrTopic] };
      const batchToListener = (log: Log) => this.handleErc1155Transfer(log, 'IN');
      BaseProviders.wsProvider.on(erc1155ToBatch, batchToListener);
      this.eventListeners.set(`erc1155_batch_to_${walletAddress}`, () => {
        BaseProviders.wsProvider.off(erc1155ToBatch, batchToListener);
      });
    });

    // Native ETH transfer monitoring
    const blockListener = (blockNumber: number) => this.handleNativeEthTransfer(blockNumber);
    BaseProviders.wsProvider.on('block', blockListener);
    this.eventListeners.set('eth_blocks', () => {
      BaseProviders.wsProvider.off('block', blockListener);
    });
  }

  private clearEventListeners(): void {
    this.eventListeners.forEach(removeListener => {
      try {
        removeListener();
      } catch (error) {
        console.error('Error removing event listener:', error);
      }
    });
    this.eventListeners.clear();
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

    // Setup event listeners for efficient monitoring
    this.setupEventListeners();

    // Error handling
    BaseProviders.wsProvider.on('error', e => {
      console.error('Wallet monitoring provider error:', e);
    });
  }

  public stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    this.clearEventListeners();
    console.log('🛑 Stopped wallet monitoring');
  }

  public getMonitoringStatus(): boolean {
    return this.isMonitoring;
  }

  public getMonitoredWalletCount(): number {
    return this.monitoredWallets.size;
  }

  public reloadWallets(): void {
    const wasMonitoring = this.isMonitoring;

    if (wasMonitoring) {
      this.stopMonitoring();
    }

    this.loadWalletAddresses();
    console.log(`🔄 Reloaded wallet addresses: ${this.monitoredWallets.size} addresses`);

    if (wasMonitoring) {
      this.startMonitoring();
    }
  }
}

export const walletMonitoringService = new WalletMonitoringService();
