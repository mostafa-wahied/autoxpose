import { useRef } from 'react';
import { TERMINAL_COLORS } from '../../components/terminal';
import type { ServiceRecord } from '../../lib/api';
import type { CommandTone } from './command-types';
import { toneColor } from './command-constants';
import { useCommandConsole } from './use-command-console';

type CommandConsoleProps = {
  services: ServiceRecord[];
  settings: Awaited<ReturnType<typeof import('../../lib/api').api.settings.status>> | undefined;
  onExpose: (service: ServiceRecord) => void;
  onUnexpose: (service: ServiceRecord) => void;
  onToggleSettings: (open: boolean) => void;
};

export function CommandConsole(props: CommandConsoleProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const {
    input,
    outputs,
    suggestions,
    selectedSuggestion,
    setInput,
    setSelectedSuggestion,
    handleKeyDown,
    handleSuggestionClick,
  } = useCommandConsole({
    services: props.services,
    settings: props.settings,
    onExpose: props.onExpose,
    onUnexpose: props.onUnexpose,
    onToggleSettings: props.onToggleSettings,
  });

  const focusInput = (): void => inputRef.current?.focus();

  return (
    <div className="flex flex-col space-y-2" onClick={focusInput} role="presentation">
      <OutputList items={outputs} />
      <div className="space-y-1">
        <div className="flex items-center gap-2 font-mono text-sm whitespace-nowrap">
          <span style={{ color: TERMINAL_COLORS.success }}>-{'>'}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 bg-transparent text-[#c9d1d9] outline-none"
            aria-label="terminal input"
          />
        </div>
        {suggestions.length > 0 && (
          <SuggestionList
            items={suggestions}
            selected={selectedSuggestion}
            onSelect={value => handleSuggestionClick(value)}
            onHighlight={setSelectedSuggestion}
          />
        )}
      </div>
    </div>
  );
}

type SuggestionListProps = {
  items: { id: string; label: string; value: string }[];
  selected: number;
  onSelect: (value: string) => void;
  onHighlight: (index: number) => void;
};

function SuggestionList({
  items,
  selected,
  onSelect,
  onHighlight,
}: SuggestionListProps): JSX.Element {
  return (
    <div className="rounded border border-[#30363d] bg-[#0f141a] text-xs text-[#8b949e]">
      {items.map((s, idx) => (
        <div
          key={s.id}
          className={`cursor-pointer px-3 py-1 ${idx === selected ? 'bg-[#161b22] text-[#c9d1d9]' : ''}`}
          onMouseDown={e => {
            e.preventDefault();
            onSelect(s.value);
            onHighlight(idx);
          }}
        >
          {s.label}
        </div>
      ))}
    </div>
  );
}

type OutputListProps = { items: { id: string; text: string; tone: CommandTone }[] };

function OutputList({ items }: OutputListProps): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1 text-sm">
      {items.map(line => (
        <div key={line.id} className="flex items-center gap-2 font-mono">
          <span style={{ color: toneColor(line.tone) }}>-{'>'}</span>
          <span className="text-[#c9d1d9]">{line.text}</span>
        </div>
      ))}
    </div>
  );
}
