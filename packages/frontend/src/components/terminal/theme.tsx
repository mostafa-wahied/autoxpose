import { createContext, useContext, type ReactNode } from 'react';

export const TERMINAL_COLORS = {
  bg: '#0d1117',
  bgSecondary: '#161b22',
  border: '#30363d',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  accent: '#58a6ff',
  success: '#3fb950',
  error: '#f85149',
  warning: '#d29922',
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
