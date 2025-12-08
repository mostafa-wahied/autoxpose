import type { CommandTone } from './command-types';

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
