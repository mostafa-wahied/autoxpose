import React from 'react';
import type { ServiceRecord } from '../../lib/api';
import {
  type CommandContext,
  type CommandResult,
  type CommandSuggestion,
  type OutputLine,
} from './command-types';
import { executeCommand } from './command-engine';
import { useConsoleHistory, useConsoleOutputs, useConsoleSuggestions } from './command-hooks';
import { useKeyRuntime } from './command-key-runtime';

type UseCommandConsoleProps = {
  services: ServiceRecord[];
  settings: CommandContext['settings'];
  onExpose: (service: ServiceRecord) => void;
  onUnexpose: (service: ServiceRecord) => void;
  onToggleSettings: (open: boolean) => void;
  onScan: () => void;
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
    onScan: props.onScan,
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
  onScan: () => void;
}): (result: Awaited<ReturnType<typeof executeCommand>>) => void {
  return React.useCallback(
    (result: Awaited<ReturnType<typeof executeCommand>>): void => {
      if (result.clearOutput) args.outputs.clear();
      if (result.lines.length > 0) args.outputs.add(result.lines);
      if (result.openSettings) args.onToggleSettings(true);
      if (result.openUrl) window.open(result.openUrl, '_blank', 'noopener');
      if (result.scan) args.onScan();
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
}): (override?: string) => Promise<void> {
  return React.useCallback(
    async (override?: string): Promise<void> => {
      const raw = override ?? args.input;
      const trimmed = raw.trim();
      if (!trimmed) return;
      args.history.push(trimmed);
      const ctx: CommandContext = { services: args.services, settings: args.settings };
      const result = await executeCommand(trimmed, ctx);
      const merged: CommandResult =
        result.lines.length > 0
          ? {
              ...result,
              lines: [
                { ...result.lines[0], text: `${trimmed}> ${result.lines[0].text}` },
                ...result.lines.slice(1),
              ],
            }
          : { ...result, lines: [{ text: trimmed, tone: 'info' }] };
      args.applyResult(merged);
      args.setInput('');
    },
    [args]
  );
}
