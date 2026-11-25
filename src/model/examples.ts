import { normalizePlan } from './normalize';
import type { Plan } from './types';

const BLACK_LEATHER = { color: '232120' } as const;
const WHITE_CAB = { color: 'eef0ee' } as const;

/** The fireplace room from the original artifact, in decoroom's schema. */
export const FIREPLACE_ROOM_ID = 'frplc1';
export const FIREPLACE_ROOM: Plan = normalizePlan({
  name: 'Fireplace room',
  units: 'in',
  verts: [[0, 0], [126, 0], [126, 206], [0, 206]],
  walls: [
    { name: 'Back wall', paint: { color: 'a9b59b' } },
    {
      name: 'Slider wall',
      paint: { color: 'a9b59b' },
      features: [{ kind: 'slider', at: 65, w: 72, label: 'Sliding door', est: true }],
    },
    {
      name: 'Kitchen wall',
      paint: { color: 'a9b59b' },
      features: [
        { kind: 'door', at: 90, w: 30, label: 'Closet', est: true },
        { kind: 'opening', at: 20, w: 50, label: 'Kitchen', est: true },
      ],
    },
    {
      name: 'Fireplace wall',
      paint: { color: 'a9b59b' },
      features: [
        { kind: 'opening', at: 165, w: 39, label: 'Hallway' },
        { kind: 'fireplace', at: 105, w: 56, depth: 2, label: 'Fireplace', est: true },
        { kind: 'opening', at: 9, w: 39, label: 'Hallway' },
        { kind: 'art', at: 106, w: 20, h: 27, y: 54, label: 'Red sun', paint: { sketch: 0 }, est: true },
        { kind: 'art', at: 127.5, w: 20, h: 27, y: 54, label: 'Orange sun', paint: { sketch: 1 }, est: true },
      ],
    },
  ],
  floor: { color: 'dcd9d1', pattern: 'floral', color2: 'bdb9af' },
  items: [
    { id: 'rug1', name: 'Shag rug', type: 'rug', x: 68, y: 80, w: 96, d: 120, radius: 1, est: true, paint: { color: 'b9bdc0', pattern: 'shag', color2: '9fa4a8' } },
    { id: 'cab4', name: 'Four-door cabinet', type: 'storage', x: 8.25, y: 129, w: 48, d: 16.5, rot: 270, h: 38, paint: WHITE_CAB, anchors: [{ wall: 3, dist: 0 }] },
    { id: 'cab6', name: 'Six-door cabinet', type: 'storage', x: 117.75, y: 181.5, w: 47, d: 16.5, rot: 90, h: 75, est: true, paint: WHITE_CAB, anchors: [{ wall: 1, dist: 0 }, { wall: 2, dist: 1 }] },
    { id: 'stol', name: 'Stool', type: 'seat', shape: 'round', x: 118, y: 151, w: 13, d: 13, h: 18, est: true, paint: { color: 'b08560', pattern: 'wood', color2: '96704f' } },
    { id: 'book', name: 'Walnut bookcase', type: 'storage', x: 119, y: 43.5, w: 43, d: 12, rot: 90, h: 60, est: true, paint: { color: '6b4a33', pattern: 'wood', color2: '563a27' }, anchors: [{ wall: 1, dist: 1 }] },
    { id: 'ctbl', name: 'Coffee table', type: 'table', x: 57, y: 73, w: 30, d: 20, rot: 90, radius: 4, est: true, paint: { color: 'd8bf98', pattern: 'wood', color2: 'c4a77c' } },
    { id: 'milt', name: 'Milt couch', type: 'seat', x: 69.5, y: 16.5, w: 74, d: 30, paint: BLACK_LEATHER, anchors: [{ wall: 0, dist: 1.5 }] },
    { id: 'wchr', name: 'Weirder chair', type: 'seat', x: 87, y: 72, w: 28, d: 28, rot: 180, paint: BLACK_LEATHER },
    { id: 'lamp', name: 'Fun lamp', type: 'lamp', shape: 'round', x: 117, y: 8.5, w: 14, d: 14, h: 76 },
  ],
  // The two framed prints over the fireplace: black frame, white mat, sun over green peaks.
  sketches: [
    {
      w: 20,
      h: 27,
      pal: ['1c1c1c', 'f4f2ec', 'efdcae', 'd2452f', '3f9a72', '226b50', '7cc09a'],
      paths: [
        [0, 'M0 0h20v27h-20z'],
        [1, 'M1.2 1.2h17.6v24.6h-17.6z'],
        [2, 'M2.5 2.5h15v22h-15z'],
        [3, 'M6.4 8.5a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0z'],
        [4, 'M2.5 24.5L10 12.5L17.5 24.5z'],
        [5, 'M2.5 24.5L6 17.5L9.5 24.5zM10.5 24.5L14 17L17.5 24.5z'],
        [6, 'M6.5 24.5L10 18.5L13.5 24.5zM2.5 24.5L4.25 21L6 24.5zM14 24.5L15.75 21L17.5 24.5z'],
      ],
    },
    {
      w: 20,
      h: 27,
      pal: ['1c1c1c', 'f4f2ec', '2b2a28', 'e07a2c', '3a8a6c', '1f5c49', '6fae8c'],
      paths: [
        [0, 'M0 0h20v27h-20z'],
        [1, 'M1.2 1.2h17.6v24.6h-17.6z'],
        [2, 'M2.5 2.5h15v22h-15z'],
        [3, 'M6.4 8.5a3.6 3.6 0 1 0 7.2 0a3.6 3.6 0 1 0 -7.2 0z'],
        [4, 'M2.5 24.5L10 12.5L17.5 24.5z'],
        [5, 'M2.5 24.5L6 17.5L9.5 24.5zM10.5 24.5L14 17L17.5 24.5z'],
        [6, 'M6.5 24.5L10 18.5L13.5 24.5zM2.5 24.5L4.25 21L6 24.5zM14 24.5L15.75 21L17.5 24.5z'],
      ],
    },
  ],
  notes: 'Rosewood couch and chair, black leather. Sage walls, honey-oak trim. Grey and cream linoleum.',
});

export const EXAMPLES: { id: string; plan: Plan }[] = [{ id: FIREPLACE_ROOM_ID, plan: FIREPLACE_ROOM }];
