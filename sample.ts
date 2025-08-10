import { ethers } from "ethers";
import dotenv from "dotenv";
import abi from "./abi.json"; // Same ABI as before

dotenv.config();

// Configuration
const config = {
  BASE_MAINNET_WSS_URL: process.env.ALCHEMY_WS_URL,
  PRIVATE_KEY: process.env.PRIVATE_KEY || "",
  CONTRACT_ADDRESS: "0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4", // USDC on Base Mainnet
};

async function main() {
  if (!config.BASE_MAINNET_WSS_URL) {
    throw new Error("WebSocket URL not configured");
  }

  // Initialize WebSocket provider
  const provider = new ethers.WebSocketProvider(config.BASE_MAINNET_WSS_URL);

  // Handle provider connection events
  provider.on("debug", (info) => {
    console.log("WebSocket Debug:", info);
  });

  // Create contract instance
  const usdcContract = new ethers.Contract(
    config.CONTRACT_ADDRESS,
    abi,
    provider
  );

  // 1. Get contract metadata
  console.log("Fetching contract metadata...");
  const [name, symbol, decimals] = await Promise.all([
    usdcContract.name(),
    usdcContract.symbol(),
    usdcContract.decimals(),
  ]);
  console.log(`Token: ${name} (${symbol}) with ${decimals} decimals`);

  // 3. Set up event listener for transfers
  console.log("Setting up event listeners...");
  usdcContract.on("Transfer", (from, to, value, event) => {
    console.log("\nNew Transfer Event:");
    console.log(`From: ${from}`);
    console.log(`To: ${to}`);
    console.log(`Value: ${ethers.formatUnits(value, decimals)} ${symbol}`);
    console.log(`Tx Hash: ${event.log.transactionHash}`);
  });

  // 4. Example of sending a transaction (uncomment to use)
  /*
  const recipient = "0xRecipientAddressHere";
  const amount = ethers.parseUnits("1", decimals); // 1 USDC
  console.log(`Preparing to transfer ${ethers.formatUnits(amount, decimals)} ${symbol} to ${recipient}`);
  
  const tx = await usdcContract.transfer(recipient, amount);
  console.log(`Transaction sent: ${tx.hash}`);
  
  const receipt = await tx.wait();
  console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
  */

  // Keep the connection alive
  console.log("\nListening for transfer events... Press Ctrl+C to exit");
  process.on("SIGINT", async () => {
    console.log("Disconnecting...");
    await provider.destroy();
    process.exit();
  });
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
