import type { Units } from './types';

export function defaultUnits(locale = globalThis.navigator?.language ?? 'en-US'): Units {
  // The US, Liberia and Myanmar mostly measure rooms in feet and inches.
  return /^en-(US|LR)$|^my\b/i.test(locale) ? 'in' : 'cm';
}

/** Format a length given in inches for display. */
export function fmtLen(inches: number, units: Units, opts: { short?: boolean } = {}): string {
  if (units === 'cm') {
    const cm = inches * 2.54;
    if (!opts.short && Math.abs(cm) >= 100) return `${(cm / 100).toFixed(2).replace(/\.?0+$/, '')} m`;
    return `${Math.round(cm)} cm`;
  }
  let n = Math.round(inches * 2) / 2;
  const neg = n < 0;
  n = Math.abs(n);
  const ft = Math.floor(n / 12);
  const inch = +(n - ft * 12).toFixed(1);
  const inStr = `${inch}″`.replace('.5″', '½″');
  let s: string;
  if (opts.short || !ft) s = ft ? `${ft}′${inch ? ` ${inStr}` : ''}` : inStr;
  else s = `${ft}′${inch ? ` ${inStr}` : ''}`;
  return (neg ? '−' : '') + s;
}

/** Number shown in an input field, in display units. */
export function toDisplay(inches: number, units: Units): number {
  return units === 'cm' ? Math.round(inches * 2.54 * 10) / 10 : Math.round(inches * 100) / 100;
}

export function fromDisplay(v: number, units: Units): number {
  return units === 'cm' ? Math.round((v / 2.54) * 100) / 100 : v;
}

export const unitLabel = (u: Units) => (u === 'cm' ? 'cm' : 'in');
