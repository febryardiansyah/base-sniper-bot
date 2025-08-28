import axios from 'axios';
import { config } from '../utils/config';
import { getTimeAgo } from '../utils/utils';
import { IEtherscanResponse } from '../interface/token.interface';
import { ISourceCodeResponse } from '../interface/etherscan.interface';

const key = config.ETHER_SCAN_API_KEY;
const baseUrl = config.ETHER_SCAN_API;
const baseChainId = config.BASE_CHAIN_ID;

// Cache to avoid hammering explorer
const verificationCache = new Map<string, boolean>();

export async function isContractVerified(address: string): Promise<boolean> {
  const addr = address.toLowerCase();
  if (verificationCache.has(addr)) return verificationCache.get(addr)!;

  try {
    const params = new URLSearchParams({
      chainid: String(baseChainId),
      module: 'contract',
      action: 'getsourcecode',
      address: addr,
      apikey: key,
    });
    const { data } = await axios.get<ISourceCodeResponse>(`${baseUrl}?${params.toString()}`);
    if (data.status !== '1' || !Array.isArray(data.result) || data.result.length === 0) {
      verificationCache.set(addr, false);
      return false;
    }
    const item = data.result[0];
    const verified = !!item.SourceCode && item.ABI !== 'Contract source code not verified';
    verificationCache.set(addr, verified);
    return verified;
  } catch (e) {
    // On error, assume not verified (do not cache to allow future retry)
    return false;
  }
}

export async function getWalletTransactions(walletAddress: string): Promise<IEtherscanResponse> {
  const params = new URLSearchParams({
    chainid: String(baseChainId),
    module: 'account',
    action: 'txlist',
    address: walletAddress,
    startblock: '0',
    endblock: '99999999',
    sort: 'asc',
    apikey: key,
  });
  try {
    const { data } = await axios.get(`${baseUrl}?${params.toString()}`);
    return data;
  } catch (error) {
    throw error;
  }
}

export async function getWalletAge(walletAddress: string) {
  try {
    const data = await getWalletTransactions(walletAddress);

    if (data.status === '1' && data.result.length > 0) {
      const firstTx = data.result[0];
      const timestamp = parseInt(firstTx.timeStamp);
      return {
        firstActivation: {
          timestamp: new Date(timestamp * 1000).toISOString(),
          time_ago: getTimeAgo(timestamp),
          blockNumber: parseInt(firstTx.blockNumber),
          txHash: firstTx.hash,
        },
      };
    }

    return { firstActivation: null };
  } catch (error) {
    throw error;
  }
}

export async function getFirstIncomingTransaction(walletAddress: string) {
  try {
    const data = await getWalletTransactions(walletAddress);

    if (data.status === '1' && data.result.length > 0) {
      const firstIncoming = data.result.find(
        tx =>
          tx.to.toLowerCase() === walletAddress.toLowerCase() &&
          tx.isError === '0' &&
          tx.txreceipt_status === '1'
      );

      if (firstIncoming) {
        const timestamp = parseInt(firstIncoming.timeStamp);
        return {
          firstIncoming: {
            timestamp: new Date(timestamp * 1000).toISOString(),
            time_ago: getTimeAgo(timestamp),
            blockNumber: parseInt(firstIncoming.blockNumber),
            txHash: firstIncoming.hash,
            from: firstIncoming.from,
            value: firstIncoming.value,
          },
        };
      }
    }

    return { firstIncoming: null };
  } catch (error) {
    throw error;
  }
}

export async function getFirstOutgoingTransaction(walletAddress: string) {
  try {
    const data = await getWalletTransactions(walletAddress);

    if (data.status === '1' && data.result.length > 0) {
      const firstOutgoing = data.result.find(
        tx =>
          tx.from.toLowerCase() === walletAddress.toLowerCase() &&
          tx.isError === '0' &&
          tx.txreceipt_status === '1'
      );

      if (firstOutgoing) {
        const timestamp = parseInt(firstOutgoing.timeStamp);
        return {
          firstOutgoing: {
            timestamp: new Date(timestamp * 1000).toISOString(),
            time_ago: getTimeAgo(timestamp),
            blockNumber: parseInt(firstOutgoing.blockNumber),
            txHash: firstOutgoing.hash,
            to: firstOutgoing.to,
            value: firstOutgoing.value,
          },
        };
      }
    }

    return { firstOutgoing: null };
  } catch (error) {
    throw error;
  }
}

export async function getFirstBlockAppearance(walletAddress: string) {
  try {
    const data = await getWalletTransactions(walletAddress);

    if (data.status === '1' && data.result.length > 0) {
      const firstTx = data.result[0];
      const timestamp = parseInt(firstTx.timeStamp);
      return {
        firstBlockAppearance: {
          blockNumber: parseInt(firstTx.blockNumber),
          timestamp: new Date(timestamp * 1000).toISOString(),
          time_ago: getTimeAgo(timestamp),
          txHash: firstTx.hash,
        },
      };
    }

    return { firstBlockAppearance: null };
  } catch (error) {
    throw error;
  }
}

export async function getWalletAnalysis(walletAddress: string) {
  try {
    const data = await getWalletTransactions(walletAddress);

    if (data.status === '1' && data.result.length > 0) {
      const transactions = data.result;
      const firstTx = transactions[0];

      const firstIncoming = transactions.find(
        tx =>
          tx.to.toLowerCase() === walletAddress.toLowerCase() &&
          tx.isError === '0' &&
          tx.txreceipt_status === '1'
      );

      const firstOutgoing = transactions.find(
        tx =>
          tx.from.toLowerCase() === walletAddress.toLowerCase() &&
          tx.isError === '0' &&
          tx.txreceipt_status === '1'
      );

      return {
        address: walletAddress,
        firstActivation: firstTx
          ? {
              timestamp: new Date(parseInt(firstTx.timeStamp) * 1000).toISOString(),
              time_ago: getTimeAgo(parseInt(firstTx.timeStamp)),
              blockNumber: parseInt(firstTx.blockNumber),
              txHash: firstTx.hash,
            }
          : null,
        firstIncoming: firstIncoming
          ? {
              timestamp: new Date(parseInt(firstIncoming.timeStamp) * 1000).toISOString(),
              time_ago: getTimeAgo(parseInt(firstIncoming.timeStamp)),
              blockNumber: parseInt(firstIncoming.blockNumber),
              txHash: firstIncoming.hash,
              from: firstIncoming.from,
              value: firstIncoming.value,
            }
          : null,
        firstOutgoing: firstOutgoing
          ? {
              timestamp: new Date(parseInt(firstOutgoing.timeStamp) * 1000).toISOString(),
              time_ago: getTimeAgo(parseInt(firstOutgoing.timeStamp)),
              blockNumber: parseInt(firstOutgoing.blockNumber),
              txHash: firstOutgoing.hash,
              to: firstOutgoing.to,
              value: firstOutgoing.value,
            }
          : null,
        firstBlockAppearance: firstTx
          ? {
              blockNumber: parseInt(firstTx.blockNumber),
              timestamp: new Date(parseInt(firstTx.timeStamp) * 1000).toISOString(),
              time_ago: getTimeAgo(parseInt(firstTx.timeStamp)),
              txHash: firstTx.hash,
            }
          : null,
        totalTransactions: transactions.length,
      };
    }

    return {
      address: walletAddress,
      firstActivation: null,
      firstIncoming: null,
      firstOutgoing: null,
      firstBlockAppearance: null,
      totalTransactions: 0,
    };
  } catch (error) {
    throw error;
  }
}
