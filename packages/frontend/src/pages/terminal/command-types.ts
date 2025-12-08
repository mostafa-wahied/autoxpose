import type { ServiceRecord, SettingsStatus } from '../../lib/api';

export type CommandTone = 'info' | 'success' | 'error' | 'muted';

export type OutputLine = { text: string; tone: CommandTone };

export type CommandResult = {
  lines: OutputLine[];
  clearOutput?: boolean;
  openSettings?: boolean;
  exposeServiceId?: string;
  unexposeServiceId?: string;
  openUrl?: string;
};

export type CommandContext = { services: ServiceRecord[]; settings: SettingsStatus | undefined };

export type CommandSuggestion = { id: string; label: string; value: string };
