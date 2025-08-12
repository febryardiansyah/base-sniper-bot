import { ethers } from "ethers";
import { config } from "../core/config";
import { wsProvider, httpProvider } from "./providers";

// Import ABIs
import factoryAbi from "../../abi/UniswapV2Factory.json";
import pairAbi from "../../abi/UniswapV2Pair.json";
import erc20Abi from "../../abi/ERC20.json";
import routerAbi from "../../abi/Router.json";
import universalRouterAbi from "../../abi/UniversalRouter.json";

export { erc20Abi };

// Initialize factory contracts
export const factories = [
  new ethers.Contract(config.UNISWAP_V2_FACTORY, factoryAbi, wsProvider),
  new ethers.Contract(config.AERODROME_FACTORY, factoryAbi, wsProvider),
];

// Initialize router contracts
export const routers = [
  new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbi, wsProvider),
  new ethers.Contract(config.AERODROME_ROUTER, routerAbi, wsProvider),
];

// Universal Router contract
export const universalRouter = new ethers.Contract(
  config.UNIVERSAL_ROUTER,
  universalRouterAbi,
  wsProvider
);

// Factory names for logging
export const factoryNames = ["Uniswap V2", "Aerodrome"];
export const routerNames = ["Uniswap V2", "Aerodrome", "Universal Router"];

// Universal Router command types
export const UNIVERSAL_ROUTER_COMMANDS = {
  V2_SWAP_EXACT_IN: 0x08,
  V2_SWAP_EXACT_OUT: 0x09,
  V3_SWAP_EXACT_IN: 0x00,
  V3_SWAP_EXACT_OUT: 0x01,
  WRAP_ETH: 0x0b,
  UNWRAP_WETH: 0x0c,
  PERMIT2_TRANSFER_FROM: 0x06,
  SWEEP_ERC20: 0x04
};

// Create pair contract instance
export function createPairContract(pairAddress: string): ethers.Contract {
  return new ethers.Contract(pairAddress, pairAbi, httpProvider);
}
