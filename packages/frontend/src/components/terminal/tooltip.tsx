import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { type ReactNode } from 'react';
import { TERMINAL_COLORS } from './theme';

const FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

const contentStyle = {
  backgroundColor: TERMINAL_COLORS.bgSecondary,
  border: `1px solid ${TERMINAL_COLORS.border}`,
  borderRadius: '4px',
  padding: '8px 12px',
  fontFamily: FONT_STACK,
  fontSize: '12px',
  color: TERMINAL_COLORS.text,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
  maxWidth: '250px',
};

const contentCls =
  'z-50 animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2';

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delayDuration?: number;
}

export function Tooltip({
  children,
  content,
  shortcut,
  side = 'top',
  delayDuration = 200,
}: TooltipProps): JSX.Element {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={5}
            className={contentCls}
            style={contentStyle}
          >
            <div>{content}</div>
            {shortcut && <ShortcutHint text={shortcut} />}
            <TooltipPrimitive.Arrow style={{ fill: TERMINAL_COLORS.bgSecondary }} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

function ShortcutHint({ text }: { text: string }): JSX.Element {
  return (
    <div style={{ color: TERMINAL_COLORS.textMuted, fontSize: '11px', marginTop: '4px' }}>
      {text}
    </div>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }): JSX.Element {
  return <TooltipPrimitive.Provider delayDuration={200}>{children}</TooltipPrimitive.Provider>;
}
