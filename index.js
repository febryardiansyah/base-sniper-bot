"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var ethers_1 = require("ethers");
var dotenv = require("dotenv");
var axios_1 = require("axios");
var Router_json_1 = require("./abi/Router.json");
dotenv.config();
var provider = new ethers_1.ethers.WebSocketProvider(process.env.ALCHEMY_WS_URL);
var TELEGRAM_URL = "https://api.telegram.org/bot".concat(process.env.TELEGRAM_BOT_TOKEN, "/sendMessage");
var WETH = process.env.WETH_ADDRESS.toLowerCase();
var BIG_BUY_THRESHOLD = ethers_1.ethers.parseEther(process.env.BIG_BUY_THRESHOLD || "10");
// Example: Aerodrome or Uniswap router address on Base
var ROUTERS = [
    "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86", // Aerodrome Router
    "0x3c8f2a86d9749f1f9d8f850ea0d727abe80b62d6" // Uniswap V2 Router on Base
];
ROUTERS.forEach(function (routerAddress) {
    var contract = new ethers_1.ethers.Contract(routerAddress, Router_json_1.default, provider);
    contract.on("Swap", function (sender, amountIn, amountOutMin, path, to) { return __awaiter(void 0, void 0, void 0, function () {
        var inputToken, outputToken, ethAmount, msg;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    if (!Array.isArray(path))
                        return [2 /*return*/];
                    inputToken = (_a = path[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                    outputToken = (_b = path[path.length - 1]) === null || _b === void 0 ? void 0 : _b.toLowerCase();
                    if (!(inputToken === WETH && ethers_1.ethers.BigNumber.from(amountIn).gte(BIG_BUY_THRESHOLD))) return [3 /*break*/, 2];
                    ethAmount = ethers_1.ethers.formatEther(amountIn);
                    msg = "\uD83D\uDEA8 *BIG BUY ON BASE*\n\n" +
                        "\uD83D\uDC64 From: `".concat(sender, "`\n") +
                        "\uD83D\uDCB0 Spent: *".concat(ethAmount, " ETH*\n") +
                        "\uD83D\uDCE6 Bought token: `".concat(outputToken, "`\n") +
                        "\uD83D\uDD01 Via: ".concat(routerAddress.slice(0, 6), "...");
                    return [4 /*yield*/, axios_1.default.post(TELEGRAM_URL, {
                            chat_id: process.env.TELEGRAM_CHAT_ID,
                            text: msg,
                            parse_mode: "Markdown",
                        })];
                case 1:
                    _c.sent();
                    console.log("[ALERT] ".concat(ethAmount, " ETH used to buy ").concat(outputToken));
                    _c.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    }); });
});
