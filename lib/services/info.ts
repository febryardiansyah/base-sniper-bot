import { ethers } from "ethers";
import { config } from "../core/config";
import { baseProvider } from "../blockchain/providers";
import { ITokenInfo } from "../core/types";
import { erc20Abi } from "../blockchain/contracts";

export async function checkTokenInfo(
  tokenAdrress: string
): Promise<ITokenInfo> {
  const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!, baseProvider);

  const tokenContract = new ethers.Contract(
    tokenAdrress,
    erc20Abi,
    wallet.provider
  );

  try {
    const [balance, decimals, symbol, totalSupply, name] = await Promise.all([
      tokenContract.balanceOf(wallet.address),
      tokenContract.decimals().catch(() => 18),
      tokenContract.symbol().catch(() => "TOKEN"),
      tokenContract.totalSupply().catch(() => "0"),
      tokenContract.name().catch(() => "Unknown"),
    ]);

    return {
      address: tokenAdrress,
      name,
      balance,
      decimals,
      symbol,
      totalSupply: totalSupply.toString(),
    };
  } catch (error) {
    throw `Error checking token balance: ${error}`;
  }
}

export function checkAddressInfo(): string {
  const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!);
  return `https://debank.com/profile/${wallet.address}`;
}
