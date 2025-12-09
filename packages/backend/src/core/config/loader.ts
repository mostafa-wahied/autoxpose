import { existsSync, readFileSync } from 'fs';
import { networkInterfaces } from 'os';
import { parse } from 'yaml';
import { appConfigSchema, type AppConfig } from './schema.js';

const CONFIG_PATHS = ['./config.yaml', './config.yml', '/config/config.yaml'];

function detectLanIp(): string {
  const nets = networkInterfaces();
  const candidates: string[] = [];
  for (const name of Object.keys(nets)) {
    if (isBridgeInterface(name)) continue;
    for (const net of nets[name] ?? []) {
      if (net.family !== 'IPv4') continue;
      if (net.internal) continue;
      if (isLinkLocal(net.address)) continue;
      candidates.push(net.address);
    }
  }
  const preferred = pickPreferredIp(candidates);
  return preferred ?? 'localhost';
}

function pickPreferredIp(ips: string[]): string | null {
  const byPriority = [
    (ip: string): boolean => ip.startsWith('10.'),
    (ip: string): boolean => ip.startsWith('192.168.'),
    (ip: string): boolean => ip.startsWith('172.') && isPrivate172(ip),
    (): boolean => true,
  ];
  for (const match of byPriority) {
    const found = ips.find(ip => match(ip));
    if (found) return found;
  }
  return null;
}

function isBridgeInterface(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('docker') || lower.startsWith('br-') || lower.startsWith('veth');
}

function isLinkLocal(ip: string): boolean {
  return ip.startsWith('169.254.');
}

function isPrivate172(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length < 2) return false;
  const second = Number(parts[1]);
  return second >= 16 && second <= 31 && !ip.startsWith('172.17.') && !ip.startsWith('172.18.');
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

  const dockerEnv: Record<string, unknown> = {};
  if (process.env.DOCKER_HOST) {
    dockerEnv.host = process.env.DOCKER_HOST;
  }
  if (process.env.DOCKER_SOCKET) {
    dockerEnv.socketPath = process.env.DOCKER_SOCKET;
  }
  if (Object.keys(dockerEnv).length > 0) {
    envConfig.docker = dockerEnv;
  }

  return appConfigSchema.parse({ ...fileConfig, ...envConfig });
}

export const loadConfigAsync = async (): Promise<AppConfig> => loadConfig();
