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

// --- Configuration ---
// Ensure you have these variables in your .env file
// const { ALCHEMY_WS_URL, CONFIRMATION_BLOCKS } = process.env;
const ALCHEMY_WS_URL = 'wss://base-mainnet.g.alchemy.com/v2/iKaulCLd22w9wFhfP07cwjzXIUgrdWC9';
const CONFIRMATION_BLOCKS = '10';

if (!ALCHEMY_WS_URL) {
  throw new Error('BASE_WSS_URL must be set in the .env file');
}

// Number of blocks to wait before considering an event "final"
const CONFIRMATIONS = parseInt(CONFIRMATION_BLOCKS || '10', 10);

// Uniswap contract addresses on Base Mainnet
const UNISWAP_V3_FACTORY_ADDRESS: Address = '0x33128a8fC1786897dcE68Ed026d694621f6FDfD';
const UNISWAP_V4_POOL_MANAGER_ADDRESS: Address = '0x498581ff718922c3f8e6a244956af099b2652b2b';

// Minimal ABIs for the specific events we are interested in
const uniswapV3FactoryAbi = [
  parseAbiItem(
    'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
  ),
];

const poolManagerAbi = [
  parseAbiItem(
    'event Initialize(bytes32 indexed poolId, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks)'
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

// --- Core Logic ---

/**
 * Creates a robust, auto-reconnecting viem public client using WebSockets.
 * @returns A configured viem PublicClient instance.
 */
function createClient(): any {
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

/**
 * Processes logs from the buffer that have met the confirmation threshold.
 * This function is the core of the reorg-safety mechanism.
 */
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
        processV4Log(log as any); // Cast to any to access decoded args
      }
    }
  }
}

/**
 * Processes and displays information for a confirmed Uniswap v3 PoolCreated event.
 * @param log The confirmed event log, with decoded args.
 */
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

/**
 * Processes and displays information for a confirmed Uniswap v4 Initialize event.
 * @param log The confirmed event log, with decoded args.
 */
function processV4Log(log: {
  args: { poolId: string; currency0: Address; currency1: Address; fee: number; hooks: Address };
  transactionHash: string;
  blockNumber: bigint;
}) {
  const { poolId, currency0, currency1, fee, hooks } = log.args;
  console.log(`
    ✅ [V4] New Pool Confirmed!
    -----------------------------------------
    TX Hash: ${log.transactionHash}
    Block: ${log.blockNumber}
    Pool ID: ${poolId}
    Currencies: ${currency0}, ${currency1}
    Fee: ${fee}
    Hook Address: ${hooks}
    -----------------------------------------
  `);
  // TODO: Add logic to save to a database or send a notification
}

/**
 * Main application function to set up and start all listeners.
 */
async function main() {
  const client = createClient() as PublicClient;
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
      console.error('Error in V4 event watcher:', error);
    },
  });
}

// Start the main application and catch any top-level errors.
main().catch(error => {
  console.error('Unhandled error in main function:', error);
  process.exit(1);
});
