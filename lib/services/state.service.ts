import fs from 'fs';
import path from 'path';
import { IState, IStateServiceOptions } from '../interface/state.interface';

export class StateService {
  private configPath: string;
  private autoSave: boolean;
  private encoding: BufferEncoding;
  private config: IState;

  constructor(options: IStateServiceOptions = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    const defaultConfigFile = isProduction ? 'state.json' : 'state-dev.json';
    this.configPath = options.configPath || path.resolve(process.cwd(), defaultConfigFile);
    this.autoSave = options.autoSave ?? true;
    this.encoding = options.encoding || 'utf8';
    this.config = this.loadConfig();
  }

  private loadConfig(): IState {
    try {
      const configData = fs.readFileSync(this.configPath, this.encoding);
      const config = JSON.parse(configData) as IState;
      return config;
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
}

export const stateService = new StateService();
