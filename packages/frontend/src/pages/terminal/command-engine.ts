import { api, type ServiceRecord, type SettingsStatus } from '../../lib/api';
import { getLuckyLine } from './command-lucky';
import { resolveService } from './command-utils';

export type CommandTone = 'info' | 'success' | 'error' | 'muted';

export type OutputLine = { text: string; tone: CommandTone };

export type CommandResult = {
  lines: OutputLine[];
  clearOutput?: boolean;
  openSettings?: boolean;
  exposeServiceId?: string;
  unexposeServiceId?: string;
  openUrl?: string;
  scan?: boolean;
};

export type CommandContext = { services: ServiceRecord[]; settings: SettingsStatus | undefined };

export type CommandSuggestion = { id: string; label: string; value: string };

export const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

export function toneColor(tone: CommandTone): string {
  if (tone === 'success') return '#3fb950';
  if (tone === 'error') return '#f85149';
  if (tone === 'muted') return '#8b949e';
  return '#58a6ff';
}

type ParsedCommand = { name: string; arg: string };
type HandlerMap = Record<
  string,
  (arg: string, ctx: CommandContext) => CommandResult | Promise<CommandResult>
>;

const SIMPLE_HANDLERS: HandlerMap = {
  help: (arg: string): CommandResult => helpResult(arg),
  list: (_arg: string, ctx: CommandContext): CommandResult => ({ lines: listLines(ctx.services) }),
  status: (_arg: string, ctx: CommandContext): CommandResult => ({
    lines: [statusLine(ctx.services, ctx.settings)],
  }),
  config: (): CommandResult => ({
    lines: [{ text: 'Opening settings panel.', tone: 'info' }],
    openSettings: true,
  }),
  clear: (): CommandResult => ({ lines: [], clearOutput: true }),
  iamfeelinglucky: (): CommandResult => ({ lines: [{ text: getLuckyLine(), tone: 'info' }] }),
};

export async function executeCommand(raw: string, ctx: CommandContext): Promise<CommandResult> {
  const parsed = parseCommand(raw);
  if (!parsed) return { lines: [] };
  const simple = SIMPLE_HANDLERS[parsed.name];
  if (simple) {
    const out = simple(parsed.arg, ctx);
    return out instanceof Promise ? await out : out;
  }
  if (parsed.name === 'expose' || parsed.name === 'unexpose')
    return exposeResult(parsed.name, parsed.arg, ctx.services);
  if (parsed.name === 'test') return testResult(parsed.arg);
  if (parsed.name === 'open') return openResult(parsed.arg, ctx.services, ctx.settings);
  if (parsed.name === 'scan') return scanResult();
  if (parsed.name === 'wildcard') return wildcardResult(parsed.arg, ctx.settings);
  return { lines: [{ text: "Unknown command. Try 'help'.", tone: 'error' }] };
}

function parseCommand(raw: string): ParsedCommand | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const [cmd, ...rest] = trimmed.split(' ');
  return { name: cmd.toLowerCase(), arg: rest.join(' ').trim() };
}

function helpResult(arg: string): CommandResult {
  const entries: { cmd: string; desc: string }[] = [
    { cmd: 'help', desc: 'help | help <command> for details' },
    { cmd: 'list', desc: 'list services with index' },
    { cmd: 'status', desc: 'show DNS/Proxy status and counts' },
    { cmd: 'expose', desc: 'expose <service> by name, subdomain, or index' },
    { cmd: 'unexpose', desc: 'unexpose <service> by name, subdomain, or index' },
    { cmd: 'test', desc: 'test dns | test proxy' },
    { cmd: 'open', desc: 'open <service> to launch exposed URL' },
    { cmd: 'config', desc: 'toggle settings panel' },
    { cmd: 'clear', desc: 'clear terminal output' },
    { cmd: 'iamfeelinglucky', desc: 'random tip or quip' },
    { cmd: 'scan', desc: 'scan for services' },
    { cmd: 'wildcard', desc: 'wildcard status | enable <domain> | disable' },
  ];
  const key = arg.trim().toLowerCase();
  if (!key) {
    const lines: OutputLine[] = [{ text: 'Commands:', tone: 'info' }];
    return {
      lines: [
        ...lines,
        ...entries.map(entry => ({
          text: `${entry.cmd.padEnd(14, ' ')} - ${entry.desc}`,
          tone: 'muted' as const,
        })),
      ],
    };
  }
  const match = entries.find(e => e.cmd === key);
  if (!match) return { lines: [{ text: 'Unknown command. Try help.', tone: 'error' }] };
  return { lines: [{ text: match.desc, tone: 'info' }] };
}

function listLines(services: ServiceRecord[]): OutputLine[] {
  if (services.length === 0) {
    return [{ text: 'No services found. Run a scan to discover containers.', tone: 'muted' }];
  }
  return services.map((svc, idx) => {
    const status = svc.enabled ? 'exposed' : 'hidden';
    return {
      text: `${idx + 1}. ${svc.name} | ${svc.subdomain || 'no-domain'} | ${status}`,
      tone: 'info',
    };
  });
}

function statusLine(services: ServiceRecord[], settings: SettingsStatus | undefined): OutputLine {
  const isWildcard = settings?.wildcard?.enabled ?? false;
  const dnsOk = isWildcard ? 'wildcard' : settings?.dns?.configured ? 'ok' : 'missing';
  const proxyOk = settings?.proxy?.configured ? 'ok' : 'missing';
  const count = `${services.filter(s => s.enabled).length}/${services.length} exposed`;
  const warnings: string[] = [];
  const serverState = settings?.network?.serverIpState;
  const lanState = settings?.network?.lanIpState;
  if (serverState && !['valid', 'mismatch'].includes(serverState)) warnings.push('server ip issue');
  if (lanState && !['valid', 'bridge-autodetected', 'mismatch'].includes(lanState))
    warnings.push('lan ip issue');
  const warnText = warnings.length > 0 ? ` | warnings: ${warnings.join(', ')}` : '';
  return {
    text: `DNS: ${dnsOk} | Proxy: ${proxyOk} | Services: ${count}${warnText}`,
    tone: 'info',
  };
}

function exposeResult(name: string, arg: string, services: ServiceRecord[]): CommandResult {
  const svc = resolveService(arg, services);
  if (!svc)
    return { lines: [{ text: 'Service not found. Use list to view services.', tone: 'error' }] };
  if (name === 'expose' && svc.enabled) {
    return { lines: [{ text: `${svc.name} is already exposed.`, tone: 'muted' }] };
  }
  if (name === 'unexpose' && !svc.enabled) {
    return { lines: [{ text: `${svc.name} is not exposed.`, tone: 'muted' }] };
  }
  const actionText = name === 'expose' ? 'Exposing' : 'Unexposing';
  const lines: OutputLine[] = [
    { text: `${actionText} ${svc.name} (${svc.subdomain})`, tone: 'info' },
  ];
  return name === 'expose'
    ? { lines, exposeServiceId: svc.id }
    : { lines, unexposeServiceId: svc.id };
}

async function testResult(arg: string): Promise<CommandResult> {
  if (arg !== 'dns' && arg !== 'proxy') {
    return { lines: [{ text: 'usage: test dns | test proxy', tone: 'error' }] };
  }
  try {
    const fn = arg === 'dns' ? api.settings.testDns : api.settings.testProxy;
    const res = await fn();
    if (res.ok) return { lines: [{ text: `test ${arg} passed`, tone: 'success' }] };
    return {
      lines: [{ text: `test ${arg} failed: ${res.error || 'unknown error'}`, tone: 'error' }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Request failed';
    return { lines: [{ text: `test ${arg} failed: ${msg}`, tone: 'error' }] };
  }
}

function openResult(
  arg: string,
  services: ServiceRecord[],
  settings: SettingsStatus | undefined
): CommandResult {
  const svc = resolveService(arg, services);
  if (!svc) return { lines: [{ text: 'Service not found. Use list to pick one.', tone: 'error' }] };
  if (!svc.enabled)
    return { lines: [{ text: 'Service is not exposed. Expose it first.', tone: 'error' }] };
  const url = buildUrl(svc, settings);
  if (!url) return { lines: [{ text: 'No domain found for this service.', tone: 'error' }] };
  return { lines: [{ text: `Open: ${url}`, tone: 'info' }], openUrl: url };
}

function scanResult(): CommandResult {
  return {
    lines: [
      { text: 'Scanning for services...', tone: 'info' },
      { text: 'Scan started. Check status for counts.', tone: 'muted' },
    ],
    scan: true,
  };
}

function buildUrl(service: ServiceRecord, settings: SettingsStatus | undefined): string | null {
  const base = service.subdomain || '';
  if (!base) return null;
  const baseDomain =
    settings?.wildcard?.enabled && settings?.wildcard?.domain
      ? settings.wildcard.domain
      : settings?.dns?.domain;
  const domain = base.includes('.') || !baseDomain ? base : `${base}.${baseDomain}`;
  return domain.startsWith('http') ? domain : `https://${domain}`;
}

function wildcardStatusResult(settings: SettingsStatus | undefined): CommandResult {
  const enabled = settings?.wildcard?.enabled ?? false;
  const domain = settings?.wildcard?.domain;
  const hasCert = settings?.wildcard?.certId !== null && settings?.wildcard?.certId !== undefined;

  if (!enabled) {
    return { lines: [{ text: 'Wildcard mode: disabled', tone: 'muted' }] };
  }

  const certStatus = hasCert ? 'linked' : 'not detected';
  return {
    lines: [
      { text: `Wildcard mode: enabled`, tone: 'success' },
      { text: `Domain: *.${domain}`, tone: 'info' },
      { text: `Certificate: ${certStatus}`, tone: hasCert ? 'info' : 'muted' },
    ],
  };
}

async function wildcardEnableResult(domain: string | undefined): Promise<CommandResult> {
  if (!domain) {
    return { lines: [{ text: 'Usage: wildcard enable <domain>', tone: 'error' }] };
  }
  try {
    await api.settings.saveWildcard(true, domain);
    return {
      lines: [
        { text: `Wildcard mode enabled for *.${domain}`, tone: 'success' },
        { text: 'DNS creation will be skipped for new exposures.', tone: 'muted' },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to enable wildcard mode';
    return { lines: [{ text: msg, tone: 'error' }] };
  }
}

async function wildcardDisableResult(): Promise<CommandResult> {
  try {
    await api.settings.saveWildcard(false, '');
    return {
      lines: [
        { text: 'Wildcard mode disabled. DNS will be created per service.', tone: 'success' },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to disable wildcard mode';
    return { lines: [{ text: msg, tone: 'error' }] };
  }
}

async function wildcardResult(
  arg: string,
  settings: SettingsStatus | undefined
): Promise<CommandResult> {
  const parts = arg.trim().split(' ');
  const subcommand = parts[0]?.toLowerCase() || 'status';

  if (subcommand === 'status') return wildcardStatusResult(settings);
  if (subcommand === 'enable') return wildcardEnableResult(parts[1]);
  if (subcommand === 'disable') return wildcardDisableResult();

  return { lines: [{ text: 'Usage: wildcard status | enable <domain> | disable', tone: 'error' }] };
}
