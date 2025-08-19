import fs from 'fs';
import path from 'path';
import { IState, IStateServiceOptions } from '../interface/state.interface';

export class StateService {
  private configPath: string;
  private autoSave: boolean;
  private encoding: BufferEncoding;
  private config: IState;

  constructor(options: IStateServiceOptions = {}) {
    this.configPath = options.configPath || path.resolve(process.cwd(), 'config.json');
    this.autoSave = options.autoSave ?? true;
    this.encoding = options.encoding || 'utf8';
    this.config = this.loadConfig();
  }

  private loadConfig(): IState {
    try {
      const configData = fs.readFileSync(this.configPath, this.encoding);
      return JSON.parse(configData) as IState;
    } catch (error) {
      console.error('Error loading config:', error);
      throw new Error(`Failed to load configuration: ${error}`);
    }
  }

  private saveConfigToDisk(config: IState): void {
    try {
      const configData = JSON.stringify(config, null, 4);
      fs.writeFileSync(this.configPath, configData, this.encoding);
    } catch (error) {
      console.error('Error saving config:', error);
      throw new Error(`Failed to save configuration: ${error}`);
    }
  }

  public getConfig(): IState {
    return { ...this.config };
  }

  public get<T = unknown>(key: string): T | undefined {
    return this.config[key] as T;
  }

  public set(key: string, value: unknown, save?: boolean): void {
    this.config[key] = value;

    if (save ?? this.autoSave) {
      this.save();
    }
  }

  public update(updates: Partial<IState>, save?: boolean): void {
    Object.assign(this.config, updates);

    if (save ?? this.autoSave) {
      this.save();
    }
  }

  public getCurrentChain(): string {
    return this.config.current_chain || 'base';
  }

  public setCurrentChain(chain: string, save?: boolean): void {
    this.set('current_chain', chain, save);
  }

  public has(key: string): boolean {
    return key in this.config;
  }

  public remove(key: string, save?: boolean): boolean {
    if (key in this.config) {
      delete this.config[key];

      if (save ?? this.autoSave) {
        this.save();
      }
      return true;
    }
    return false;
  }

  public save(): void {
    this.saveConfigToDisk(this.config);
  }

  public reload(): IState {
    this.config = this.loadConfig();
    return this.getConfig();
  }

  public reset(save?: boolean): void {
    if (save ?? this.autoSave) {
      this.save();
    }
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  public exportConfig(space: number = 2): string {
    return JSON.stringify(this.config, null, space);
  }

  public importConfig(jsonString: string, save?: boolean): void {
    try {
      const importedConfig = JSON.parse(jsonString) as IState;
      this.config = importedConfig;

      if (save ?? this.autoSave) {
        this.save();
      }
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error}`);
    }
  }
}

export const stateService = new StateService();
