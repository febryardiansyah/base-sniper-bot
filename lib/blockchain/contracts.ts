import { ethers } from "ethers";
import { config } from "../core/config";
import { wsProvider, httpProvider } from "./providers";
import { TokenInfo } from "../core/types";

// Import ABIs
import factoryAbi from "../../abi/UniswapV2Factory.json";
import pairAbi from "../../abi/UniswapV2Pair.json";
import erc20Abi from "../../abi/ERC20.json";
import routerAbi from "../../abi/Router.json";

// Initialize factory contracts
export const factories = [
  new ethers.Contract(config.UNISWAP_V2_FACTORY, factoryAbi, wsProvider),
  new ethers.Contract(config.AERODROME_FACTORY, factoryAbi, wsProvider)
];

// Initialize router contracts
export const routers = [
  new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbi, wsProvider),
  new ethers.Contract(config.AERODROME_ROUTER, routerAbi, wsProvider)
];

// Factory names for logging
export const factoryNames = ["Uniswap V2", "Aerodrome"];
export const routerNames = ["Uniswap V2", "Aerodrome"];

// Get token information from contract
export async function getTokenInfo(tokenAddress: string): Promise<TokenInfo | null> {
  try {
    const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, httpProvider);
    
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      tokenContract.name().catch(() => "Unknown"),
      tokenContract.symbol().catch(() => "???"),
      tokenContract.decimals().catch(() => 18),
      tokenContract.totalSupply().catch(() => "0")
    ]);
    
    return {
      address: tokenAddress,
      name,
      symbol,
      decimals,
      totalSupply: totalSupply.toString()
    };
  } catch (error) {
    console.error(`Error getting token info for ${tokenAddress}:`, error);
    return null;
  }
}

// Create pair contract instance
export function createPairContract(pairAddress: string): ethers.Contract {
  return new ethers.Contract(pairAddress, pairAbi, httpProvider);
}