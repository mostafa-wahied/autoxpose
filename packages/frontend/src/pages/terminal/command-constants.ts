import type { CommandTone } from './command-types';

export const COMMAND_HINT = 'list | status | expose <service> | test dns | test proxy | config';

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
