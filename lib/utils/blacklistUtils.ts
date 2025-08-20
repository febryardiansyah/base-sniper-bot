import { stateService } from '../services/state';
import { uniswapV2Blacklist } from './tokenBlacklisted';

export class BlacklistUtils {
  private static ensureBlacklistExists(): void {
    const config = stateService.getConfig();
    if (!config.tokenBlacklist) {
      stateService.set('tokenBlacklist', [...uniswapV2Blacklist]);
    }
  }

  static getBlacklist(): string[] {
    this.ensureBlacklistExists();
    return stateService.get<string[]>('tokenBlacklist') || [];
  }

  static addToBlacklist(tokenName: string): boolean {
    this.ensureBlacklistExists();
    const blacklist = this.getBlacklist();
    const normalizedToken = tokenName.trim();

    if (!blacklist.includes(normalizedToken)) {
      blacklist.push(normalizedToken);
      stateService.set('tokenBlacklist', blacklist);
      return true;
    }
    return false;
  }

  static removeFromBlacklist(tokenName: string): boolean {
    this.ensureBlacklistExists();
    const blacklist = this.getBlacklist();
    const normalizedToken = tokenName.trim();
    const index = blacklist.indexOf(normalizedToken);

    if (index > -1) {
      blacklist.splice(index, 1);
      stateService.set('tokenBlacklist', blacklist);
      return true;
    }
    return false;
  }

  static isBlacklisted(tokenName: string): boolean {
    this.ensureBlacklistExists();
    const blacklist = this.getBlacklist();
    return blacklist.includes(tokenName.trim());
  }

  static clearBlacklist(): void {
    stateService.set('tokenBlacklist', []);
  }

  static resetToDefault(): void {
    stateService.set('tokenBlacklist', [...uniswapV2Blacklist]);
  }

  static isBlacklistedCaseInsensitive(tokenName: string): boolean {
    const blacklist = this.getBlacklist();
    const lowerTokenName = tokenName.toLowerCase().trim();

    return blacklist.some(
      blacklistedToken => blacklistedToken.toLowerCase().trim() === lowerTokenName
    );
  }

  static containsBlacklistedSubstring(tokenName: string): boolean {
    const blacklist = this.getBlacklist();
    const lowerTokenName = tokenName.toLowerCase().trim();

    return blacklist.some(blacklistedToken =>
      lowerTokenName.includes(blacklistedToken.toLowerCase().trim())
    );
  }

  static getBlacklistStats(): {
    total: number;
    tokens: string[];
    lastModified?: Date;
  } {
    const blacklist = this.getBlacklist();
    return {
      total: blacklist.length,
      tokens: [...blacklist],
      lastModified: new Date(),
    };
  }
}

export const {
  isBlacklisted,
  getBlacklist,
  addToBlacklist,
  removeFromBlacklist,
  clearBlacklist,
  resetToDefault,
  isBlacklistedCaseInsensitive,
  containsBlacklistedSubstring,
  getBlacklistStats,
} = BlacklistUtils;
