/** A tiny DOM-free element tree, rendered to a string (CLI) or Preact (app). */
export type Attrs = Record<string, string | number | undefined | null | false>;
export interface El {
  t: string;
  a: Attrs;
  c: (El | string)[];
}

export function h(t: string, a: Attrs = {}, ...c: (El | string | null | undefined | false | (El | string | null | undefined | false)[])[]): El {
  const kids: (El | string)[] = [];
  for (const k of c.flat()) if (k !== null && k !== undefined && k !== false) kids.push(k);
  return { t, a, c: kids };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toSvgString(el: El | string): string {
  if (typeof el === 'string') return esc(el);
  const attrs = Object.entries(el.a)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('');
  if (!el.c.length) return `<${el.t}${attrs}/>`;
  return `<${el.t}${attrs}>${el.c.map(toSvgString).join('')}</${el.t}>`;
}

/** Round for compact SVG output. */
export const f2 = (n: number) => Math.round(n * 100) / 100;
