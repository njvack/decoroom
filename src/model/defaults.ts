import type { Feature, Item, ItemType, Paint } from './types';

export const TYPE_INFO: Record<ItemType, { label: string; h: number; paint: Paint }> = {
  box: { label: 'Other', h: 24, paint: { color: 'b7a99a' } },
  seat: { label: 'Seating', h: 32, paint: { color: '8794a6' } },
  table: { label: 'Table', h: 17, paint: { color: 'd8bf98' } },
  storage: { label: 'Storage', h: 36, paint: { color: 'eef0ee' } },
  bed: { label: 'Bed', h: 24, paint: { color: 'd9d2c5' } },
  rug: { label: 'Rug', h: 0.5, paint: { color: 'b9bdc0' } },
  lamp: { label: 'Lamp', h: 60, paint: { color: 'c9a85a' } },
  plant: { label: 'Plant', h: 36, paint: { color: '7d9a6c' } },
};

export function itemType(it: Item): ItemType {
  return it.type ?? 'box';
}

export function itemHeight(it: Item): number {
  return it.h && it.h > 0 ? it.h : TYPE_INFO[itemType(it)].h;
}

export function itemPaint(it: Item): Paint {
  return it.paint ?? TYPE_INFO[itemType(it)].paint;
}

export function featureHeight(f: Feature): number {
  if (f.h && f.h > 0) return f.h;
  switch (f.kind) {
    case 'door':
    case 'slider':
      return 80;
    case 'opening':
      return 84;
    case 'window':
      return 48;
    case 'fireplace':
      return 44;
    case 'art':
      return 24;
  }
}

export function featureBottom(f: Feature): number {
  if (f.y !== undefined) return f.y;
  switch (f.kind) {
    case 'window':
      return 32;
    case 'art':
      return 54;
    default:
      return 0;
  }
}

export interface Preset {
  name: string;
  item: Omit<Item, 'id' | 'x' | 'y'>;
}

export const PRESETS: Preset[] = [
  { name: 'Sofa', item: { type: 'seat', w: 84, d: 38 } },
  { name: 'Loveseat', item: { type: 'seat', w: 64, d: 36 } },
  { name: 'Armchair', item: { type: 'seat', w: 32, d: 34 } },
  { name: 'Accent chair', item: { type: 'seat', w: 28, d: 30 } },
  { name: 'Sectional', item: { type: 'seat', shape: 'L', w: 90, d: 62, seatDepth: 38, chaiseWidth: 36 } },
  { name: 'Ottoman', item: { type: 'seat', w: 24, d: 24, h: 17, radius: 3 } },
  { name: 'Dining chair', item: { type: 'seat', w: 18, d: 20, h: 34 } },
  { name: 'Coffee table', item: { type: 'table', w: 44, d: 22, radius: 3 } },
  { name: 'Round coffee table', item: { type: 'table', shape: 'round', w: 36, d: 36 } },
  { name: 'Side table', item: { type: 'table', shape: 'round', w: 20, d: 20, h: 22 } },
  { name: 'Dining table', item: { type: 'table', w: 60, d: 36, h: 30 } },
  { name: 'Desk', item: { type: 'table', w: 48, d: 24, h: 30 } },
  { name: 'TV console', item: { type: 'storage', w: 60, d: 18, h: 24, paint: { color: 'a4764f', pattern: 'wood', color2: '8a6040' } } },
  { name: 'Bookcase', item: { type: 'storage', w: 32, d: 12, h: 72, paint: { color: 'a4764f', pattern: 'wood', color2: '8a6040' } } },
  { name: 'Dresser', item: { type: 'storage', w: 60, d: 20, h: 34 } },
  { name: 'Queen bed', item: { type: 'bed', w: 60, d: 80 } },
  { name: 'Twin bed', item: { type: 'bed', w: 38, d: 75 } },
  { name: 'Floor lamp', item: { type: 'lamp', shape: 'round', w: 14, d: 14 } },
  { name: 'Plant', item: { type: 'plant', shape: 'round', w: 18, d: 18 } },
  { name: 'Rug 5×8', item: { type: 'rug', w: 60, d: 96, radius: 1 } },
  { name: 'Rug 6×9', item: { type: 'rug', w: 108, d: 72, radius: 1 } },
  { name: 'Rug 8×10', item: { type: 'rug', w: 96, d: 120, radius: 1 } },
  { name: 'Box', item: { type: 'box', w: 24, d: 24 } },
];

/** Room templates, as vertex lists. */
export const ROOM_TEMPLATES: { name: string; verts: [number, number][] }[] = [
  { name: 'Rectangle 12′ × 15′', verts: [[0, 0], [144, 0], [144, 180], [0, 180]] },
  { name: 'L-shape', verts: [[0, 0], [180, 0], [180, 96], [96, 96], [96, 168], [0, 168]] },
  { name: 'Rectangle with bay', verts: [[0, 0], [48, 0], [60, -18], [108, -18], [120, 0], [168, 0], [168, 144], [0, 144]] },
];
