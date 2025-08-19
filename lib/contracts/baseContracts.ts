import * as ethers from "ethers";
import { config } from "../core/config";
import { BaseProviders } from "../blockchain/providers";

// Import ABIs
import uniswapV2FactoryAbiJson from "../../abi/erc20/UniswapV2Factory.json";
import uniswapV2PairJson from "../../abi/erc20/UniswapV2Pair.json";
import erc20AbiJson from "../../abi/erc20/ERC20.json";
import routerAbiJson from "../../abi/erc20/Router.json";

// Import Uniswap V3 and V4 ABIs
import uniswapV3FactoryAbiJson from "../../abi/erc20/UniswapV3Factory.json";
import uniswapV3PoolAbiJson from "../../abi/erc20/UniswapV3Pool.json";
import uniswapV4PoolManagerAbiJson from "../../abi/erc20/UniswapV4PoolManager.json";

// Import Zora Factory ABI
import zoraFactoryAbiJson from "../../abi/erc20/ZoraFactory.json";

// Export ethers
export { ethers };

// Export ABIs
export const erc20Abi = erc20AbiJson;
export const uniswapV3PoolAbi = uniswapV3PoolAbiJson;
export const uniswapV4PoolManagerAbi = uniswapV4PoolManagerAbiJson;
export const zoraFactoryAbi = zoraFactoryAbiJson;

// Initialize factory contracts
export const factories = [
  new ethers.Contract(
    config.UNISWAP_V2_FACTORY,
    uniswapV2FactoryAbiJson,
    BaseProviders.wsProvider
  ),
  new ethers.Contract(
    config.AERODROME_FACTORY,
    uniswapV2FactoryAbiJson,
    BaseProviders.wsProvider
  ),
];

// Initialize Uniswap V3 factory contract
export const uniswapV3Factory = new ethers.Contract(
  config.UNISWAP_V3_FACTORY,
  uniswapV3FactoryAbiJson,
  BaseProviders.wsProvider
);

// Initialize Uniswap V4 pool manager contract
export const uniswapV4PoolManager = new ethers.Contract(
  config.UNISWAP_V4_POOL_MANAGER,
  uniswapV4PoolManagerAbiJson,
  BaseProviders.wsProvider
);

export const zoraFactory = new ethers.Contract(
  config.ZORA_FACTORY,
  zoraFactoryAbiJson,
  BaseProviders.wsProvider
);

// Initialize router contracts
export const routers = [
  new ethers.Contract(config.UNISWAP_V2_ROUTER, routerAbiJson, BaseProviders.wsProvider),
  new ethers.Contract(config.AERODROME_ROUTER, routerAbiJson, BaseProviders.wsProvider),
];

// Factory names for logging
export const factoryNames = ["Uniswap V2", "Aerodrome"];
export const routerNames = ["Uniswap V2", "Aerodrome", "Universal Router"];

// Create pair contract instance
export function createPairContract(pairAddress: string): ethers.Contract {
  return new ethers.Contract(pairAddress, uniswapV2PairJson, BaseProviders.httpProvider);
}