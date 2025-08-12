import { ethers } from "ethers";
import { config } from "../core/config";
import { baseProvider } from "../blockchain/providers";
import { ITokenInfo } from "../core/types";

export async function checkTokenInfo(tokenAdrress: string): Promise<ITokenInfo> {
    const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!, baseProvider);

    const tokenContract = new ethers.Contract(
        tokenAdrress,
        [
            "function balanceOf(address owner) view returns (uint256)",
            "function decimals() view returns (uint8)",
            "function symbol() view returns (string)"
        ],
        wallet.provider,
    )

    try {
        const [balance, decimals, symbol] = await Promise.all([
            tokenContract.balanceOf(wallet.address),
            tokenContract.decimals().catch(() => 18),
            tokenContract.symbol().catch(() => "TOKEN")
        ])

        return {
            balance,
            decimals,
            symbol
        }
    } catch (error) {
        throw `Error checking token balance: ${error}`;
    }
}

export function checkAddressInfo(): string {
    const wallet = new ethers.Wallet(config.WALLET_PRIVATE_KEY!);
    return `https://debank.com/profile/${wallet.address}`;
}