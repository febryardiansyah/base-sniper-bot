import 'dotenv/config';
import { Commitment, Connection, LogsCallback, PublicKey } from '@solana/web3.js';
export type ParsedInitMint = {
  program: 'spl-token' | 'spl-token-2022' | string;
  type: string; // initializeMint | initializeMint2 | initializeMint3...
  mint: string;
  decimals?: number;
  mintAuthority?: string;
  freezeAuthority?: string | null;
};

type AnyParsedIx = {
  program?: string;
  programId?: string;
  parsed?: {
    type?: string;
    info?: any;
  };
};

export function extractInitializeMintIx(
  tx: import('@solana/web3.js').ParsedTransactionWithMeta | null
): ParsedInitMint[] {
  if (!tx) return [];

  const out: ParsedInitMint[] = [];

  const scan = (ixs: AnyParsedIx[]) => {
    for (const ix of ixs) {
      const p = ix.parsed;
      if (!p || !p.type) continue;
      const t = p.type.toLowerCase();
      // tangkap berbagai varian initializeMint (token-2022 punya variasi + extensions)
      if (t.startsWith('initializemint')) {
        const info = p.info || {};
        const program = ix.program || 'unknown';
        const mint =
          info.mint ||
          info.account || // fallback kalau parser lain
          null;
        if (mint) {
          out.push({
            program: program as any,
            type: p.type,
            mint,
            decimals: info.decimals,
            mintAuthority: info.mintAuthority,
            freezeAuthority: info.freezeAuthority ?? null,
          });
        }
      }
    }
  };

  // top-level instructions
  // @ts-ignore - web3 types allow this
  scan(tx.transaction.message.instructions as AnyParsedIx[]);

  // inner instructions
  if (tx.meta?.innerInstructions?.length) {
    for (const inner of tx.meta.innerInstructions) {
      // @ts-ignore
      scan(inner.instructions as AnyParsedIx[]);
    }
  }

  return out;
}

const RPC_URL =
  process.env.RPC_URL ||
  'https://mainnet.helius-rpc.com/?api-key=759c85d0-89c6-4d47-9905-23a982ff877c';
const COMMITMENT = (process.env.COMMITMENT as Commitment) || 'confirmed';

// SPL Token Program (legacy)
const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
// SPL Token-2022 Program
const TOKEN_2022_PROGRAM = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

async function main() {
  const connection = new Connection(RPC_URL, {
    commitment: 'confirmed',
    wsEndpoint: 'wss://mainnet.helius-rpc.com/?api-key=759c85d0-89c6-4d47-9905-23a982ff877c', // use the same URL for WebSocket
  });

  console.log(`[i] Connecting to ${RPC_URL} (commitment=${COMMITMENT})`);

  const handler: LogsCallback = async (logs, ctx) => {
    try {
      const sig = logs.signature;
      // only process if logs indicate success to reduce fetches
      if (!logs.err) {
        const tx = await connection.getParsedTransaction(sig, {
          maxSupportedTransactionVersion: 0, // handle v0
          commitment: 'confirmed',
        });

        const mints = extractInitializeMintIx(tx);
        if (mints.length) {
          for (const m of mints) {
            console.log('──────────────────────────────────────────');
            console.log(`[NEW MINT DETECTED] via ${m.program} / ${m.type}`);
            console.log(`• Signature     : ${sig}`);
            console.log(`• Slot          : ${ctx.slot}`);
            console.log(`• Mint Address  : ${m.mint}`);
            if (typeof m.decimals === 'number') console.log(`• Decimals      : ${m.decimals}`);
            if (m.mintAuthority) console.log(`• Mint Authority: ${m.mintAuthority}`);
            console.log(`• Freeze Auth   : ${m.freezeAuthority ?? '(none or not set)'}`);
            console.log('──────────────────────────────────────────\n');
          }
        }
      }
    } catch (e) {
      console.error('[!] Error in logs handler:', e);
    }
  };

  // Subscribe to both Token programs
  const sub1 = connection.onLogs(TOKEN_PROGRAM, handler, COMMITMENT);
  const sub2 = connection.onLogs(TOKEN_2022_PROGRAM, handler, COMMITMENT);

  console.log('[i] Subscribed to SPL Token program logs:');
  console.log('    - TOKEN_PROGRAM    :', TOKEN_PROGRAM.toBase58());
  console.log('    - TOKEN_2022_PROG  :', TOKEN_2022_PROGRAM.toBase58());
  console.log('[i] Listening for initializeMint events...');

  // optional: graceful shutdown
  const shutdown = async () => {
    console.log('\n[i] Shutting down subscriptions...');
    try {
      await connection.removeOnLogsListener(await sub1);
      await connection.removeOnLogsListener(await sub2);
    } catch {}
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
