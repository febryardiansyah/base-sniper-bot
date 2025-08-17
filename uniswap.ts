// monitor-uniswap-base-liquidity.ts
// node >=18, ethers v6
import { Contract, WebSocketProvider, JsonRpcProvider } from "ethers";
import { config } from "./lib/core/config";
import { analyzePair, shouldAlert } from "./lib/blockchain/pairAnalyzer";

// ========= CONFIG (BASE) =========
const WSS = config.ALCHEMY_WS_URL; // contoh: wss://base-mainnet.g.alchemy.com/v2/<KEY>
const HTTP = config.ALCHEMY_HTTP_URL; // contoh: https://base-mainnet.g.alchemy.com/v2/<KEY>
if (!WSS || !HTTP) {
  throw new Error(
    "Set BASE_WSS dan BASE_HTTP env var ke endpoint Base (WSS & HTTP)."
  );
}
const CHAIN_ID = 8453;

// Alamat deployment Uniswap di Base
const ADDR = {
  v2Factory: "0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6",
  v3Factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
  v4PoolManager: "0x498581ff718922c3f8e6a244956af099b2652b2b",
};

// Token penting di Base (alamat canonical)
const WETH = "0x4200000000000000000000000000000000000006";
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

// Threshold (BigInt, on-chain units)
const MIN_ETH = 5n * 10n ** 18n; // 5 ETH (18d)
const MIN_USDC = 20_000n * 10n ** 6n; // 20,000 USDC (6d)

// ========= ABIs (minimal) =========
const ABI = {
  v2Factory: [
    "event PairCreated(address indexed token0, address indexed token1, address pair, uint)",
  ],
  v3Factory: [
    "event PoolCreated(address indexed token0, address indexed token1, uint24 fee, int24 tickSpacing, address pool)",
  ],
  // V3 Pool events we care about
  v3Pool: [
    "event Mint(address sender, address indexed owner, int24 indexed tickLower, int24 indexed tickUpper, uint128 amount, uint256 amount0, uint256 amount1)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
  ],
  v4PoolManager: [
    // Pool created
    "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)",
    // Liquidity modified (add/remove)
    "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, int256 amount0, int256 amount1)",
  ],
};

// ========= Providers =========
const ws = new WebSocketProvider(WSS, CHAIN_ID);
const http = new JsonRpcProvider(HTTP, CHAIN_ID);

// ========= Helpers =========
const KNOWN = new Map<string, string>([
  [WETH.toLowerCase(), "WETH"],
  [USDC.toLowerCase(), "USDC"],
]);

function label(addr: string) {
  return `${KNOWN.get(addr.toLowerCase()) ?? "?"} (${addr})`;
}

function meetsThreshold(tokenAddr: string, rawAmount: bigint): boolean {
  const a = rawAmount >= 0n ? rawAmount : -rawAmount; // V4 emits int256 (positive for add)
  if (tokenAddr.toLowerCase() === WETH.toLowerCase()) return a >= MIN_ETH;
  if (tokenAddr.toLowerCase() === USDC.toLowerCase()) return a >= MIN_USDC;
  return false;
}

function niceAmt(tokenAddr: string, rawAmount: bigint): string {
  const a = rawAmount >= 0n ? rawAmount : -rawAmount;
  const decimals = tokenAddr.toLowerCase() === USDC.toLowerCase() ? 6n : 18n;
  const whole = a / 10n ** decimals;
  const frac = (a % 10n ** decimals)
    .toString()
    .padStart(Number(decimals), "0")
    .slice(0, 4);
  const sym =
    tokenAddr.toLowerCase() === USDC.toLowerCase()
      ? "USDC"
      : KNOWN.get(tokenAddr.toLowerCase()) ?? "TOKEN";
  return `${whole}.${frac} ${sym}`;
}

// ========= Main =========
async function main() {
  console.log(
    "▶️  Monitoring Base | Uniswap V3/V4 | thresholds: ≥5 WETH or ≥20k USDC"
  );

  const v2 = new Contract(ADDR.v2Factory, ABI.v2Factory, ws);
  v2.on("PairCreated", async (token0, token1, pair, idx, ev) => {
    const pairInfo = await analyzePair(pair, token0, token1);
    const isShouldAlert = pairInfo && shouldAlert(pairInfo);
    if (isShouldAlert) {
      console.log("🟣 [V2] PairCreated");
      console.log(`  token0: ${label(token0)}`);
      console.log(`  token1: ${label(token1)}`);
      console.log(`  pair  : ${pair}`);
      console.log(`  tx    : ${ev.log.transactionHash}`);
    }
  });

  // ----- V3: PoolCreated -> then subscribe Mint on that pool -----
  const v3Factory = new Contract(ADDR.v3Factory, ABI.v3Factory, ws);
  v3Factory.on(
    "PoolCreated",
    async (token0, token1, fee, tickSpacing, pool, ev) => {
      console.log(`\n🟦 [V3] PoolCreated  pool=${pool}`);
      console.log(
        `    token0=${label(token0)} token1=${label(
          token1
        )} fee=${fee} tickSpacing=${tickSpacing}`
      );
      console.log(`    tx=${ev.log.transactionHash}`);

      // subscribe Mint on the new pool
      const poolC = new Contract(pool, ABI.v3Pool, ws);
      poolC.on(
        "Mint",
        async (
          sender,
          owner,
          tickLower,
          tickUpper,
          amount,
          amount0,
          amount1,
          ev2
        ) => {
          // Check thresholds on either side if token matches WETH/USDC
          let hit = false;
          if (
            token0.toLowerCase() === WETH.toLowerCase() ||
            token0.toLowerCase() === USDC.toLowerCase()
          ) {
            if (meetsThreshold(token0, BigInt(amount0))) hit = true;
          }
          if (
            token1.toLowerCase() === WETH.toLowerCase() ||
            token1.toLowerCase() === USDC.toLowerCase()
          ) {
            if (meetsThreshold(token1, BigInt(amount1))) hit = true;
          }

          if (hit) {
            console.log("✅  [V3] Mint meets threshold");
            console.log(`    pool=${pool} owner=${owner}`);
            if (
              token0.toLowerCase() === WETH.toLowerCase() ||
              token0.toLowerCase() === USDC.toLowerCase()
            ) {
              console.log(`    amount0=${niceAmt(token0, BigInt(amount0))}`);
            } else {
              console.log(`    amount0=${amount0} (token0 ${token0})`);
            }
            if (
              token1.toLowerCase() === WETH.toLowerCase() ||
              token1.toLowerCase() === USDC.toLowerCase()
            ) {
              console.log(`    amount1=${niceAmt(token1, BigInt(amount1))}`);
            } else {
              console.log(`    amount1=${amount1} (token1 ${token1})`);
            }
            console.log(`    tx=${ev2.log.transactionHash}`);
          } else {
            console.log("… [V3] Mint < threshold, ignored");
          }
        }
      );
    }
  );

  // ----- V4: Initialize -> map poolId, then watch ModifyLiquidity globally -----
  const v4 = new Contract(ADDR.v4PoolManager, ABI.v4PoolManager, ws);
  // map: id(bytes32) -> {currency0, currency1}
  const idToCurrencies = new Map<string, { c0: string; c1: string }>();

  v4.on(
    "Initialize",
    (
      id,
      currency0,
      currency1,
      fee,
      tickSpacing,
      hooks,
      sqrtPriceX96,
      tick,
      ev
    ) => {
      idToCurrencies.set(id, { c0: currency0, c1: currency1 });
      console.log(`\n🟧 [V4] Initialize  id=${id}`);
      console.log(
        `    c0=${label(currency0)} c1=${label(
          currency1
        )} fee=${fee} tickSpacing=${tickSpacing} hooks=${hooks}`
      );
      console.log(`    tx=${ev.log.transactionHash}`);
    }
  );

  v4.on(
    "ModifyLiquidity",
    (
      id,
      sender,
      tickLower,
      tickUpper,
      liquidityDelta,
      amount0,
      amount1,
      ev
    ) => {
      const info = idToCurrencies.get(id);
      console.log(`\n🟧 [V4] ModifyLiquidity  id=${id}`);
      if (!info) {
        // belum lihat Initialize untuk id ini; lewati (atau bisa di-resolve via call jika kamu punya helper)
        console.log(
          `… [V4] ModifyLiquidity for unknown id=${id}, skipped (no Initialize seen yet)`
        );
        return;
      }

      let hit = false;
      if (
        info.c0.toLowerCase() === WETH.toLowerCase() ||
        info.c0.toLowerCase() === USDC.toLowerCase()
      ) {
        if (meetsThreshold(info.c0, BigInt(amount0))) hit = true;
      }
      if (
        info.c1.toLowerCase() === WETH.toLowerCase() ||
        info.c1.toLowerCase() === USDC.toLowerCase()
      ) {
        if (meetsThreshold(info.c1, BigInt(amount1))) hit = true;
      }

      if (hit) {
        console.log("✅  [V4] ModifyLiquidity meets threshold");
        console.log(`    id=${id} sender=${sender}`);
        if (
          info.c0.toLowerCase() === WETH.toLowerCase() ||
          info.c0.toLowerCase() === USDC.toLowerCase()
        ) {
          console.log(`    amount0=${niceAmt(info.c0, BigInt(amount0))}`);
        } else {
          console.log(`    amount0=${amount0} (c0 ${info.c0})`);
        }
        if (
          info.c1.toLowerCase() === WETH.toLowerCase() ||
          info.c1.toLowerCase() === USDC.toLowerCase()
        ) {
          console.log(`    amount1=${niceAmt(info.c1, BigInt(amount1))}`);
        } else {
          console.log(`    amount1=${amount1} (c1 ${info.c1})`);
        }
        console.log(`    tx=${ev.log.transactionHash}`);
      } else {
        console.log("… [V4] ModifyLiquidity < threshold, ignored");
      }
    }
  );

  console.log("🟢 Listening on Base (V3/V4)…");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
