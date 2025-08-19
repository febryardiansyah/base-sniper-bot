import { ethers } from "ethers";
import BigNumber from "bignumber.js";
import { config } from "../core/config";
import { PairInfo, ITokenInfo } from "../core/types";
import { BaseContracts } from "../contracts/contracts";
import { checkTokenInfo } from "../services/info";

// Analyze pair for liquidity and token information
export async function analyzePair(
  pairAddress: string,
  token0Address: string,
  token1Address: string
): Promise<PairInfo | null> {
  try {
    const pairContract = BaseContracts.createPairContract(pairAddress);

    // Get token information
    const [token0Info, token1Info] = await Promise.all([
      checkTokenInfo(token0Address),
      checkTokenInfo(token1Address),
    ]);

    if (!token0Info || !token1Info) {
      return null;
    }

    // Get reserves
    const reserves = await pairContract.getReserves();
    const reserve0 = reserves[0].toString();
    const reserve1 = reserves[1].toString();

    // Calculate ETH liquidity
    let liquidityETH = 0;

    if (token0Address.toLowerCase() === config.WETH_ADDRESS) {
      liquidityETH = parseFloat(ethers.formatEther(reserve0));
    } else if (token1Address.toLowerCase() === config.WETH_ADDRESS) {
      liquidityETH = parseFloat(ethers.formatEther(reserve1));
    }

    return {
      pairAddress,
      token0: token0Info,
      token1: token1Info,
      reserve0,
      reserve1,
      liquidityETH,
    };
  } catch (error) {
    console.error(`Error analyzing pair ${pairAddress}:`, error);
    return null;
  }
}

// Check if pair should trigger an alert
export function shouldAlert(pairInfo: PairInfo): boolean {
  // Check minimum liquidity
  if (pairInfo.liquidityETH < config.MIN_LIQUIDITY_ETH) {
    return false;
  }

  // Check token supply (avoid tokens with extremely high supply)
  // const nonWETHToken = pairInfo.token0.address.toLowerCase() === config.WETH_ADDRESS
  //   ? pairInfo.token1
  //   : pairInfo.token0;

  // const supply = new BigNumber(nonWETHToken.totalSupply)
  //   .dividedBy(new BigNumber(10).pow(nonWETHToken.decimals));

  // if (supply.isGreaterThan(config.MAX_SUPPLY_THRESHOLD)) {
  //   return false;
  // }

  return true;
}

// Get non-WETH token from pair
export function getNonWETHToken(pairInfo: PairInfo): ITokenInfo {
  return pairInfo.token0.address.toLowerCase() === config.WETH_ADDRESS
    ? pairInfo.token1
    : pairInfo.token0;
}