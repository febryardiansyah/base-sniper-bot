// watch-base.ts
import 'dotenv/config';
import {
  Interface,
  Log,
  TransactionResponse,
  WebSocketProvider,
  formatEther,
  formatUnits,
  getAddress,
  id,
  zeroPadValue,
} from 'ethers';

const WS_URL = 'wss://base-mainnet.g.alchemy.com/v2/iKaulCLd22w9wFhfP07cwjzXIUgrdWC9';
const RAW_ADDR = '0xf886746FF689c8020ACA226c7eBD19027C3BE2Ba';
const CHAIN_ID = Number(process.env.CHAIN_ID || 8453); // 8453 = Base mainnet, 84532 = Base Sepolia

if (!WS_URL || !RAW_ADDR) {
  console.error('Missing WS_URL or WATCH in .env');
  process.exit(1);
}

const WATCH = getAddress(RAW_ADDR); // checksummed
const provider = new WebSocketProvider(WS_URL, { name: 'base', chainId: CHAIN_ID });

// ------------ Native ETH transfers (in new blocks) ------------
provider.on('block', async (blockNumber: number) => {
  try {
    const block = await provider.getBlock(blockNumber, true); // include tx objects
    if (!block || !block.transactions) return;

    for (const txData of block.transactions) {
      // Ensure tx is a transaction object, not a string
      if (typeof txData === 'string') continue;

      const tx = txData as TransactionResponse;
      const from = tx.from && getAddress(tx.from);
      const to = tx.to ? getAddress(tx.to) : null;

      const involves = (from && from === WATCH) || (to && to === WATCH);

      if (involves && tx.value && tx.value > 0n) {
        const dir = to === WATCH ? 'IN' : 'OUT';
        const message = `[ETH ${dir}] ${formatEther(tx.value)} ETH  from:${from}  to:${to ?? 'contract-creation'}  hash:${tx.hash}`;
        console.log(message);
      }
    }
  } catch (err) {
    console.error('Block handler error:', err);
  }
});

// ------------ ERC-20 & ERC-721 Transfer events ------------
const transferTopic = id('Transfer(address,address,uint256)');
const addrTopic = zeroPadValue(WATCH, 32);

// OR logic needs two filters: (from==WATCH) OR (to==WATCH)
const transferFromFilter = { topics: [transferTopic, addrTopic] };
const transferToFilter = { topics: [transferTopic, null, addrTopic] };

// Minimal ABI for symbol/decimals; will harmlessly fail on NFTs
const erc20Iface = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
]);

async function handleErc20Or721(log: Log, dir: 'IN' | 'OUT') {
  try {
    const parsed = erc20Iface.parseLog(log);
    if (!parsed) {
      console.warn('Failed to parse Transfer log');
      return;
    }

    const from = getAddress(parsed.args.from);
    const to = getAddress(parsed.args.to);
    const raw = parsed.args.value as bigint;

    // Try to detect ERC-20 metadata; if it fails, treat as NFT-ish
    let symbol = 'TOKEN';
    let decimals = 18;
    try {
      const decData = await provider.call({
        to: log.address,
        data: erc20Iface.encodeFunctionData('decimals'),
      });
      decimals = Number(erc20Iface.decodeFunctionResult('decimals', decData)[0]);

      const symData = await provider.call({
        to: log.address,
        data: erc20Iface.encodeFunctionData('symbol'),
      });
      symbol = String(erc20Iface.decodeFunctionResult('symbol', symData)[0]);
      const message = `[ERC20 ${dir}] ${formatUnits(raw, decimals)} ${symbol}  from:${from}  to:${to}  token:${log.address}  tx:${log.transactionHash}`;
      console.log(message);
    } catch {
      // Likely ERC-721 (or non‑standard)
      console.log(
        `[ERC721? ${dir}] tokenId:${raw.toString()}  from:${from}  to:${to}  token:${log.address}  tx:${log.transactionHash}`
      );
    }
  } catch (e) {
    // Non‑standard log that matched the topic somehow
    console.warn('Transfer log parse failed:', e);
  }
}

provider.on(transferFromFilter, log => handleErc20Or721(log, 'OUT'));
provider.on(transferToFilter, log => handleErc20Or721(log, 'IN'));

// ------------ ERC-1155 (TransferSingle & TransferBatch) ------------
const erc1155Iface = new Interface([
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  'event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)',
]);

const transferSingleTopic = id('TransferSingle(address,address,address,uint256,uint256)');
const transferBatchTopic = id('TransferBatch(address,address,address,uint256[],uint256[])');

// from==WATCH
const erc1155FromSingle = { topics: [transferSingleTopic, null, addrTopic] };
const erc1155FromBatch = { topics: [transferBatchTopic, null, addrTopic] };
// to==WATCH
const erc1155ToSingle = { topics: [transferSingleTopic, null, null, addrTopic] };
const erc1155ToBatch = { topics: [transferBatchTopic, null, null, addrTopic] };

async function handle1155(log: Log, dir: 'IN' | 'OUT') {
  try {
    const parsed = erc1155Iface.parseLog(log);
    if (!parsed) {
      console.warn('Failed to parse ERC1155 log');
      return;
    }

    const from = getAddress(parsed.args.from);
    const to = getAddress(parsed.args.to);

    if (parsed.name === 'TransferSingle') {
      const id = (parsed.args.id as bigint).toString();
      const value = (parsed.args.value as bigint).toString();
      const message = `[ERC1155 ${dir} Single] id:${id} x${value}  from:${from}  to:${to}  token:${log.address}  tx:${log.transactionHash}`;
      console.log(message);
    } else if (parsed.name === 'TransferBatch') {
      const ids = (parsed.args.ids as readonly bigint[]).map(x => x.toString());
      //   const values = (parsed.args.values as readonly bigint[]).map(x => x.toString());
      const message = `[ERC1155 ${dir} Batch] ids:${ids.join(',')}  from:${from}  to:${to}  token:${log.address}  tx:${log.transactionHash}`;
      console.log(message);
    }
  } catch (e) {
    console.warn('ERC1155 log parse failed:', e);
  }
}

provider.on(erc1155FromSingle, log => handle1155(log, 'OUT'));
provider.on(erc1155FromBatch, log => handle1155(log, 'OUT'));
provider.on(erc1155ToSingle, log => handle1155(log, 'IN'));
provider.on(erc1155ToBatch, log => handle1155(log, 'IN'));

// ------------ lifecycle ------------
provider.on('error', e => console.error('Provider error:', e));
process.on('SIGINT', async () => {
  try {
    await provider.destroy?.();
  } finally {
    process.exit(0);
  }
});
