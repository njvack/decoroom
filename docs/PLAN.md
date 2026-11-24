# decoroom plan

decoroom is a static web app for sketching a room's layout: walls, doors, furniture, colors and simple wall art. The whole layout lives in the URL, so sharing a layout means sending a link. It grows out of the "Fireplace Room Plan" artifact, which proved out the editor (drag, resize, rotate, wall dimension chains, clearance lines, a 3D view).

## Goals

- Host on GitHub Pages (or another static site) with no backend.
- The URL hash holds the current layout. Most links stay short enough to paste into iMessage or WhatsApp without breaking.
- Version history stays in the browser, so you can step back through your own edits and see what a partner changed in a link they sent back.
- An AI agent given a link can read the layout, render a picture of it, and write a new link, without a browser.
- For AI-generated rooms, track what parts of the room layout are guesses and let humans measure and fill in answers
- Everything visual is sketch quality: flat colors and SVG patterns, never photo textures.
- Make editing intuitive
- Be _fast,_ both in editing and viewing
- Maybe most importantly: Be fun to use

## Non-goals (forever)

- Accounts, a server, or real-time collaboration.
- Photorealistic rendering.

## Possible future goals

- Multiple rooms in one link. Each link is one room.
- 3D shader that gives deliberate "sketch" effect

## Use cases

1. **Partner round trip.** Make a layout and send the link. Your partner edits it and sends a link back. Opening their link shows what they changed, and both versions stay in your local history.
2. **Agent drafting.** Put photos of a room and a decoroom link into a Claude project. An agent reads the link, renders it, and drafts a layout or suggests edits as a new link.

## Architecture

- **Stack:** Vite, TypeScript, Preact. Three.js for the 3D view, loaded only when you open it. fflate for compression. Vitest for tests.
- **One renderer.** A pure function turns a plan into an SVG element tree. The app turns that tree into Preact nodes and adds interaction through event delegation on `data-*` attributes. The CLI turns the same tree into an SVG string. That keeps the picture an agent sees identical to the picture in the browser.
- **Layout of the source:**
  - `src/model/` holds types, defaults, validation, geometry, anchor solving and diffs. No DOM.
  - `src/codec/` packs and unpacks the hash.
  - `src/render/` holds the plan, elevation and pattern renderers. No DOM.
  - `src/app/` holds the editor UI, history and 3D view.
  - `cli/` holds the Node command-line tool.
- **Units:** inches internally, rounded to 0.5″. Display in feet and inches, with a centimeter option later.

## Data model

The readable form is a JSON object. Field defaults are omitted.

```json
{
  "name": "Fireplace room",
  "ceiling": 96,
  "verts": [[0,0],[126,0],[126,206],[0,206]],
  "walls": [
    {"name": "Back wall"},
    {"name": "Patio side", "features": [{"kind": "slider", "at": 65, "w": 72}]},
    {"name": "Kitchen side", "features": [{"kind": "opening", "at": 56, "w": 50, "label": "Kitchen"}]},
    {"name": "Fireplace wall", "paint": {"color": "a9b89a"}, "features": [
      {"kind": "fireplace", "at": 105, "w": 56, "depth": 18},
      {"kind": "art", "at": 110, "w": 40, "h": 30, "y": 54, "paint": {"sketch": 0}}
    ]}
  ],
  "floor": {"color": "d8d4cc", "pattern": "tile"},
  "items": [
    {"id": "k3f", "name": "Milt couch", "type": "seat", "w": 74, "d": 30, "rot": 0,
     "anchors": [{"wall": 0, "edge": "near", "dist": 1.5}, {"wall": 3, "edge": "near", "dist": 32}],
     "paint": {"color": "1b1b1b"}}
  ],
  "sketches": [{"w": 40, "h": 30, "pal": ["e07a3f", "c23b22", "f3e9d2"], "paths": [[2, "M0 0h40v30H0z"], [0, "M20 15m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0"]]}]
}
```

### Room

- **`verts`** is the room polygon in inches, with x to the right and y down. The app normalizes it to clockwise order, so the inside of the room is always on the right-hand side of each wall's direction.
- **`walls[i]`** is the edge from `verts[i]` to `verts[i+1]`. Each wall has an optional `name` (for example "kitchen side" or "outside wall"), a `paint`, and `features`. Names replace the hard-coded "back wall / fireplace wall" labels of the artifact and work for any number of walls.
- Rooms can be any simple polygon. The editor favors right angles: vertex drags snap to line up with neighbors, and editing a wall's length stretches the room along that wall so opposite walls stay parallel.

### Wall features

A feature sits on one wall at `at` inches from the wall's start corner and is `w` inches wide. Kinds: `door` (with `hinge` and `swing`), `slider`, `opening`, `window` (`y` is sill height, `h` is height), `fireplace` (`depth` is hearth depth), and `art` (`y` is bottom height, `h` is height, `paint` is usually a sketch). Any feature can carry `label` and `est` (the measurement is an estimate, drawn dashed).

### Items

- `id` is a short random string that stays stable across edits, so diffs can match pieces between versions.
- `type` is one of `seat`, `table`, `storage`, `bed`, `rug`, `lamp`, `plant` or `box`. It sets the default look, the default height and the 3D shape.
- `shape` is `rect` (default), `round`, or `L` (with `seatDepth`, `chaiseWidth` and `chaiseSide`).
- `w`, `d` and `h` are width, depth and height. `rot` is degrees clockwise. `x` and `y` are the center.
- `est`, `radius` (corner radius) and `paint` are optional.

### Relative placement (anchors)

An item can be anchored to up to two walls. Each anchor says "this edge of the piece is this far from that wall": `{"wall": 2, "edge": "near" | "center" | "far", "dist": 12}`. Distance is measured along the wall's inward normal, using the rotated piece's extent.

- Anchors are authoritative. On load and whenever a wall moves, the solver recomputes `x`/`y` from the anchors (a 2×2 linear solve for two non-parallel walls, a single projection otherwise). An unanchored direction keeps its stored coordinate.
- Dragging an anchored piece updates its anchor distances, not the anchors themselves.
- New pieces anchor to the two nearest non-parallel walls, near edges, by default. The panel shows each anchor as "Near edge → 12″ from Kitchen side" with editable wall, edge and distance.
- The plan draws anchor dimension lines for the selected piece, plus the nearest-obstacle clearance lines from the artifact.
- Anchoring to another item ("6″ from the sofa's arm") is a possible later extension.

### Paint and patterns

`paint` is `{color, pattern, color2, scale, angle}` or `{sketch: index}`. Patterns are SVG `<pattern>` tiles generated in code: `solid`, `stripe`, `check`, `plaid`, `herringbone`, `wood`, `dots`, `grid`, `tile`, `brick`, `diamond` (kilim-like), `chevron`, `terrazzo`, `shag` and `boucle`. Walls, floor, items and art all use the same paint type.

### Sketches (custom patterns and art)

A sketch is a tiny SVG drawing that travels in the URL: a viewBox size `w`×`h`, a palette of up to 8 colors, and a list of `[paletteIndex, pathData]` pairs. Coordinates are integers. A sketch can fill a piece of wall art (stretched to fit) or be tiled as a pattern on a wall, floor or item.

- **Budget:** about 1,500 characters of path data per sketch and 3,000 per plan. The editor shows a meter and warns if you're over budget.
- **Ways to make one:**
  - From a photo: downsample, reduce to a small palette, and merge same-color runs into rectangle paths. The result is a mosaic.
  - From pasted SVG: keep path, rect, circle, ellipse and polygon. Flatten, simplify, quantize to integers and reduce the palette.
  - Written by hand or by an agent, using the schema above.

## URL format

```
https://<site>/#id=k3f9x2&z=<base64url(deflate-raw(packed JSON))>
https://<site>/#id=k3f9x2&j=<URI-encoded readable JSON>
```

- **`id`** is a random 6-character base36 room id. It ties links to local history. A link without an `id` gets a new one.
- **`z`** holds the packed form: positional arrays with a leading format version. Every field's default is zero-like, a default value packs as `0`, and trailing defaults are dropped. Deflate-raw is used with no preset dictionary, so any language can decode it with standard zlib (Python: `zlib.decompress(data, -15)`).
- **`j`** holds the readable JSON object. It's meant for agents and hand edits. The app accepts it and rewrites the URL to the `z` form.
- **Size target:** a furnished room (about 12 items, 4 walls, a few features) at around 600 characters of URL, and under 2,000 characters even with a sketch. Tests check this against fixture rooms. The share panel shows the link's length.
- **Updates:** the app rewrites the hash with `history.replaceState` (debounced), so editing doesn't fill browser history.

## History

- **Storage:** IndexedDB. A `rooms` store is keyed by room id and holds the name and last-opened time. A `versions` store holds `{roomId, ts, packed, major, label, source}`, where `source` is `edit` or `link`.
- **Saving on settle:** a version is saved 2 seconds after the last edit, and also when the page is hidden. A version identical to the previous one is skipped. Drags count as one edit.
- **Major versions:** Cmd/Ctrl-S saves a major version right away and offers an optional label. The history panel shows major versions by default and has a toggle to show all of them.
- **Undo and redo:** an in-memory stack (Cmd-Z, Shift-Cmd-Z), separate from saved versions.
- **Restoring** a version saves the current state first, so a restore can be undone.
- **Pruning:** keep all major and link versions, and thin older minor versions (for example, one per hour after a day). The storage format leaves room for this. The pruning itself can land later.
- **Room list:** a "Your rooms" menu lists rooms seen in this browser.

## Partner diffs

When a link opens with a room id this browser has seen and the state differs from the latest local version:

1. Save the incoming state as a `link` version.
2. Diff it against the latest local version. Items are matched by `id` and reported as added, removed, moved (with distance), rotated, resized, recolored or renamed. Wall and feature changes are reported too.
3. Show a "Changes in this link" banner with the summary. On the plan, changed pieces are highlighted and their old positions are drawn as dashed ghosts.
4. Offer "Keep theirs" (the default, already applied) and "Go back to mine" (restores the previous version).

Any two versions in history can be compared the same way.

## Views

- **Plan:** a top-down SVG editor. It ports the artifact's drag, resize, rotate, nudge keys, wall dimension chains, clearance lines and estimate styling. A room-edit mode lets you drag vertices, split a wall, delete a vertex, and drag features along walls.
- **Wall elevation:** a straight-on view of one wall showing doors, windows, the fireplace, art and the silhouettes of furniture within about 2′ of the wall, at their heights. This is where wall art becomes visible and editable.
- **3D:** port of the artifact's Three.js view to polygon walls, with paint colors and pattern textures (pattern SVG rasterized to a canvas). Loaded lazily so the main bundle stays small.

## Agent support

Browsers never send the URL fragment to a server, so an agent fetching a link sees only the static HTML. The page has to explain itself.

- **In `index.html`:** a plain-HTML "For AI agents and scripts" section, present in the static markup and not rendered by JavaScript. It covers the URL format, how to decode and encode `z`, the readable schema with an example, how to build a new link with `j=`, and how to use the CLI. A `<link rel="help" href="llms.txt">` points to the long version.
- **`/llms.txt`:** the full schema reference, the packed-format field order, decode and encode snippets for Python and Node, and CLI usage.
- **CLI (`decoroom.mjs`):** a single self-contained ES module built into the site, so an agent can run it with only Node:
  ```
  curl -sO https://<site>/decoroom.mjs
  node decoroom.mjs decode '<link>'          # readable JSON
  node decoroom.mjs describe '<link>'        # text summary: walls, features, items, anchors, clearances
  node decoroom.mjs render '<link>' -o plan.png [--view plan|elevation:<wall>] [--width 1200]
  node decoroom.mjs encode plan.json [--id k3f9x2]   # prints a link
  ```
  `render` writes SVG, or PNG when the output name ends in `.png`. PNG uses resvg compiled to WebAssembly, plus a bundled font. Both are fetched from the same site on first use and cached.
- **`describe`** matters as much as `render`. A text summary with clearances and anchor distances lets an agent reason about the layout without looking at a picture.

## Deployment

- A GitHub Actions workflow builds and deploys to GitHub Pages on every push to `main`. Pages needs to be turned on once in the repo settings (Source: GitHub Actions).
- Vite uses a relative base so the site works under `/decoroom/` or on a custom domain.
- CI runs typecheck, lint and tests before deploying.

## Testing

- **Unit:** codec round trips for every field; size budgets for fixture rooms; the anchor solver (parallel and non-parallel walls, rotated pieces); geometry (polygon orientation, stretching walls); diffs; sketch import and budget.
- **Render:** snapshot tests of the SVG for fixture rooms.
- **CLI:** decode, encode and render a fixture link end to end.
- **E2E smoke:** Playwright opens a fixture link, drags a piece, checks the hash changed, reloads and checks history.

## Milestones

1. Scaffold, model, codec.
2. Renderer and plan editor (rectangle rooms, parity with the artifact).
3. Hash state and IndexedDB history.
4. Polygon rooms and named walls.
5. Anchors.
6. Paint and patterns.
7. Sketches and wall art, with the elevation view.
8. Partner diffs.
9. Agent docs and the CLI.
10. 3D view.
11. Deploy.

Each milestone is a GitHub issue. Milestones 1 through 3 plus 9 and 11 are enough for a first usable version. The rest can land in any order after that.

## Open questions

- Should the display default to feet and inches with a metric toggle, or follow the browser's locale?
- Should rooms carry a default ceiling height of 8′, editable per room? (Planned: yes.)
- Is 2 seconds the right settle delay?
- Should the fireplace room from the artifact ship as a built-in example link?
