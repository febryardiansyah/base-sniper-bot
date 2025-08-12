const { ethers } = require('ethers');

const RPC_URL = "https://mainnet.base.org";
const PRIVATE_KEY = "0xcbdf12bae04952a2db5cae8108509533ac3be9f63e6dcf7f825ef57b700afc9f";

const AERODROME_ROUTER = "0xb021b6e8609ba0a58c539dc81fb1fd6343fbf96f";
const WETH = "0x4200000000000000000000000000000000000006";
const TOKEN_ADDRESS = "0x1111111111166b7FE7bd91427724B487980aFc69";
const ETH_AMOUNT = "0.0001";

const routerABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const router = new ethers.Contract(AERODROME_ROUTER, routerABI, wallet);

  const path = [WETH, TOKEN_ADDRESS];
  const amountIn = ethers.parseEther(ETH_AMOUNT);

  // Set min output to 0 (unsafe — ideally calculate from reserves)
  const tx = await router.swapExactETHForTokens(
    0n,
    path,
    wallet.address,
    Math.floor(Date.now() / 1000) + 60 * 10,
    { value: amountIn, gasLimit: 300000 }
  );

  console.log("Swapping...");
  const receipt = await tx.wait();
  console.log("✅ Swap complete! Hash:", receipt.transactionHash);
}

main().catch(console.error);
