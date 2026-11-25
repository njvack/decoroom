/**
 * The decoroom data model. All lengths are inches; x grows to the right and
 * y grows down (screen coordinates). See docs/PLAN.md and public/llms.txt.
 */

export type Vec = [number, number];

export const PATTERNS = [
  'solid',
  'stripe',
  'check',
  'plaid',
  'herringbone',
  'wood',
  'dots',
  'grid',
  'tile',
  'brick',
  'diamond',
  'chevron',
  'terrazzo',
  'shag',
  'boucle',
  'floral',
] as const;
export type PatternId = (typeof PATTERNS)[number];

/** A surface finish. `sketch` (an index into Plan.sketches) wins over `pattern`. */
export interface Paint {
  /** Hex color without '#', 3 or 6 digits. */
  color?: string;
  pattern?: PatternId;
  /** Second color used by patterns. */
  color2?: string;
  /** Pattern size multiplier; 1 when absent. */
  scale?: number;
  /** Pattern rotation in degrees. */
  angle?: number;
  sketch?: number;
}

export const FEATURE_KINDS = ['door', 'opening', 'slider', 'window', 'fireplace', 'art'] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

/** Something on a wall, placed `at` inches from the wall's start corner. */
export interface Feature {
  kind: FeatureKind;
  at: number;
  w: number;
  /** Height (window, art, door). Defaults depend on kind. */
  h?: number;
  /** Height of the bottom edge above the floor (window sill, art). */
  y?: number;
  /** Fireplace hearth depth into the room. */
  depth?: number;
  /** Door hinge side: at the wall's start corner side or end side. */
  hinge?: 'start' | 'end';
  /** Door swing: into the room or out of it. */
  swing?: 'in' | 'out';
  label?: string;
  paint?: Paint;
  est?: boolean;
}

/** walls[i] runs from verts[i] to verts[i+1]. */
export interface Wall {
  name?: string;
  paint?: Paint;
  features?: Feature[];
  /** The wall's length is an estimate. */
  est?: boolean;
}

export const ITEM_TYPES = ['box', 'seat', 'table', 'storage', 'bed', 'rug', 'lamp', 'plant'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const SHAPES = ['rect', 'round', 'L'] as const;
export type Shape = (typeof SHAPES)[number];

export const EDGES = ['near', 'center', 'far'] as const;
export type Edge = (typeof EDGES)[number];

/** "This edge of the piece is `dist` inches from wall `wall`." */
export interface Anchor {
  wall: number;
  edge?: Edge;
  dist: number;
}

export interface Item {
  /** Short stable id, used to match pieces between versions. */
  id: string;
  name?: string;
  type?: ItemType;
  shape?: Shape;
  /** Width (along the piece's back), depth, height. */
  w: number;
  d: number;
  h?: number;
  /** Center. Recomputed from anchors when anchors are present. */
  x: number;
  y: number;
  /** Degrees clockwise. At 0 the piece's back faces up (toward -y). */
  rot?: number;
  anchors?: Anchor[];
  paint?: Paint;
  est?: boolean;
  /** Corner radius for rect pieces. */
  radius?: number;
  /** L shape: depth of the main seat run. */
  seatDepth?: number;
  /** L shape: width of the chaise. */
  chaiseWidth?: number;
  chaiseSide?: 'right' | 'left';
}

/** A tiny drawing that travels in the URL: palette + [paletteIndex, pathData] pairs. */
export interface Sketch {
  w: number;
  h: number;
  pal: string[];
  paths: [number, string][];
}

export const UNITS = ['in', 'cm'] as const;
export type Units = (typeof UNITS)[number];

export interface Plan {
  name?: string;
  /** Display units. Absent means "follow the browser locale". */
  units?: Units;
  /** Ceiling height; 96 when absent. */
  ceiling?: number;
  verts: Vec[];
  walls: Wall[];
  floor?: Paint;
  items: Item[];
  sketches?: Sketch[];
  notes?: string;
}

export const DEFAULT_CEILING = 96;
