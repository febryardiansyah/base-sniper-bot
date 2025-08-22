import {
  ethers,
  formatUnits,
  getAddress,
  id,
  Interface,
  Log,
  TransactionResponse,
  zeroPadValue,
} from 'ethers';
import { WalletTransactionData } from '../../interface/wallet.interface';
import { stateService } from '../../services/state';
import { telegramBot } from '../../telegram/telegram';
import { config } from '../../utils/config';
import { BaseProviders } from '../providers';

class WalletMonitoringService {
  private isMonitoring = false;
  private monitoredWallets = new Set<string>();
  private eventListeners = new Map<string, () => void>();
  private processedTx = new Set<string>();
  private tokenMetaCache = new Map<string, { symbol: string; decimals: number }>();

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
    console.log(`🔄 Loaded ${walletAddresses.length} wallet addresses from state`);
    this.monitoredWallets.clear();
    walletAddresses.forEach(address => {
      this.monitoredWallets.add(address.toLowerCase());
    });
  }

  public addWalletAddress(address: string): boolean {
    if (!ethers.isAddress(address)) return false;
    const normalizedAddress = address.toLowerCase();
    if (this.monitoredWallets.has(normalizedAddress)) return false;
    this.monitoredWallets.add(normalizedAddress);
    const currentAddresses = stateService.get<string[]>('walletAddresses') || [];
    currentAddresses.push(address);
    stateService.set('walletAddresses', currentAddresses);
    if (this.isMonitoring) {
      // Add listeners only for the new address without restarting
      this.addListenersForWallet(normalizedAddress);
    }
    return true;
  }

  public removeWalletAddress(address: string): boolean {
    const normalized = address.toLowerCase();
    if (!this.monitoredWallets.has(normalized)) return false;
    this.monitoredWallets.delete(normalized);
    const currentAddresses = stateService.get<string[]>('walletAddresses') || [];
    stateService.set(
      'walletAddresses',
      currentAddresses.filter(a => a.toLowerCase() !== normalized)
    );
    // Remove related listeners
    this.removeListenersForWallet(normalized);
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
        const fromMonitored = from && this.monitoredWallets.has(from.toLowerCase());
        const toMonitored = to && this.monitoredWallets.has(to.toLowerCase());
        if ((fromMonitored || toMonitored) && tx.value && tx.value > 0n) {
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

  // Unified ERC-20 / ERC-721 handler
  private async handleErc20Or721(log: Log, dir: 'IN' | 'OUT'): Promise<void> {
    try {
      const parsed = this.erc20Iface.parseLog(log);
      if (!parsed) return;
      const from = getAddress(parsed.args.from);
      const to = getAddress(parsed.args.to);
      const raw = parsed.args.value as bigint; // amount or tokenId
      let isErc20 = true;
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
        isErc20 = false; // treat as ERC-721 (or non-standard)
      }
      const walletAddress = dir === 'OUT' ? from : to;
      if (isErc20) {
        // Aggregate full swap for this transaction instead of per-transfer message
        await this.processSwapSummary(log.transactionHash);
      } else {
        const tokenId = raw.toString();
        const message =
          `🖼️ *NFT TRANSFER DETECTED*\n\n` +
          `👤 Wallet: \`${walletAddress}\`\n` +
          `📤 From: \`${from}\`\n` +
          `📥 To: \`${to}\`\n` +
          `🆔 Token ID: *${tokenId}*\n` +
          `🏷️ Contract: \`${log.address}\`\n` +
          `🔗 TX: [View on BaseScan](https://basescan.org/tx/${log.transactionHash})\n\n` +
          `⏰ ERC-721 Transfer`;
        try {
          await telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          });
        } catch (error) {
          console.error('Error sending ERC-721 transfer alert:', error);
        }
        console.log(`🖼️ ERC721 ${dir}: ${walletAddress} - tokenId ${tokenId}`);
      }
    } catch (error) {
      console.error('Error processing ERC-20/721 transfer:', error);
    }
  }

  private async getTokenMeta(address: string): Promise<{ symbol: string; decimals: number }> {
    const lower = address.toLowerCase();
    if (this.tokenMetaCache.has(lower)) return this.tokenMetaCache.get(lower)!;
    let symbol = 'TOKEN';
    let decimals = 18;
    try {
      const decData = await BaseProviders.wsProvider.call({
        to: address,
        data: this.erc20Iface.encodeFunctionData('decimals'),
      });
      decimals = Number(this.erc20Iface.decodeFunctionResult('decimals', decData)[0]);
      const symData = await BaseProviders.wsProvider.call({
        to: address,
        data: this.erc20Iface.encodeFunctionData('symbol'),
      });
      symbol = String(this.erc20Iface.decodeFunctionResult('symbol', symData)[0]);
    } catch {
      // ignore
    }
    this.tokenMetaCache.set(lower, { symbol, decimals });
    return { symbol, decimals };
  }

  private async processSwapSummary(txHash: string): Promise<void> {
    if (this.processedTx.has(txHash)) return;
    this.processedTx.add(txHash);
    try {
      const receipt = await BaseProviders.wsProvider.getTransactionReceipt(txHash);
      if (!receipt) return;
      const tx = await BaseProviders.wsProvider.getTransaction(txHash);
      const transferEvent = this.erc20Iface.getEvent('Transfer');
      if (!transferEvent) return; // safety
      const transferTopic = transferEvent.topicHash;
      interface TokenMove {
        token: string;
        amount: string;
        symbol: string;
        raw: bigint;
        direction: 'OUT' | 'IN';
      }
      const walletMoves: Record<string, TokenMove[]> = {};
      const ensure = (w: string) => (walletMoves[w] = walletMoves[w] || []);

      // ERC20 transfers
      for (const log of receipt.logs) {
        if (log.topics[0] !== transferTopic || log.topics.length < 3) continue;
        try {
          const parsed = this.erc20Iface.parseLog(log);
          if (!parsed) continue;
          const from = getAddress(parsed.args.from);
          const to = getAddress(parsed.args.to);
          const rawAmount = parsed.args.value as bigint;
          const fromLower = from.toLowerCase();
          const toLower = to.toLowerCase();
          const involvesFrom = this.monitoredWallets.has(fromLower);
          const involvesTo = this.monitoredWallets.has(toLower);
          if (!involvesFrom && !involvesTo) continue;
          const { symbol, decimals } = await this.getTokenMeta(log.address);
          const amountStr = formatUnits(rawAmount, decimals);
          if (involvesFrom)
            ensure(fromLower).push({
              token: log.address,
              amount: amountStr,
              symbol,
              raw: rawAmount,
              direction: 'OUT',
            });
          if (involvesTo)
            ensure(toLower).push({
              token: log.address,
              amount: amountStr,
              symbol,
              raw: rawAmount,
              direction: 'IN',
            });
        } catch {
          continue;
        }
      }

      // Native ETH (only top-level value, not internal traces)
      if (tx && tx.value && tx.value > 0n) {
        const from = tx.from && getAddress(tx.from);
        const to = tx.to ? getAddress(tx.to) : undefined;
        if (from && this.monitoredWallets.has(from.toLowerCase())) {
          ensure(from.toLowerCase()).push({
            token: 'ETH',
            amount: ethers.formatEther(tx.value),
            symbol: 'ETH',
            raw: tx.value,
            direction: 'OUT',
          });
        }
        if (to && this.monitoredWallets.has(to.toLowerCase())) {
          ensure(to.toLowerCase()).push({
            token: 'ETH',
            amount: ethers.formatEther(tx.value),
            symbol: 'ETH',
            raw: tx.value,
            direction: 'IN',
          });
        }
      }

      // Build and send messages
      for (const [walletLower, moves] of Object.entries(walletMoves)) {
        if (moves.length === 0) continue;
        const outs = moves.filter(m => m.direction === 'OUT');
        const ins = moves.filter(m => m.direction === 'IN');
        if (outs.length === 0 && ins.length === 0) continue;
        const walletChecksum = getAddress(walletLower);

        const fmt = (m: TokenMove) =>
          `${m.direction === 'OUT' ? '-' : '+'} ${Number(m.amount).toPrecision(4)} ${m.symbol}`;
        const outsLine = outs.map(fmt).join('\n');
        const insLine = ins.map(fmt).join('\n');

        let headline: string;
        if (outs.length === 1 && ins.length === 1) {
          headline = `(-) ${outs[0].amount} ${outs[0].symbol} for (+) ${ins[0].amount} ${ins[0].symbol}`;
        } else {
          headline = 'Swap Activity';
        }

        const message =
          `🔄 *SWAP DETECTED*\n\n` +
          `👤 Wallet: \`${walletChecksum}\` [View](https://debank.com/profile/${walletChecksum})\n\n` +
          `📝 TX: [View](https://basescan.org/tx/${txHash})\n\n` +
          // `💱 ${headline}\n\n` +
          (outs.length > 0 ? `🔻 *Out*:\n${outs[0].amount} ${outs[0].symbol}\n\n` : '') +
          (ins.length > 0 ? `🔺 *In*:\n${ins[0].amount} ${ins[0].symbol}\n\n` : '') +
          `⏰ Aggregated ERC-20${tx && tx.value && tx.value > 0n ? ' / ETH' : ''} Movements`;

        try {
          await telegramBot.sendMessage(config.TELEGRAM_CHAT_ID, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
          });
        } catch (e) {
          console.error('Error sending swap summary:', e);
        }
        console.log(`� Swap summary sent for wallet ${walletChecksum} tx ${txHash}`);
      }
    } catch (e) {
      console.error('processSwapSummary error', e);
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
      // (Removed internal bot address skip)
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

  private addListenersForWallet(walletLower: string) {
    const transferTopic = id('Transfer(address,address,uint256)');
    const transferSingleTopic = id('TransferSingle(address,address,address,uint256,uint256)');
    const transferBatchTopic = id('TransferBatch(address,address,address,uint256[],uint256[])');
    try {
      const addrTopic = zeroPadValue(getAddress(walletLower), 32);
      // ERC20/721 OUT
      const transferFromFilter = { topics: [transferTopic, addrTopic] };
      const fromListener = (log: Log) => this.handleErc20Or721(log, 'OUT');
      BaseProviders.wsProvider.on(transferFromFilter, fromListener);
      this.eventListeners.set(`transfer_from_${walletLower}`, () => {
        BaseProviders.wsProvider.off(transferFromFilter, fromListener);
      });
      // ERC20/721 IN
      const transferToFilter = { topics: [transferTopic, null, addrTopic] };
      const toListener = (log: Log) => this.handleErc20Or721(log, 'IN');
      BaseProviders.wsProvider.on(transferToFilter, toListener);
      this.eventListeners.set(`transfer_to_${walletLower}`, () => {
        BaseProviders.wsProvider.off(transferToFilter, toListener);
      });
      // 1155 single OUT
      const erc1155FromSingle = { topics: [transferSingleTopic, null, addrTopic] };
      const singleFromListener = (log: Log) => this.handleErc1155Transfer(log, 'OUT');
      BaseProviders.wsProvider.on(erc1155FromSingle, singleFromListener);
      this.eventListeners.set(`erc1155_single_from_${walletLower}`, () => {
        BaseProviders.wsProvider.off(erc1155FromSingle, singleFromListener);
      });
      // 1155 single IN
      const erc1155ToSingle = { topics: [transferSingleTopic, null, null, addrTopic] };
      const singleToListener = (log: Log) => this.handleErc1155Transfer(log, 'IN');
      BaseProviders.wsProvider.on(erc1155ToSingle, singleToListener);
      this.eventListeners.set(`erc1155_single_to_${walletLower}`, () => {
        BaseProviders.wsProvider.off(erc1155ToSingle, singleToListener);
      });
      // 1155 batch OUT
      const erc1155FromBatch = { topics: [transferBatchTopic, null, addrTopic] };
      const batchFromListener = (log: Log) => this.handleErc1155Transfer(log, 'OUT');
      BaseProviders.wsProvider.on(erc1155FromBatch, batchFromListener);
      this.eventListeners.set(`erc1155_batch_from_${walletLower}`, () => {
        BaseProviders.wsProvider.off(erc1155FromBatch, batchFromListener);
      });
      // 1155 batch IN
      const erc1155ToBatch = { topics: [transferBatchTopic, null, null, addrTopic] };
      const batchToListener = (log: Log) => this.handleErc1155Transfer(log, 'IN');
      BaseProviders.wsProvider.on(erc1155ToBatch, batchToListener);
      this.eventListeners.set(`erc1155_batch_to_${walletLower}`, () => {
        BaseProviders.wsProvider.off(erc1155ToBatch, batchToListener);
      });
    } catch (e) {
      console.error('Failed to add listeners for wallet', walletLower, e);
    }
  }

  private removeListenersForWallet(walletLower: string) {
    const keys = Array.from(this.eventListeners.keys()).filter(k => k.endsWith(`_${walletLower}`));
    keys.forEach(k => {
      try {
        const remover = this.eventListeners.get(k);
        remover && remover();
        this.eventListeners.delete(k);
      } catch (e) {
        console.error('Failed removing listener', k, e);
      }
    });
  }

  private setupEventListeners(): void {
    this.clearEventListeners();
    // Register listeners for each monitored wallet
    this.monitoredWallets.forEach(walletLower => this.addListenersForWallet(walletLower));
    // Native ETH transfer
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
    if (this.isMonitoring) return;
    if (this.monitoredWallets.size === 0) {
      console.log('⚠️ No wallet addresses to monitor');
      return;
    }
    this.isMonitoring = true;
    console.log(`🔍 Started monitoring ${this.monitoredWallets.size} wallet addresses`);
    this.setupEventListeners();
    BaseProviders.wsProvider.on('error', e => {
      console.error('Wallet monitoring provider error:', e);
    });
  }

  public stopMonitoring(): void {
    if (!this.isMonitoring) return;
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
    if (wasMonitoring) this.stopMonitoring();
    this.loadWalletAddresses();
    console.log(`🔄 Reloaded wallet addresses: ${this.monitoredWallets.size} addresses`);
    if (wasMonitoring) this.startMonitoring();
  }
}

export const walletMonitoringService = new WalletMonitoringService();
