import { ethers } from 'ethers';
import { BaseContracts } from '../contracts/contracts';
import { IPairInfo, ITokenInfo } from '../interface/types';
import { checkTokenInfo } from '../services/info';
import { config } from '../utils/config';

// Analyze pair for liquidity and token information
export async function analyzePair(
  pairAddress: string,
  token0Address: string,
  token1Address: string,
  uniswapVersion: number = 2
): Promise<IPairInfo | null> {
  try {
    const pairContract = BaseContracts.createPairContract(pairAddress, uniswapVersion);

    // Get token information
    const [token0Info, token1Info] = await Promise.all([
      checkTokenInfo(token0Address),
      checkTokenInfo(token1Address),
    ]);

    if (!token0Info || !token1Info) {
      return null;
    }

    // Calculate ETH liquidity
    let liquidityETH = 0;

    // Get reserves for Uniswap V2
    if (uniswapVersion === 2) {
      const reserves = await pairContract.getReserves();
      const reserve0 = reserves[0].toString();
      const reserve1 = reserves[1].toString();

      if (token0Address.toLowerCase() === config.WETH_ADDRESS) {
        liquidityETH = parseFloat(ethers.formatEther(reserve0));
      } else if (token1Address.toLowerCase() === config.WETH_ADDRESS) {
        liquidityETH = parseFloat(ethers.formatEther(reserve1));
      }
    }

    return {
      pairAddress,
      token0: token0Info,
      token1: token1Info,
      liquidityETH,
    };
  } catch (error) {
    console.error(`Error analyzing pair ${pairAddress}:`, error);
    return null;
  }
}

// Check if pair should trigger an alert
export function shouldAlert(pairInfo: IPairInfo): boolean {
  return (
    pairInfo.liquidityETH > config.MIN_LIQUIDITY_ETH &&
    pairInfo.liquidityETH < config.MAX_LIQUIDITY_ETH
  );
  // Check minimum liquidity
  // if (
  //   pairInfo.liquidityETH > config.MIN_LIQUIDITY_ETH &&
  //   pairInfo.liquidityETH < config.MAX_LIQUIDITY_ETH
  // ) {
  //   return true;
  // }

  // Check token supply (avoid tokens with extremely high supply)
  // const nonWETHToken = pairInfo.token0.address.toLowerCase() === config.WETH_ADDRESS
  //   ? pairInfo.token1
  //   : pairInfo.token0;

  // const supply = new BigNumber(nonWETHToken.totalSupply)
  //   .dividedBy(new BigNumber(10).pow(nonWETHToken.decimals));

  // if (supply.isGreaterThan(config.MAX_SUPPLY_THRESHOLD)) {
  //   return false;
  // }

  // return false;
}

// Get non-WETH token from pair
export function getNonWETHToken(pairInfo: IPairInfo): ITokenInfo {
  return pairInfo.token0.address.toLowerCase() === config.WETH_ADDRESS
    ? pairInfo.token1
    : pairInfo.token0;
}
