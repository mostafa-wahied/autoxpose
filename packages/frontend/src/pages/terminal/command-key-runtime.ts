import React from 'react';
import { KONAMI_SEQUENCE } from './command-engine';
import { useConsoleHistory, useConsoleOutputs, useConsoleSuggestions } from './command-hooks';

export type KeyRuntimeArgs = {
  setInput: (v: string) => void;
  outputs: ReturnType<typeof useConsoleOutputs>;
  suggestions: ReturnType<typeof useConsoleSuggestions>;
  history: ReturnType<typeof useConsoleHistory>;
  runCommand: (override?: string) => Promise<void>;
  keyBuffer: React.MutableRefObject<string[]>;
};

export function useKeyRuntime(args: KeyRuntimeArgs): {
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSuggestionClick: (value: string) => void;
} {
  const modeRef = React.useRef<'history' | 'suggestions'>('history');
  React.useEffect(() => {
    if (args.suggestions.list.length === 0) modeRef.current = 'history';
  }, [args.suggestions.list.length]);
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      if (!isNavKey(e.key)) modeRef.current = 'history';
      if (handleKonami(e, args)) return;
      if (handleArrowKey(e, args, modeRef)) return;
      if (handleTabKey(e, args, modeRef)) return;
      void handleEnterKey(e, args, modeRef);
    },
    [args]
  );
  const onSuggestionClick = React.useCallback(
    (value: string): void => {
      modeRef.current = 'history';
      args.setInput(value);
    },
    [args]
  );
  return { onKeyDown, onSuggestionClick };
}

function handleKonami(e: React.KeyboardEvent<HTMLInputElement>, args: KeyRuntimeArgs): boolean {
  const buffer = updateKeyBuffer(args.keyBuffer, e.key);
  if (!konamiMatched(buffer)) return false;
  e.preventDefault();
  args.setInput('');
  args.outputs.add([
    {
      text: 'Achievement Unlocked: Retro Gamer. Nothing happened. What did you expect?',
      tone: 'info',
    },
  ]);
  return true;
}

function handleArrowKey(
  e: React.KeyboardEvent<HTMLInputElement>,
  args: KeyRuntimeArgs,
  modeRef: React.MutableRefObject<'history' | 'suggestions'>
): boolean {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return false;
  e.preventDefault();
  if (modeRef.current === 'suggestions' && args.suggestions.list.length > 0) {
    const delta = e.key === 'ArrowUp' ? -1 : 1;
    const next = clampIndex(args.suggestions.selected + delta, args.suggestions.list.length);
    args.suggestions.setSelected(next);
    return true;
  }
  const value = args.history.navigate(e.key === 'ArrowUp' ? 'up' : 'down');
  if (value !== null) args.setInput(value);
  return true;
}

function handleTabKey(
  e: React.KeyboardEvent<HTMLInputElement>,
  args: KeyRuntimeArgs,
  modeRef: React.MutableRefObject<'history' | 'suggestions'>
): boolean {
  if (e.key !== 'Tab' || args.suggestions.list.length === 0) return false;
  e.preventDefault();
  if (modeRef.current === 'history') {
    modeRef.current = 'suggestions';
    args.suggestions.setSelected(0);
    const first = args.suggestions.list[0];
    if (first) args.setInput(first.value);
    return true;
  }
  const choice = args.suggestions.list[args.suggestions.selected];
  if (choice) args.setInput(choice.value);
  return true;
}

function handleEnterKey(
  e: React.KeyboardEvent<HTMLInputElement>,
  args: KeyRuntimeArgs,
  modeRef: React.MutableRefObject<'history' | 'suggestions'>
): boolean {
  if (e.key !== 'Enter') return false;
  e.preventDefault();
  const choice = args.suggestions.list[args.suggestions.selected];
  if (modeRef.current === 'suggestions' && choice) {
    args.setInput(choice.value);
    void args.runCommand(choice.value);
    modeRef.current = 'history';
    return true;
  }
  void args.runCommand();
  modeRef.current = 'history';
  return true;
}

function updateKeyBuffer(ref: React.MutableRefObject<string[]>, key: string): string[] {
  const next = [...ref.current, key].slice(-KONAMI_SEQUENCE.length);
  ref.current = next;
  return next;
}

function konamiMatched(buffer: string[]): boolean {
  if (buffer.length !== KONAMI_SEQUENCE.length) return false;
  return KONAMI_SEQUENCE.every((key, idx) => buffer[idx].toLowerCase() === key.toLowerCase());
}

function clampIndex(next: number, length: number): number {
  if (length === 0) return 0;
  return Math.max(0, Math.min(length - 1, next));
}

function isNavKey(key: string): boolean {
  return key === 'ArrowUp' || key === 'ArrowDown' || key === 'Tab' || key === 'Enter';
}
