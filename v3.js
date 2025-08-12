const { ethers } = require('ethers');

// ====== CONFIG ======
const RPC_URL = "https://mainnet.base.org";
const PRIVATE_KEY = "0xcbdf12bae04952a2db5cae8108509533ac3be9f63e6dcf7f825ef57b700afc9f";
const TOKEN_ADDRESS = "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b"; // ERC20 you want to sell
const TOKEN_DECIMALS = 18;
const TOKEN_AMOUNT = "10"; // in token units
const DEX = "aerodrome"; // "aerodrome" or "uniswapv3"

// Aerodrome V2 Router
const AERODROME_ROUTER = "0xb021b6e8609ba0a58c539dc81fb1fd6343fbf96f";
// Uniswap V3 Router
const UNISWAP_V3_ROUTER = "0x2626664c2603336e57b271c5c0b26f421741e481";
// WETH on Base
const WETH = "0x4200000000000000000000000000000000000006";

// ====== ABIs ======
const erc20ABI = [
  "function approve(address spender, uint256 value) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

const v2RouterABI = [
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
];

const v3RouterABI = [
  "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
];

const wethABI = ["function withdraw(uint256 wad) public"];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const token = new ethers.Contract(TOKEN_ADDRESS, erc20ABI, wallet);

  const amountIn = ethers.parseUnits(TOKEN_AMOUNT, TOKEN_DECIMALS);
  let routerAddress, router, swapTx;

  if (DEX === "aerodrome") {
    routerAddress = AERODROME_ROUTER;
    router = new ethers.Contract(routerAddress, v2RouterABI, wallet);
  } else if (DEX === "uniswapv3") {
    routerAddress = UNISWAP_V3_ROUTER;
    router = new ethers.Contract(routerAddress, v3RouterABI, wallet);
  } else {
    throw new Error("Unknown DEX");
  }

  // 1. Check allowance & approve if needed
  const currentAllowance = await token.allowance(wallet.address, routerAddress);
  if (currentAllowance < amountIn) {
    console.log("Approving token spending...");
    const approveTx = await token.approve(routerAddress, amountIn);
    await approveTx.wait();
    console.log("Approval done.");
  } else {
    console.log("Already approved.");
  }

  // 2. Swap
  if (DEX === "aerodrome") {
    console.log("Swapping on Aerodrome...");
    swapTx = await router.swapExactTokensForETH(
      amountIn,
      0n, // amountOutMin — set to >0 for slippage protection
      [TOKEN_ADDRESS, WETH],
      wallet.address,
      Math.floor(Date.now() / 1000) + 60 * 10
    );
  } else if (DEX === "uniswapv3") {
    console.log("Swapping on Uniswap V3...");
    // For V3, ETH is WETH, so we swap Token → WETH, then unwrap
    const feeTier = 3000; // 0.3% pool — change if needed
    swapTx = await router.exactInputSingle({
      tokenIn: TOKEN_ADDRESS,
      tokenOut: WETH,
      fee: feeTier,
      recipient: wallet.address,
      deadline: Math.floor(Date.now() / 1000) + 60 * 10,
      amountIn: amountIn,
      amountOutMinimum: 0n, // slippage protection
      sqrtPriceLimitX96: 0,
    });
  }

  const receipt = await swapTx.wait();
  console.log("✅ Swap complete:", receipt.hash);

  // 3. Unwrap WETH if Uniswap V3
  if (DEX === "uniswapv3") {
    const weth = new ethers.Contract(WETH, wethABI, wallet);
    const wethBalance = await provider.getBalance(wallet.address);
    console.log(`ETH balance after swap: ${ethers.formatEther(wethBalance)}`);
  }
}

main().catch(console.error);
