import { Connection, PublicKey, Logs } from '@solana/web3.js';

// Ganti ke provider yang mendukung WSS:
const conn = new Connection(
  'https://mainnet.helius-rpc.com/?api-key=759c85d0-89c6-4d47-9905-23a982ff877c',
  {
    commitment: 'confirmed',
    wsEndpoint: 'wss://mainnet.helius-rpc.com/?api-key=759c85d0-89c6-4d47-9905-23a982ff877c',
  }
);

// Program IDs
const PUMP_FUN = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'); // Pump.fun :contentReference[oaicite:3]{index=3}
const RAY_AMM_V4 = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'); // Raydium AMM v4
const RAY_CLMM = new PublicKey('CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'); // Raydium CLMM :contentReference[oaicite:4]{index=4}

function onPumpFun(logs: Logs) {
  if (logs.logs?.some(l => l.includes('Instruction: Create'))) {
    // token baru dibuat di Pump.fun (sebelum/hingga migrasi ke Pump AMM / PumpSwap)
    console.log('[PUMPFUN NEW]', logs.signature);
  }
}

function onRaydium(logs: Logs) {
  //   const isInit = logs.logs?.some(l => /initialize/i.test(l));
  //   if (isInit) console.log('[RAYDIUM POOL NEW]', logs.signature);
}

async function main() {
  await conn.onLogs(PUMP_FUN, onPumpFun, 'confirmed');
  await conn.onLogs(RAY_AMM_V4, onRaydium, 'confirmed');
  await conn.onLogs(RAY_CLMM, onRaydium, 'confirmed');
  console.log('watchers started');
}
main().catch(console.error);
