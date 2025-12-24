import React, { useRef } from 'react';
import { TERMINAL_COLORS } from '../../components/terminal';
import type { ServiceRecord } from '../../lib/api';
import type { CommandTone } from './command-engine';
import { toneColor } from './command-engine';
import { useCommandConsole } from './use-command-console';

const CLICK_PAD_CLASS = 'min-h-32';

type CommandConsoleProps = {
  services: ServiceRecord[];
  settings: Awaited<ReturnType<typeof import('../../lib/api').api.settings.status>> | undefined;
  onExpose: (service: ServiceRecord) => void;
  onUnexpose: (service: ServiceRecord) => void;
  onToggleSettings: (open: boolean) => void;
  onScan: () => void;
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
    onScan: props.onScan,
  });

  const focusInput = (): void => inputRef.current?.focus();

  return (
    <div
      className="flex flex-col space-y-2 cursor-text"
      onMouseDown={e => {
        e.preventDefault();
        focusInput();
      }}
      role="presentation"
    >
      <OutputList items={outputs} />
      <PromptArea
        inputRef={inputRef}
        input={input}
        onChange={setInput}
        onKeyDown={handleKeyDown}
        suggestions={suggestions}
        selectedSuggestion={selectedSuggestion}
        onSelectSuggestion={handleSuggestionClick}
        onHighlight={setSelectedSuggestion}
      />
      <ClickCatcher onFocus={focusInput} />
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
          <LineText line={line} />
        </div>
      ))}
    </div>
  );
}

function LineText({ line }: { line: { text: string; tone: CommandTone } }): JSX.Element {
  const match = line.text.match(/^([^\s>]+)>\s+(.*)$/);
  if (!match) return <span style={{ color: toneColor(line.tone) }}>{line.text}</span>;
  const [, cmd, rest] = match;
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[#58a6ff]">{cmd}</span>
      <span style={{ color: TERMINAL_COLORS.success }}>{'>'}</span>
      <span style={{ color: toneColor(line.tone) }}>{rest}</span>
    </span>
  );
}

function ClickCatcher({ onFocus }: { onFocus: () => void }): JSX.Element {
  return (
    <div
      className={`w-full ${CLICK_PAD_CLASS}`}
      role="presentation"
      onMouseDown={e => {
        e.preventDefault();
        onFocus();
      }}
    />
  );
}

type PromptAreaProps = {
  inputRef: React.RefObject<HTMLInputElement>;
  input: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  suggestions: { id: string; label: string; value: string }[];
  selectedSuggestion: number;
  onSelectSuggestion: (value: string) => void;
  onHighlight: (index: number) => void;
};

function PromptArea({
  inputRef,
  input,
  onChange,
  onKeyDown,
  suggestions,
  selectedSuggestion,
  onSelectSuggestion,
  onHighlight,
}: PromptAreaProps): JSX.Element {
  const [isFocused, setIsFocused] = React.useState(false);
  const showGhostCaret = input.length === 0 && !isFocused;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 font-mono text-sm whitespace-nowrap">
        <span style={{ color: TERMINAL_COLORS.success }}>-{'>'}</span>
        <div className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            value={input}
            onChange={e => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="w-full bg-transparent text-[#c9d1d9] outline-none"
            aria-label="terminal input"
          />
          {showGhostCaret && (
            <span
              className="pointer-events-none absolute left-0 top-0 animate-pulse text-[#8b949e]"
              aria-hidden="true"
            >
              _
            </span>
          )}
        </div>
      </div>
      {suggestions.length > 0 && (
        <SuggestionList
          items={suggestions}
          selected={selectedSuggestion}
          onSelect={value => onSelectSuggestion(value)}
          onHighlight={onHighlight}
        />
      )}
      {suggestions.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[#8b949e]">
          <span className="rounded border border-[#30363d] bg-[#0f141a] px-2 py-0.5 text-[#c9d1d9]">
            Tab
          </span>
          <span>select</span>
          <span className="rounded border border-[#30363d] bg-[#0f141a] px-2 py-0.5 text-[#c9d1d9]">
            ↑ ↓
          </span>
          <span>history</span>
        </div>
      )}
      <div className="h-6 w-full" />
    </div>
  );
}
