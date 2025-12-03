import { TERMINAL_COLORS } from './theme';

export function BlinkingCursor(): JSX.Element {
  return (
    <span className="inline-block animate-pulse" style={{ color: TERMINAL_COLORS.text }}>
      _
    </span>
  );
}

interface CommandPromptProps {
  command?: string;
  isActive?: boolean;
}

export function CommandPrompt({ command, isActive = true }: CommandPromptProps): JSX.Element {
  return (
    <div className="flex items-center gap-2 font-mono text-sm">
      <span style={{ color: TERMINAL_COLORS.success }}>-{'>'}</span>
      {command ? <span className="text-[#c9d1d9]">{command}</span> : isActive && <BlinkingCursor />}
    </div>
  );
}
