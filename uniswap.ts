import { ethers, Interface } from 'ethers';
import * as dotenv from 'dotenv';
dotenv.config();

// Alamat dan ABI untuk Uniswap v4 PoolManager (ALAMAT INI HANYA CONTOH)
const V4_POOL_MANAGER_ADDRESS = "0x498581ff718922c3f8e6a244956af099b2652b2b"; // GANTI dengan alamat resmi saat rilis
const V4_POOL_MANAGER_ABI = [
    // Event ini membawa struct PoolKey sebagai argumen pertama
    "event PoolInitialized(PoolKey key, uint160 sqrtPriceX96, int24 tick)"
];

const poolManagerInterface = new Interface(V4_POOL_MANAGER_ABI);

// Daftar token dasar yang umum
const BASE_CURRENCIES = [
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2".toLowerCase() // WETH
];

const main = async () => {
    const provider = new ethers.WebSocketProvider(process.env.ALCHEMY_WS_URL!);
    
    console.log("Memantau event PoolInitialized di Uniswap v4...");

    // Membuat filter secara manual karena ABI kompleks
    const filter = {
        address: V4_POOL_MANAGER_ADDRESS,
        topics: [ ethers.id("PoolInitialized((address,address,uint24,int24,address),uint160,int24)") ]
    };

    provider.on(filter, (log) => {
        const parsedLog = poolManagerInterface.parseLog(log);
        if (!parsedLog) return;

        const key = parsedLog.args.key;
        const { currency0, currency1, fee, hooks } = key;

        console.log(`\n🚀 Pool Baru Diinisialisasi (v4)!`);
        
        let newCurrencyAddress: string | null = null;
        
        if (BASE_CURRENCIES.includes(currency0.toLowerCase())) {
            newCurrencyAddress = currency1;
        } else if (BASE_CURRENCIES.includes(currency1.toLowerCase())) {
            newCurrencyAddress = currency0;
        }

        if (newCurrencyAddress) {
            console.log(`✅ Token Baru ditemukan: ${newCurrencyAddress}`);
            console.log(`Dipasangkan dengan: ${BASE_CURRENCIES.includes(currency0.toLowerCase()) ? currency0 : currency1}`);
            console.log(`Fee Tier: ${fee}`);
            console.log(`Hooks Contract: ${hooks}`);
            // Kirim notifikasi
        } else {
            console.log(`- Pool antara dua token yang tidak dikenal: ${currency0} & ${currency1}`);
        }
    });
};

main().catch(console.error);