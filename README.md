# Base Chain Sniper Bot 🎯

A powerful TypeScript bot that monitors the Base blockchain for new token launches with high liquidity and sends real-time alerts to Telegram. Perfect for identifying early investment opportunities and tracking large transactions.

## Features 🚀

- **New Token Detection**: Monitors Uniswap V2 and Aerodrome factories for newly created trading pairs
- **Liquidity Analysis**: Filters tokens based on minimum ETH liquidity requirements
- **Big Buy Alerts**: Tracks large purchases across multiple DEX routers
- **Telegram Integration**: Sends formatted alerts with token details and transaction information
- **Multi-DEX Support**: Monitors both Uniswap V2 and Aerodrome on Base Chain
- **Smart Filtering**: Avoids spam tokens with configurable supply thresholds
- **Real-time Monitoring**: WebSocket connection for instant notifications

## Prerequisites 📋

- Node.js (v16 or higher)
- npm or yarn
- Alchemy API key for Base Chain
- Telegram Bot Token
- Telegram Chat ID

## Installation 🛠️

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd base-snipe-bot
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Copy the `.env` file and update with your credentials:
   ```bash
   cp .env .env.local
   ```

## Configuration ⚙️

### Environment Variables

Update the `.env` file with your configuration:

```env
# Base Chain RPC URLs
ALCHEMY_WS_URL=wss://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY
ALCHEMY_HTTP_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_API_KEY

# Telegram Configuration
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID=YOUR_TELEGRAM_CHAT_ID

# Trading Configuration
BIG_BUY_THRESHOLD=1.0  # Minimum ETH amount to trigger big buy alert
MIN_LIQUIDITY_ETH=5.0  # Minimum liquidity in ETH to trigger new token alert
MAX_SUPPLY_THRESHOLD=1000000000  # Maximum token supply to consider
```

### Getting Required Credentials

#### 1. Alchemy API Key
- Visit [Alchemy](https://www.alchemy.com/)
- Create an account and new app for Base Mainnet
- Copy your API key

#### 2. Telegram Bot Setup
- Message [@BotFather](https://t.me/botfather) on Telegram
- Create a new bot with `/newbot`
- Save the bot token
- Get your chat ID by messaging [@userinfobot](https://t.me/userinfobot)

## Usage 🚀

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

### Build Only
```bash
npm run build
```

## How It Works 🔍

The bot operates in two main monitoring modes:

### 1. New Token Detection
- Listens to `PairCreated` events from Uniswap V2 and Aerodrome factories
- Analyzes new pairs for ETH liquidity
- Filters out tokens with excessive supply
- Sends alerts for high-liquidity new tokens

### 2. Big Buy Monitoring
- Monitors `Swap` events on DEX routers
- Tracks purchases made with ETH above the threshold
- Provides transaction details and token information

## Alert Types 📱

### New Token Alert
```
🎯 NEW HIGH-LIQUIDITY TOKEN DETECTED

🏪 Exchange: Uniswap V2
🪙 Token: EXAMPLE (Example Token)
📍 Address: 0x...
💧 Liquidity: 15.50 ETH
📊 Total Supply: 1,000,000
🔗 Pair: 0x...

⚡ SNIPE OPPORTUNITY DETECTED!
```

### Big Buy Alert
```
🔥 BIG BUY DETECTED ON BASE

👤 Buyer: 0x...
💰 Amount: 5.2500 ETH
🪙 Token: EXAMPLE
📍 Token Address: 0x...
🏪 Router: Uniswap V2
🔗 TX: 0x...

💡 Someone just made a big purchase!
```

## Monitored Contracts 📋

### Factories (New Pair Detection)
- **Uniswap V2 Factory**: `0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6`
- **Aerodrome Factory**: `0x420DD381b31aEf6683db96b3aaC7FF414b03B0b`

### Routers (Swap Monitoring)
- **Uniswap V2 Router**: `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`
- **Aerodrome Router**: `0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43`

### Key Addresses
- **WETH (Base)**: `0x4200000000000000000000000000000000000006`

## Customization 🎛️

### Adjusting Filters

Modify these values in your `.env` file:

- `BIG_BUY_THRESHOLD`: Minimum ETH amount for big buy alerts
- `MIN_LIQUIDITY_ETH`: Minimum liquidity required for new token alerts
- `MAX_SUPPLY_THRESHOLD`: Maximum token supply to avoid spam tokens
- `BLOCK_CONFIRMATION_COUNT`: Number of blocks to wait before processing

### Adding More DEXs

To monitor additional DEXs, add their factory and router contracts to the respective arrays in `index.ts`.

## Error Handling 🛡️

- Automatic retry mechanism for failed requests
- Graceful handling of network disconnections
- Fallback Telegram messaging via HTTP API
- Comprehensive error logging

## Security Considerations 🔒

- Never commit your `.env` file with real credentials
- Use environment variables in production
- Consider rate limiting for high-frequency alerts
- Monitor your Alchemy usage to avoid hitting limits

## Troubleshooting 🔧

### Common Issues

1. **WebSocket Connection Errors**
   - Check your Alchemy API key
   - Ensure you're using the correct Base Chain endpoint

2. **Telegram Messages Not Sending**
   - Verify your bot token and chat ID
   - Ensure the bot is added to your chat/channel

3. **No Alerts Received**
   - Check if thresholds are set too high
   - Verify contract addresses are correct
   - Monitor console logs for errors

### Debug Mode

Enable detailed logging by setting:
```env
NODE_ENV=development
```

## Contributing 🤝

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Disclaimer ⚠️

This bot is for educational and informational purposes only. Always do your own research before making any investment decisions. The authors are not responsible for any financial losses.

## License 📄

MIT License - see LICENSE file for details.

---

**Happy Sniping! 🎯**