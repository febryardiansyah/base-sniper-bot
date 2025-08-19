import { ethers } from "ethers";
import { config } from "../core/config";

// Initialize providers in BaseProviders namespace
export const BaseProviders = {
  wsProvider: new ethers.WebSocketProvider(config.ALCHEMY_WS_URL),
  httpProvider: new ethers.JsonRpcProvider(config.ALCHEMY_HTTP_URL),
  baseProvider: new ethers.JsonRpcProvider(config.BASE_MAINET_RPC_URL)
};