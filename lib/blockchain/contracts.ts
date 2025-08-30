import * as ethers from 'ethers';
import { BaseProviders } from './providers';
import { config } from '../utils/config';

// Import ABIs
import aerodromeFactoryAbiJson from '../../abi/AerodromeFactory.json';
import erc20AbiJson from '../../abi/ERC20.json';
import routerAbiJson from '../../abi/Router.json';
import uniswapV2FactoryAbiJson from '../../abi/UniswapV2Factory.json';
import uniswapV2PairJson from '../../abi/UniswapV2Pair.json';

// Import Uniswap V3 and V4 ABIs
import uniswapV3FactoryAbiJson from '../../abi/UniswapV3Factory.json';
import uniswapV3PoolAbiJson from '../../abi/UniswapV3Pool.json';
import uniswapV4PoolManagerAbiJson from '../../abi/UniswapV4PoolManager.json';

// Import Zora Factory ABI
import zoraFactoryAbiJson from '../../abi/ZoraFactory.json';

// Export ethers
export { ethers };

// Export ABIs
export const erc20Abi = erc20AbiJson;
export const uniswapV3FactoryAbi = uniswapV3FactoryAbiJson;
export const uniswapV3PoolAbi = uniswapV3PoolAbiJson;
export const uniswapV4PoolManagerAbi = uniswapV4PoolManagerAbiJson;
export const zoraFactoryAbi = zoraFactoryAbiJson;

// Initialize factory contracts
export const uniswapV2Factory = new ethers.Contract(
  config.AERODROME_FACTORY,
  aerodromeFactoryAbiJson,
  BaseProviders.wsProvider
);

// Initialize Uniswap V3 factory contract
export const uniswapV3Factory = new ethers.Contract(
  config.UNISWAP_V3_FACTORY_ADDRESS,
  uniswapV3FactoryAbiJson,
  BaseProviders.wsProvider
);

// Initialize Uniswap V4 pool manager contract
export const uniswapV4PoolManager = new ethers.Contract(
  config.UNISWAP_V4_POOL_MANAGER_ADDRESS,
  uniswapV4PoolManagerAbiJson,
  BaseProviders.wsProvider
);

export const zoraFactory = new ethers.Contract(
  config.ZORA_FACTORY,
  zoraFactoryAbiJson,
  BaseProviders.wsProvider
);

// Create pair contract instance
export function createPairContract(
  pairAddress: string,
  uniswapVersion: number = 2
): ethers.Contract {
  if (uniswapVersion === 3) {
    return new ethers.Contract(pairAddress, uniswapV3PoolAbiJson, BaseProviders.httpProvider);
  }
  return new ethers.Contract(pairAddress, uniswapV2PairJson, BaseProviders.httpProvider);
}
