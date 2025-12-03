import { existsSync, readFileSync } from 'fs';
import { networkInterfaces } from 'os';
import { parse } from 'yaml';
import { appConfigSchema, type AppConfig } from './schema.js';

const CONFIG_PATHS = ['./config.yaml', './config.yml', '/config/config.yaml'];

function detectLanIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

export function loadConfig(): AppConfig {
  const configPath = CONFIG_PATHS.find(p => existsSync(p));

  let fileConfig = {};
  if (configPath) {
    const raw = readFileSync(configPath, 'utf-8');
    fileConfig = parse(raw) ?? {};
  }

  const envConfig: Record<string, unknown> = {};

  if (process.env.SERVER_IP) {
    envConfig.serverIp = process.env.SERVER_IP;
  }

  if (process.env.LAN_IP) {
    envConfig.lanIp = process.env.LAN_IP;
  } else {
    envConfig.lanIp = detectLanIp();
  }

  if (process.env.PORT) {
    envConfig.port = parseInt(process.env.PORT, 10);
  }

  return appConfigSchema.parse({ ...fileConfig, ...envConfig });
}

export const loadConfigAsync = async (): Promise<AppConfig> => loadConfig();
