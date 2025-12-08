import type { ServiceRecord } from '../../lib/api';
import type { CommandSuggestion } from './command-types';

const BASE_COMMANDS = [
  'help',
  'list',
  'status',
  'expose',
  'unexpose',
  'test',
  'open',
  'config',
  'clear',
  'iamfeelinglucky',
  '?',
];

const MAX_SUGGESTIONS = 5;

export function buildSuggestions(value: string, services: ServiceRecord[]): CommandSuggestion[] {
  const trimmed = value.trim();
  if (trimmed.length === 0) return baseCommandSuggestions('');
  const [cmd, ...rest] = trimmed.split(' ');
  const arg = rest.join(' ').trim();
  if (!arg) return baseCommandSuggestions(cmd);
  if (expectsService(cmd)) return serviceSuggestions(cmd, arg, services);
  return [];
}

export function resolveService(query: string, services: ServiceRecord[]): ServiceRecord | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const index = Number(trimmed);
  if (!Number.isNaN(index) && index > 0 && index <= services.length) return services[index - 1];
  const lower = trimmed.toLowerCase();
  const match = services.find(
    svc =>
      svc.name.toLowerCase() === lower ||
      (svc.subdomain || '').toLowerCase() === lower ||
      svc.name.toLowerCase().includes(lower) ||
      (svc.subdomain || '').toLowerCase().includes(lower)
  );
  return match || null;
}

export function baseCommandSuggestions(start: string): CommandSuggestion[] {
  const token = start.toLowerCase();
  return BASE_COMMANDS.filter(c => c.startsWith(token))
    .slice(0, MAX_SUGGESTIONS)
    .map((c, idx) => ({
      id: `${c}-${idx}`,
      label: c,
      value: c,
    }));
}

function expectsService(cmd: string): boolean {
  return cmd === 'expose' || cmd === 'unexpose' || cmd === 'open';
}

function serviceSuggestions(
  cmd: string,
  query: string,
  services: ServiceRecord[]
): CommandSuggestion[] {
  const token = query.toLowerCase();
  return services
    .filter(svc => {
      const idx = services.indexOf(svc) + 1;
      return (
        svc.name.toLowerCase().includes(token) ||
        (svc.subdomain || '').toLowerCase().includes(token) ||
        String(idx).startsWith(token)
      );
    })
    .slice(0, MAX_SUGGESTIONS)
    .map((svc, idx) => ({
      id: `${cmd}-${svc.id}-${idx}`,
      label: `${cmd} ${svc.name} (${svc.subdomain || 'no-domain'})`,
      value: `${cmd} ${svc.subdomain || svc.name}`,
    }));
}
