import React from 'react';
import type { ServiceRecord } from '../../lib/api';
import { type CommandSuggestion, type OutputLine } from './command-engine';
import { buildSuggestions } from './command-utils';

const MAX_HISTORY = 50;
const OUTPUT_LIMIT = 200;

export function useConsoleOutputs(): {
  items: (OutputLine & { id: string })[];
  add: (lines: OutputLine[]) => void;
  clear: () => void;
} {
  const [items, setItems] = React.useState<(OutputLine & { id: string })[]>([]);
  const add = React.useCallback((lines: OutputLine[]): void => {
    if (lines.length === 0) return;
    setItems(prev =>
      [
        ...prev,
        ...lines.map((line, idx) => ({ ...line, id: `${Date.now()}-${prev.length + idx}` })),
      ].slice(-OUTPUT_LIMIT)
    );
  }, []);
  const clear = React.useCallback((): void => setItems([]), []);
  return { items, add, clear };
}

export function useConsoleHistory(): {
  push: (entry: string) => void;
  navigate: (dir: 'up' | 'down') => string | null;
} {
  const [entries, setEntries] = React.useState<string[]>([]);
  const [index, setIndex] = React.useState<number | null>(null);
  const push = React.useCallback((entry: string): void => {
    setEntries(prev => [entry, ...prev].slice(0, MAX_HISTORY));
    setIndex(null);
  }, []);
  const navigate = React.useCallback(
    (dir: 'up' | 'down'): string | null => {
      if (entries.length === 0) return null;
      if (dir === 'up') {
        const next = index === null ? 0 : Math.min(index + 1, entries.length - 1);
        setIndex(next);
        return entries[next];
      }
      if (index === null) return null;
      const next = index - 1;
      if (next < 0) {
        setIndex(null);
        return '';
      }
      setIndex(next);
      return entries[next];
    },
    [entries, index]
  );
  return { push, navigate };
}

export function useConsoleSuggestions(): {
  list: CommandSuggestion[];
  selected: number;
  setSelected: (v: number) => void;
  refresh: (value: string, services: ServiceRecord[]) => void;
  clear: () => void;
} {
  const [list, setList] = React.useState<CommandSuggestion[]>([]);
  const [selected, setSelected] = React.useState(0);
  const refresh = React.useCallback((value: string, services: ServiceRecord[]): void => {
    const nextList = buildSuggestions(value, services);
    setList(nextList);
    setSelected(prev => Math.max(0, Math.min(prev, Math.max(nextList.length - 1, 0))));
  }, []);
  const clampedSet = React.useCallback(
    (v: number): void => setSelected(Math.max(0, Math.min(v, Math.max(list.length - 1, 0)))),
    [list.length]
  );
  const clear = React.useCallback((): void => {
    setList([]);
    setSelected(0);
  }, []);
  return { list, selected, setSelected: clampedSet, refresh, clear };
}
