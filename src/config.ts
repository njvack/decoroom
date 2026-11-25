/** Tunable app settings. Change here; there's no UI for these. */
export const CONFIG = {
  /** Save a history version this long after the last edit. */
  settleMs: 2000,
  /** Rewrite the URL hash this long after the last edit. */
  hashMs: 250,
  /** Links longer than this get a warning in the share panel. */
  longLinkChars: 2000,
  /** Edits to the same field closer together than this are one undo step. */
  coalesceMs: 1200,
  /** Snap a dragged piece flush to a wall when within this many inches. */
  wallSnap: 2.5,
  /** Keep at most this many undo steps in memory. */
  undoDepth: 200,
};
