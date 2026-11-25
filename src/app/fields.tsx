import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { cleanColor } from '../model/normalize';
import { PLAN_SKETCH_BUDGET, sketchFromImage, sketchSize } from '../model/sketch';
import { PATTERNS, type Paint, type Plan, type Sketch } from '../model/types';
import { fromDisplay, toDisplay, unitLabel } from '../model/units';
import { hex, swatchSvg } from '../render/patterns';
import { units } from './store';

export function NumField(props: {
  label: string;
  value: number | undefined;
  onChange: (inches: number) => void;
  /** Raw numbers (degrees), not lengths. */
  raw?: boolean;
  step?: number;
  min?: number;
  placeholder?: string;
}) {
  const u = units();
  const shown = props.value === undefined ? '' : String(props.raw ? props.value : toDisplay(props.value, u));
  const [draft, setDraft] = useState<string | null>(null);
  const suffix = props.raw ? '' : ` (${unitLabel(u)})`;
  return (
    <label class="f">
      <span>
        {props.label}
        {suffix}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={props.step ?? (props.raw ? 1 : u === 'cm' ? 1 : 0.5)}
        value={draft ?? shown}
        placeholder={props.placeholder}
        onFocus={() => setDraft(shown)}
        onBlur={() => setDraft(null)}
        onInput={(e) => {
          const t = (e.target as HTMLInputElement).value;
          setDraft(t);
          const n = parseFloat(t);
          if (!Number.isFinite(n)) return;
          if (props.min !== undefined && n < props.min) return;
          props.onChange(props.raw ? n : fromDisplay(n, u));
        }}
      />
    </label>
  );
}

export function TextField(props: { label: string; value: string | undefined; onChange: (v: string) => void; placeholder?: string; area?: boolean }) {
  return (
    <label class="f">
      <span>{props.label}</span>
      {props.area ? (
        <textarea value={props.value ?? ''} placeholder={props.placeholder} onInput={(e) => props.onChange((e.target as HTMLTextAreaElement).value)} />
      ) : (
        <input value={props.value ?? ''} placeholder={props.placeholder} onInput={(e) => props.onChange((e.target as HTMLInputElement).value)} />
      )}
    </label>
  );
}

export function Select<T extends string>(props: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <label class="f">
      <span>{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value as T)}>
        {props.options.map(([v, l]) => (
          <option value={v} key={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Check(props: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <label class="check">
      <input type="checkbox" checked={!!props.value} onChange={(e) => props.onChange((e.target as HTMLInputElement).checked)} />
      {props.label}
    </label>
  );
}

export function Row(props: { children: ComponentChildren }) {
  return <div class="grid2">{props.children}</div>;
}

/** Colors that suit sketching rooms: walls, woods, upholstery. */
export const SWATCHES = [
  'f3efe6', 'e9e2d3', 'd8cbb3', 'a9b59b', '7d8f6e', '5e6b4a', 'c9a272', 'a4764f', '6b4a33', '3d2b20',
  'c2683f', 'a8432d', 'd9a441', '2f4858', '4d6a8a', '8794a6', 'b9bdc0', '6f7275', '35383a', '1f1f1f',
];

export const PATTERN_LABELS: Record<string, string> = {
  solid: 'Solid', stripe: 'Stripe', check: 'Check', plaid: 'Plaid', herringbone: 'Herringbone', wood: 'Wood grain',
  dots: 'Dots', grid: 'Grid', tile: 'Tile', brick: 'Brick', diamond: 'Kilim diamond', chevron: 'Chevron',
  terrazzo: 'Terrazzo', shag: 'Shag', boucle: 'Bouclé', floral: 'Floral',
};

export function PaintPicker(props: {
  label: string;
  value: Paint | undefined;
  fallback: string;
  plan: Plan;
  onChange: (p: Paint | undefined, sketches?: Sketch[]) => void;
  allowPicture?: boolean;
}) {
  const p = props.value ?? {};
  const c1 = p.color ?? props.fallback;
  const put = (patch: Partial<Paint>) => {
    const next: Paint = { ...p, ...patch };
    for (const k of Object.keys(next) as (keyof Paint)[]) if (next[k] === undefined) delete next[k];
    if (next.pattern === 'solid') delete next.pattern;
    props.onChange(Object.keys(next).length ? next : undefined);
  };
  const sk = p.sketch !== undefined ? props.plan.sketches?.[p.sketch] : undefined;
  const total = (props.plan.sketches ?? []).reduce((n, s) => n + sketchSize(s), 0);

  async function pickImage(file: File) {
    const img = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const sketch = sketchFromImage(
      (cols, rows) => {
        canvas.width = cols;
        canvas.height = rows;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cols, rows);
        const d = ctx.getImageData(0, 0, cols, rows).data;
        const out: [number, number, number][] = [];
        for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
        return out;
      },
      img.width / img.height,
    );
    const sketches = [...(props.plan.sketches ?? [])];
    let i = p.sketch;
    if (i === undefined || !sketches[i]) i = sketches.length;
    sketches[i] = sketch;
    props.onChange({ ...p, sketch: i }, sketches);
  }

  return (
    <div class="paint">
      <div class="paint-head">
        <span class="f-label">{props.label}</span>
        <input type="color" value={hex(c1)} aria-label={`${props.label} color`} onInput={(e) => put({ color: cleanColor((e.target as HTMLInputElement).value) })} />
      </div>
      <div class="swatches" role="group" aria-label="Quick colors">
        {SWATCHES.map((c) => (
          <button key={c} class={`sw${p.color === c ? ' on' : ''}`} style={{ background: `#${c}` }} title={`#${c}`} aria-label={`Color #${c}`} onClick={() => put({ color: c })} />
        ))}
      </div>
      {!sk && (
        <div class="patterns" role="group" aria-label="Pattern">
          {PATTERNS.map((pat) => (
            <button
              key={pat}
              class={`pat${(p.pattern ?? 'solid') === pat ? ' on' : ''}`}
              title={PATTERN_LABELS[pat]}
              aria-label={PATTERN_LABELS[pat]}
              onClick={() => put({ pattern: pat === 'solid' ? undefined : pat })}
              style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(swatchSvg({ color: c1.replace('#', ''), pattern: pat, color2: p.color2 }, [], 28))}")` }}
            />
          ))}
        </div>
      )}
      {(p.pattern || sk) && (
        <div class="grid2">
          {p.pattern && (
            <label class="f">
              <span>Second color</span>
              <input type="color" value={p.color2 ? hex(p.color2) : '#888888'} onInput={(e) => put({ color2: cleanColor((e.target as HTMLInputElement).value) })} />
            </label>
          )}
          <label class="f">
            <span>Size ×{p.scale ?? 1}</span>
            <input type="range" min="0.25" max="4" step="0.25" value={p.scale ?? 1} onInput={(e) => put({ scale: +(e.target as HTMLInputElement).value === 1 ? undefined : +(e.target as HTMLInputElement).value })} />
          </label>
          <label class="f">
            <span>Angle</span>
            <select value={String(p.angle ?? 0)} onChange={(e) => put({ angle: +(e.target as HTMLSelectElement).value || undefined })}>
              {[0, 30, 45, 60, 90, 135].map((a) => (
                <option key={a} value={String(a)}>
                  {a}°
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {props.allowPicture !== false && (
        <div class="row picture">
          <label class="btn small">
            {sk ? 'Replace picture…' : 'Use a picture…'}
            <input type="file" accept="image/*" hidden onChange={(e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) void pickImage(f);
            }} />
          </label>
          {sk && (
            <button class="small" onClick={() => put({ sketch: undefined })}>
              Remove picture
            </button>
          )}
          {sk && (
            <span class={`hint${total > PLAN_SKETCH_BUDGET ? ' warn' : ''}`}>
              {sketchSize(sk)} chars{total > PLAN_SKETCH_BUDGET ? ' · pictures are making the link long' : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
