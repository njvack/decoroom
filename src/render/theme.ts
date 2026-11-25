export interface Theme {
  paper: string;
  sheet: string;
  ink: string;
  ink2: string;
  grid: string;
  wall: string;
  sel: string;
  anchor: string;
  warn: string;
  hearth: string;
  firebox: string;
  glass: string;
  changed: string;
  font: string;
}

export const LIGHT: Theme = {
  paper: '#f6f7f4',
  sheet: '#fdfdfb',
  ink: '#26302a',
  ink2: '#5b665e',
  grid: '#e7ebe5',
  wall: '#2f3832',
  sel: '#2f6f5e',
  anchor: '#b4562f',
  warn: '#b4562f',
  hearth: '#c4b6a6',
  firebox: '#2a2522',
  glass: '#bcd6e4',
  changed: '#d08a1e',
  font: "'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace",
};

export const DARK: Theme = {
  paper: '#161a18',
  sheet: '#1d2220',
  ink: '#e3e8e3',
  ink2: '#9aa59d',
  grid: '#262d2a',
  wall: '#cfd7d0',
  sel: '#8fd0b9',
  anchor: '#e48a5f',
  warn: '#e48a5f',
  hearth: '#6e6356',
  firebox: '#0b0a09',
  glass: '#4d6b7a',
  changed: '#f0b050',
  font: LIGHT.font,
};

/** The app's theme: CSS variables, so light and dark switch without re-rendering. */
export const CSS_THEME: Theme = Object.fromEntries(
  Object.keys(LIGHT).map((k) => [k, k === 'font' ? 'var(--mono)' : `var(--${k})`]),
) as unknown as Theme;
