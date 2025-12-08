import { api, type ServiceRecord, type SettingsStatus } from '../../lib/api';
import { getLuckyLine } from './command-lucky';
import { type CommandContext, type CommandResult, type OutputLine } from './command-types';
import { resolveService } from './command-utils';
import { COMMAND_HINT } from './command-constants';

type ParsedCommand = { name: string; arg: string };
type HandlerMap = Record<
  string,
  (arg: string, ctx: CommandContext) => CommandResult | Promise<CommandResult>
>;

const SIMPLE_HANDLERS: HandlerMap = {
  help: (arg: string): CommandResult => ({ lines: [{ text: helpText(arg), tone: 'info' }] }),
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
  '?': (): CommandResult => ({ lines: [{ text: COMMAND_HINT, tone: 'muted' }] }),
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
  return { lines: [{ text: "Unknown command. Try 'help'.", tone: 'error' }] };
}

function parseCommand(raw: string): ParsedCommand | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const [cmd, ...rest] = trimmed.split(' ');
  return { name: cmd.toLowerCase(), arg: rest.join(' ').trim() };
}

function helpText(arg: string): string {
  const base =
    'Commands: help, list, status, expose, unexpose, test dns, test proxy, open, config, clear, iamfeelinglucky, ?';
  const key = arg.toLowerCase();
  if (!key) return base;
  const map: Record<string, string> = {
    expose: 'expose <service> | pick by name, subdomain, or list index',
    unexpose: 'unexpose <service> | pick by name, subdomain, or list index',
    test: 'test dns | test proxy',
    open: 'open <service> | show the exposed URL',
    config: 'config | toggle settings panel',
    clear: 'clear | clear output',
    list: 'list | show services with index',
    status: 'status | show DNS/Proxy state and counts',
    iamfeelinglucky: 'iamfeelinglucky | random tip or quip',
    '?': '? | quick usage hints',
  };
  return map[key] || 'Unknown command. Try help.';
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
  const dnsOk = settings?.dns?.configured ? 'ok' : 'missing';
  const proxyOk = settings?.proxy?.configured ? 'ok' : 'missing';
  const count = `${services.filter(s => s.enabled).length}/${services.length} exposed`;
  const warnings: string[] = [];
  if (settings?.network?.serverIpWarning) warnings.push('public ip missing');
  if (settings?.network?.lanIpWarning) warnings.push('lan ip warning');
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

function buildUrl(service: ServiceRecord, settings: SettingsStatus | undefined): string | null {
  const base = service.subdomain || '';
  if (!base) return null;
  const domain =
    base.includes('.') || !settings?.dns?.domain ? base : `${base}.${settings.dns.domain}`;
  return domain.startsWith('http') ? domain : `https://${domain}`;
}
