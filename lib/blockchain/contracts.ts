import { ethers } from "ethers";
import { config } from "../core/config";
import { wsProvider, httpProvider } from "./providers";

// Import ABIs
import uniswapV2FactoryAbi from "../../abi/UniswapV2Factory.json";
import uniswapV2Pair from "../../abi/UniswapV2Pair.json";
import erc20Abi from "../../abi/ERC20.json";
import routerAbi from "../../abi/Router.json";

// Import Uniswap V3 and V4 ABIs
import uniswapV3FactoryAbi from "../../abi/UniswapV3Factory.json";
import uniswapV3PoolAbi from "../../abi/UniswapV3Pool.json";
import uniswapV4PoolManagerAbi from "../../abi/UniswapV4PoolManager.json";

export { erc20Abi, uniswapV3PoolAbi, uniswapV4PoolManagerAbi, zoraFactoryAbi };

// Import Zora Factory ABI
import zoraFactoryAbi from "../../abi/ZoraFactory.json";

// Initialize factory contracts
export const factories = [
  new ethers.Contract(
    config.UNISWAP_V2_FACTORY,
    uniswapV2FactoryAbi,
    wsProvider
  ),
  new ethers.Contract(
    config.AERODROME_FACTORY,
    uniswapV2FactoryAbi,
    wsProvider
  ),
];

// Initialize Uniswap V3 factory contract
export const uniswapV3Factory = new ethers.Contract(
  config.UNISWAP_V3_FACTORY,
  uniswapV3FactoryAbi,
  wsProvider
);

// Initialize Uniswap V4 pool manager contract
export const uniswapV4PoolManager = new ethers.Contract(
  config.UNISWAP_V4_POOL_MANAGER,
  uniswapV4PoolManagerAbi,
  wsProvider
);

export const zoraFactory = new ethers.Contract(
  config.ZORA_FACTORY,
  zoraFactoryAbi,
  wsProvider
);

// Initialize router contracts
export const routers = [
  new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbi, wsProvider),
  new ethers.Contract(config.AERODROME_ROUTER, routerAbi, wsProvider),
];

// Factory names for logging
export const factoryNames = ["Uniswap V2", "Aerodrome"];
export const routerNames = ["Uniswap V2", "Aerodrome", "Universal Router"];

// Create pair contract instance
export function createPairContract(pairAddress: string): ethers.Contract {
  return new ethers.Contract(pairAddress, uniswapV2Pair, httpProvider);
}
