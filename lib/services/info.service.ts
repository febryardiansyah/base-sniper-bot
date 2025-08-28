import { ethers } from 'ethers';
import { config } from '../utils/config';
import { BaseProviders } from '../blockchain/providers';
import { IUserTokenInfo, ITokenInfo } from '../interface/token.interface';
import * as BaseContracts from '../blockchain/contracts';

export async function checkUserTokenInfo(tokenAddress: string): Promise<IUserTokenInfo> {
  const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!, BaseProviders.baseProvider);

  const tokenContract = new ethers.Contract(tokenAddress, BaseContracts.erc20Abi, wallet.provider);

  try {
    const [balance, decimals, symbol, totalSupply, name] = await Promise.all([
      tokenContract.balanceOf(wallet.address),
      tokenContract.decimals().catch(() => 18),
      tokenContract.symbol().catch(() => 'TOKEN'),
      tokenContract.totalSupply().catch(() => '0'),
      tokenContract.name().catch(() => 'Unknown'),
    ]);

    return {
      address: tokenAddress,
      name,
      balance,
      decimals,
      symbol,
      totalSupply: totalSupply.toString(),
    };
  } catch (error) {
    console.error(`Error getting token info for ${tokenAddress}:`, error);
    throw `Error getting token info: ${error}`;
  }
}

export function checkAddressInfo(): string {
  const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!);
  return `https://debank.com/profile/${wallet.address}`;
}

export async function checkTokenInfo(tokenAddress: string): Promise<ITokenInfo | null> {
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      BaseContracts.erc20Abi,
      BaseProviders.httpProvider
    );

    const [name, symbol, decimals, totalSupply] = await Promise.all([
      tokenContract.name().catch(() => 'Unknown'),
      tokenContract.symbol().catch(() => '???'),
      tokenContract.decimals().catch(() => 18),
      tokenContract.totalSupply().catch(() => '0'),
    ]);

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals,
      totalSupply: totalSupply.toString(),
    };
  } catch (error) {
    console.error(`Error getting token info for ${tokenAddress}:`, error);
    return null;
  }
}
