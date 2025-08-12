import { ethers } from "ethers";
import { config } from "../core/config";

// Initialize providers
export const wsProvider = new ethers.WebSocketProvider(config.ALCHEMY_WS_URL);
export const httpProvider = new ethers.JsonRpcProvider(config.ALCHEMY_HTTP_URL);
export const baseProvider = new ethers.JsonRpcProvider(config.BASE_MAINET_RPC_URL);