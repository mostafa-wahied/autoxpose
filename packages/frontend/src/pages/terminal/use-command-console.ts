import React from 'react';
import type { ServiceRecord } from '../../lib/api';
import { type CommandContext, type CommandSuggestion, type OutputLine } from './command-types';
import { executeCommand } from './command-engine';
import { useConsoleHistory, useConsoleOutputs, useConsoleSuggestions } from './command-hooks';
import { KONAMI_SEQUENCE } from './command-constants';

type UseCommandConsoleProps = {
  services: ServiceRecord[];
  settings: CommandContext['settings'];
  onExpose: (service: ServiceRecord) => void;
  onUnexpose: (service: ServiceRecord) => void;
  onToggleSettings: (open: boolean) => void;
};

type CommandConsoleResult = {
  input: string;
  outputs: (OutputLine & { id: string })[];
  suggestions: CommandSuggestion[];
  selectedSuggestion: number;
  setInput: (value: string) => void;
  setSelectedSuggestion: (value: number) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  handleSuggestionClick: (value: string) => void;
};

export function useCommandConsole(props: UseCommandConsoleProps): CommandConsoleResult {
  const [input, setInput] = React.useState('');
  const outputs = useConsoleOutputs();
  const history = useConsoleHistory();
  const suggestions = useConsoleSuggestions();
  const keyBuffer = React.useRef<string[]>([]);

  React.useEffect(() => {
    if (input.length === 0) {
      suggestions.clear();
      return;
    }
    suggestions.refresh(input, props.services);
  }, [input, props.services, suggestions]);

  const applyResult = useApplyResult({
    outputs,
    services: props.services,
    onExpose: props.onExpose,
    onUnexpose: props.onUnexpose,
    onToggleSettings: props.onToggleSettings,
  });

  const runCommand = useRunCommand({
    input,
    setInput,
    history,
    services: props.services,
    settings: props.settings,
    applyResult,
  });

  const runtime = useKeyRuntime({
    setInput,
    outputs,
    suggestions,
    history,
    runCommand,
    keyBuffer,
  });

  return {
    input,
    outputs: outputs.items,
    suggestions: suggestions.list,
    selectedSuggestion: suggestions.selected,
    setInput,
    setSelectedSuggestion: suggestions.setSelected,
    handleKeyDown: runtime.onKeyDown,
    handleSuggestionClick: runtime.onSuggestionClick,
  };
}

function useApplyResult(args: {
  outputs: ReturnType<typeof useConsoleOutputs>;
  services: ServiceRecord[];
  onExpose: (s: ServiceRecord) => void;
  onUnexpose: (s: ServiceRecord) => void;
  onToggleSettings: (open: boolean) => void;
}): (result: Awaited<ReturnType<typeof executeCommand>>) => void {
  return React.useCallback(
    (result: Awaited<ReturnType<typeof executeCommand>>): void => {
      if (result.clearOutput) args.outputs.clear();
      else args.outputs.add(result.lines);
      if (result.openSettings) args.onToggleSettings(true);
      if (result.openUrl) window.open(result.openUrl, '_blank', 'noopener');
      if (result.exposeServiceId) {
        const svc = args.services.find(s => s.id === result.exposeServiceId);
        if (svc) args.onExpose(svc);
      }
      if (result.unexposeServiceId) {
        const svc = args.services.find(s => s.id === result.unexposeServiceId);
        if (svc) args.onUnexpose(svc);
      }
    },
    [args]
  );
}

function useRunCommand(args: {
  input: string;
  setInput: (v: string) => void;
  history: ReturnType<typeof useConsoleHistory>;
  services: ServiceRecord[];
  settings: CommandContext['settings'];
  applyResult: (result: Awaited<ReturnType<typeof executeCommand>>) => void;
}): () => Promise<void> {
  return React.useCallback(async (): Promise<void> => {
    const trimmed = args.input.trim();
    if (!trimmed) return;
    args.history.push(trimmed);
    const ctx: CommandContext = { services: args.services, settings: args.settings };
    const result = await executeCommand(trimmed, ctx);
    args.applyResult(result);
    args.setInput('');
  }, [args]);
}

function useKeyRuntime(args: {
  setInput: (v: string) => void;
  outputs: ReturnType<typeof useConsoleOutputs>;
  suggestions: ReturnType<typeof useConsoleSuggestions>;
  history: ReturnType<typeof useConsoleHistory>;
  runCommand: () => Promise<void>;
  keyBuffer: React.MutableRefObject<string[]>;
}): {
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSuggestionClick: (value: string) => void;
} {
  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>): void => {
      args.keyBuffer.current = [...args.keyBuffer.current, e.key].slice(-KONAMI_SEQUENCE.length);
      if (isKonami(args.keyBuffer.current)) {
        e.preventDefault();
        args.setInput('');
        args.outputs.add([
          {
            text: 'Achievement Unlocked: Retro Gamer. Nothing happened. What did you expect?',
            tone: 'info',
          },
        ]);
        return;
      }
      if (handleNavKeys(e, args.history, args.setInput)) return;
      if (e.key === 'Tab' && args.suggestions.list.length > 0) {
        e.preventDefault();
        args.setInput(args.suggestions.list[args.suggestions.selected].value);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        void args.runCommand();
      }
    },
    [args]
  );
  const onSuggestionClick = React.useCallback(
    (value: string): void => args.setInput(value),
    [args]
  );
  return { onKeyDown, onSuggestionClick };
}

function handleNavKeys(
  e: React.KeyboardEvent<HTMLInputElement>,
  history: ReturnType<typeof useConsoleHistory>,
  setInput: (v: string) => void
): boolean {
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    const value = history.navigate('up');
    if (value !== null) setInput(value);
    return true;
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const value = history.navigate('down');
    if (value !== null) setInput(value);
    return true;
  }
  return false;
}

function isKonami(buffer: string[]): boolean {
  if (buffer.length !== KONAMI_SEQUENCE.length) return false;
  return KONAMI_SEQUENCE.every((key, idx) => buffer[idx].toLowerCase() === key.toLowerCase());
}
