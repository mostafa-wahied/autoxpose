import { createContext, useContext, type ReactNode } from 'react';

export const TERMINAL_COLORS = {
  bg: '#0b0d11',
  bgSecondary: '#101218',
  border: '#1b1f29',
  text: '#e2e8f0',
  textMuted: '#9aa0aa',
  accent: '#50c4e6',
  success: '#8dd39f',
  error: '#f07b7b',
  warning: '#f2c46d',
};

type TerminalThemeContextValue = {
  colors: typeof TERMINAL_COLORS;
};

const TerminalThemeContext = createContext<TerminalThemeContextValue | null>(null);

export function TerminalThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  return (
    <TerminalThemeContext.Provider value={{ colors: TERMINAL_COLORS }}>
      {children}
    </TerminalThemeContext.Provider>
  );
}

export function useTerminalTheme(): TerminalThemeContextValue {
  const ctx = useContext(TerminalThemeContext);
  if (!ctx) throw new Error('useTerminalTheme must be used within TerminalThemeProvider');
  return ctx;
}
