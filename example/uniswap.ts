// src/index.ts

import {
  createPublicClient,
  webSocket,
  parseAbiItem,
  Log,
  Block,
  PublicClient,
  Address,
} from 'viem';
import { base } from 'viem/chains';
import 'dotenv/config';

const ALCHEMY_WS_URL = 'wss://base-mainnet.g.alchemy.com/v2/iKaulCLd22w9wFhfP07cwjzXIUgrdWC9';
const CONFIRMATION_BLOCKS = '10';

if (!ALCHEMY_WS_URL) {
  throw new Error('BASE_WSS_URL must be set in the .env file');
}

// Number of blocks to wait before considering an event "final"
const CONFIRMATIONS = parseInt(CONFIRMATION_BLOCKS || '10', 10);

// Uniswap contract addresses on Base Mainnet
const UNISWAP_V3_FACTORY_ADDRESS: Address = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';
const UNISWAP_V4_POOL_MANAGER_ADDRESS: Address = '0x000000000004444c5dc75cB358380D2e3dE08A90';

// Minimal ABIs for the specific events we are interested in
const uniswapV3FactoryAbi = [
  parseAbiItem(
    'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
  ),
];

const poolManagerAbi = [
  parseAbiItem(
    'event Initialize(bytes32 indexed poolId, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)'
  ),
  parseAbiItem(
    'event Swap(bytes32 indexed poolId, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)'
  ),
  parseAbiItem(
    'event ModifyLiquidity(bytes32 indexed poolId, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)'
  ),
  parseAbiItem(
    'event Donate(bytes32 indexed poolId, address indexed sender, uint256 amount0, uint256 amount1)'
  ),
];

// --- Types ---
// A type to hold a log and its block number for buffering
type BufferedLog = {
  log: Log;
  blockNumber: bigint;
};

// --- State Management ---
// Buffer to hold logs until they are confirmed
const logBuffer: BufferedLog[] = [];
let latestBlockNumber: bigint | null = null;

function createClient() {
  // Configure the WebSocket transport with keep-alive and auto-reconnect logic
  const transport = webSocket(ALCHEMY_WS_URL, {
    keepAlive: true,
    reconnect: {
      delay: 5000, // 5 seconds between reconnect attempts
      attempts: 10,
    },
    timeout: 60000, // 60 seconds
  });

  return createPublicClient({
    chain: base,
    transport,
  });
}

function processConfirmedLogs() {
  if (!latestBlockNumber) return;

  const confirmedLogs: BufferedLog[] = [];
  const remainingLogs: BufferedLog[] = [];

  // Partition the buffer into confirmed and still-pending logs
  for (const item of logBuffer) {
    const confirmations = latestBlockNumber - item.blockNumber;
    if (confirmations >= CONFIRMATIONS) {
      confirmedLogs.push(item);
    } else {
      remainingLogs.push(item);
    }
  }

  // If we have confirmed logs, process them and update the buffer
  if (confirmedLogs.length > 0) {
    logBuffer.length = 0; // Clear the buffer
    logBuffer.push(...remainingLogs); // Re-add the pending logs
    console.log(
      `Processing ${confirmedLogs.length} confirmed log(s). Buffer size: ${logBuffer.length}`
    );

    for (const { log } of confirmedLogs) {
      // Route the log to the correct processor based on the contract address
      if (log.address.toLowerCase() === UNISWAP_V3_FACTORY_ADDRESS.toLowerCase()) {
        processV3Log(log as any); // Cast to any to access decoded args
      } else if (log.address.toLowerCase() === UNISWAP_V4_POOL_MANAGER_ADDRESS.toLowerCase()) {
        // Route V4 events based on decoded event name (safer than topic matching)
        const decodedLog = log as any;
        if (decodedLog.eventName) {
          switch (decodedLog.eventName) {
            case 'Initialize':
              processV4Log(decodedLog);
              break;
            case 'Swap':
              processV4SwapLog(decodedLog);
              break;
            case 'ModifyLiquidity':
              processV4LiquidityLog(decodedLog);
              break;
            case 'Donate':
              processV4DonateLog(decodedLog);
              break;
            default:
              // Fallback to Initialize for unknown V4 events
              processV4Log(decodedLog);
              break;
          }
        } else {
          // Fallback if eventName is not available
          processV4Log(log as any);
        }
      }
    }
  }
}

function processV3Log(log: {
  args: { token0: Address; token1: Address; fee: number; pool: Address };
  transactionHash: string;
  blockNumber: bigint;
}) {
  const { token0, token1, fee, pool } = log.args;
  console.log(`
    ✅ [V3] New Pool Confirmed!
    -----------------------------------------
    TX Hash: ${log.transactionHash}
    Block: ${log.blockNumber}
    Pool Address: ${pool}
    Tokens: ${token0}, ${token1}
    Fee: ${fee}
    -----------------------------------------
  `);
  // TODO: Add logic to save to a database or send a notification
}

function processV4Log(log: {
  args: {
    poolId: string;
    currency0: Address;
    currency1: Address;
    fee: number;
    tickSpacing: number;
    hooks: Address;
    sqrtPriceX96: bigint;
    tick: number;
  };
  transactionHash: string;
  blockNumber: bigint;
}) {
  const { poolId, currency0, currency1, fee, tickSpacing, hooks, sqrtPriceX96, tick } = log.args;
  console.log(`
    ✅ [V4] New Pool Confirmed!
    -----------------------------------------
    TX Hash: ${log.transactionHash}
    Block: ${log.blockNumber}
    Pool ID: ${poolId}
    Currencies: ${currency0}, ${currency1}
    Fee: ${fee}
    Tick Spacing: ${tickSpacing}
    Hook Address: ${hooks}
    Initial Price: ${sqrtPriceX96.toString()}
    Initial Tick: ${tick}
    -----------------------------------------
  `);
  // TODO: Add logic to save to a database or send a notification
}

function processV4SwapLog(log: {
  args: {
    poolId: string;
    sender: Address;
    amount0: bigint;
    amount1: bigint;
    sqrtPriceX96: bigint;
    liquidity: bigint;
    tick: number;
    fee: number;
  };
  transactionHash: string;
  blockNumber: bigint;
}) {
  const { poolId, sender, amount0, amount1, sqrtPriceX96, liquidity, tick, fee } = log.args;
  console.log(`
    🔄 [V4] Pool Swap Confirmed!
    -----------------------------------------
    TX Hash: ${log.transactionHash}
    Block: ${log.blockNumber}
    Pool ID: ${poolId}
    Sender: ${sender}
    Amount0: ${amount0.toString()}
    Amount1: ${amount1.toString()}
    Price: ${sqrtPriceX96.toString()}
    Liquidity: ${liquidity.toString()}
    Tick: ${tick}
    Fee: ${fee}
    -----------------------------------------
  `);
  // TODO: Add logic to save to a database or send a notification
}

function processV4LiquidityLog(log: {
  args: {
    poolId: string;
    sender: Address;
    tickLower: number;
    tickUpper: number;
    liquidityDelta: bigint;
    salt: string;
  };
  transactionHash: string;
  blockNumber: bigint;
}) {
  const { poolId, sender, tickLower, tickUpper, liquidityDelta, salt } = log.args;
  const isAdd = liquidityDelta > 0n;
  console.log(`
    💧 [V4] Liquidity ${isAdd ? 'Added' : 'Removed'} Confirmed!
    -----------------------------------------
    TX Hash: ${log.transactionHash}
    Block: ${log.blockNumber}
    Pool ID: ${poolId}
    Sender: ${sender}
    Tick Range: ${tickLower} to ${tickUpper}
    Liquidity Delta: ${liquidityDelta.toString()}
    Salt: ${salt}
    -----------------------------------------
  `);
  // TODO: Add logic to save to a database or send a notification
}

function processV4DonateLog(log: {
  args: { poolId: string; sender: Address; amount0: bigint; amount1: bigint };
  transactionHash: string;
  blockNumber: bigint;
}) {
  const { poolId, sender, amount0, amount1 } = log.args;
  console.log(`
    🎁 [V4] Pool Donation Confirmed!
    -----------------------------------------
    TX Hash: ${log.transactionHash}
    Block: ${log.blockNumber}
    Pool ID: ${poolId}
    Sender: ${sender}
    Amount0: ${amount0.toString()}
    Amount1: ${amount1.toString()}
    -----------------------------------------
  `);
  // TODO: Add logic to save to a database or send a notification
}

async function main() {
  const client = createClient();
  console.log(`Service started. Waiting for ${CONFIRMATIONS} block confirmations.`);

  // 1. Watch for new blocks. This is our "heartbeat" that drives the confirmation logic.
  client.watchBlocks({
    onBlock: (block: Block) => {
      if (block.number) {
        latestBlockNumber = block.number;
        console.log(`📦 New Block: ${latestBlockNumber}`);
        processConfirmedLogs();
      }
    },
    onError: (error: any) => {
      console.error('Error watching blocks:', error);
    },
  });

  // 2. Watch for Uniswap V3 PoolCreated events and add them to the buffer.
  client.watchContractEvent({
    address: UNISWAP_V3_FACTORY_ADDRESS,
    abi: uniswapV3FactoryAbi,
    eventName: 'PoolCreated',
    onLogs: (logs: any[]) => {
      console.log(`[V3] Detected ${logs.length} unconfirmed PoolCreated event(s).`);
      for (const log of logs) {
        if (log.blockNumber) {
          logBuffer.push({ log, blockNumber: log.blockNumber });
        }
      }
    },
    onError: (error: any) => {
      console.error('Error in V3 event watcher:', error);
    },
  });

  // 3. Watch for Uniswap V4 Initialize events and add them to the buffer.
  client.watchContractEvent({
    address: UNISWAP_V4_POOL_MANAGER_ADDRESS,
    abi: poolManagerAbi,
    eventName: 'Initialize',
    onLogs: (logs: any[]) => {
      console.log(`[V4] Detected ${logs.length} unconfirmed Initialize event(s).`);
      for (const log of logs) {
        if (log.blockNumber) {
          logBuffer.push({ log, blockNumber: log.blockNumber });
        }
      }
    },
    onError: (error: any) => {
      console.error('Error in V4 Initialize event watcher:', error);
    },
  });

  // 4. Watch for Uniswap V4 Swap events and add them to the buffer.
  client.watchContractEvent({
    address: UNISWAP_V4_POOL_MANAGER_ADDRESS,
    abi: poolManagerAbi,
    eventName: 'Swap',
    onLogs: (logs: any[]) => {
      console.log(`[V4] Detected ${logs.length} unconfirmed Swap event(s).`);
      for (const log of logs) {
        if (log.blockNumber) {
          logBuffer.push({ log, blockNumber: log.blockNumber });
        }
      }
    },
    onError: (error: any) => {
      console.error('Error in V4 Swap event watcher:', error);
    },
  });

  // 5. Watch for Uniswap V4 ModifyLiquidity events and add them to the buffer.
  client.watchContractEvent({
    address: UNISWAP_V4_POOL_MANAGER_ADDRESS,
    abi: poolManagerAbi,
    eventName: 'ModifyLiquidity',
    onLogs: (logs: any[]) => {
      console.log(`[V4] Detected ${logs.length} unconfirmed ModifyLiquidity event(s).`);
      for (const log of logs) {
        if (log.blockNumber) {
          logBuffer.push({ log, blockNumber: log.blockNumber });
        }
      }
    },
    onError: (error: any) => {
      console.error('Error in V4 ModifyLiquidity event watcher:', error);
    },
  });

  // 6. Watch for Uniswap V4 Donate events and add them to the buffer.
  client.watchContractEvent({
    address: UNISWAP_V4_POOL_MANAGER_ADDRESS,
    abi: poolManagerAbi,
    eventName: 'Donate',
    onLogs: (logs: any[]) => {
      console.log(`[V4] Detected ${logs.length} unconfirmed Donate event(s).`);
      for (const log of logs) {
        if (log.blockNumber) {
          logBuffer.push({ log, blockNumber: log.blockNumber });
        }
      }
    },
    onError: (error: any) => {
      console.error('Error in V4 Donate event watcher:', error);
    },
  });
}

// Start the main application and catch any top-level errors.
main().catch(error => {
  console.error('Unhandled error in main function:', error);
  process.exit(1);
});
