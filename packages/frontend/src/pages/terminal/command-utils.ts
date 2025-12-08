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
  'scan',
  'config',
  'clear',
  'iamfeelinglucky',
];

const MAX_SUGGESTIONS = 5;

export function buildSuggestions(value: string, services: ServiceRecord[]): CommandSuggestion[] {
  const trimmed = value.trim();
  if (trimmed.length === 0) return baseCommandSuggestions('');
  const [cmdRaw, ...rest] = trimmed.split(' ');
  const cmd = cmdRaw.toLowerCase();
  const arg = rest.join(' ').trim();
  const matchesCmd = partialMatchCommand(cmd);
  if (!matchesCmd && !arg) return baseCommandSuggestions(cmd);
  const target = matchesCmd ?? cmd;
  if (target === 'test') return testSuggestions(arg);
  if (target === 'open') return serviceSuggestions(target, arg, services, { enabledOnly: true });
  if (expectsService(target)) return serviceSuggestions(target, arg, services);
  if (target === 'help') return helpSuggestions();
  if (!arg) return baseCommandSuggestions(target);
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
  return cmd === 'expose' || cmd === 'unexpose';
}

function serviceSuggestions(
  cmd: string,
  query: string,
  services: ServiceRecord[],
  opts: { enabledOnly?: boolean } = {}
): CommandSuggestion[] {
  const token = query.toLowerCase();
  return services
    .filter(svc => {
      const idx = services.indexOf(svc) + 1;
      if (opts.enabledOnly && !svc.enabled) return false;
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

function testSuggestions(query: string): CommandSuggestion[] {
  const token = query.toLowerCase();
  const options = ['dns', 'proxy'];
  const base = [{ id: 'test-self', label: 'test', value: 'test' }];
  const args = options
    .filter(opt => opt.startsWith(token))
    .map((opt, idx) => ({
      id: `test-${opt}-${idx}`,
      label: `test ${opt}`,
      value: `test ${opt}`,
    }));
  return [...base, ...args].slice(0, MAX_SUGGESTIONS);
}

function helpSuggestions(): CommandSuggestion[] {
  const items: CommandSuggestion[] = [
    { id: 'help-self', label: 'help', value: 'help' },
    ...BASE_COMMANDS.filter(c => c !== 'help').map((c, idx) => ({
      id: `help-${c}-${idx}`,
      label: `help ${c}`,
      value: `help ${c}`,
    })),
  ];
  return items.slice(0, MAX_SUGGESTIONS);
}

function partialMatchCommand(input: string): string | null {
  const match = BASE_COMMANDS.find(c => c.startsWith(input));
  return match || null;
}
