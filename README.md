# decoroom

Sketch a room's layout and share it as a link.

decoroom is a static web app: walls, doors, furniture, colors, simple patterns and sketch-quality wall art. The whole room lives in the URL, so sending a layout means sending a link. Version history stays in your browser, and opening a link someone sent back shows what they changed.

**Live:** https://njvack.github.io/decoroom/ · **Example:** [the fireplace room](https://njvack.github.io/decoroom/#id=frplc1&z=bZPLbtswEEV_heB6YuhFUdw2QFqg6KZeZGF4QVK0JVgWA1mGm7_vHTJNE8SAHhSpOXPncrgrST6NS3iZrA9iifEsqaSCdgUeZdW-PauCR3juabeT36w_iZudJkk7aY1Txsk9VuR2GvuwfFlCTEWtIl1R-mWcj6KPcUGqfYr7Oa5-CPO9wIJMQXVB8nGKl7ByCEF0VZDC5FvgO-h_KXdQJZUQURuSP7B4s68821BZKFLtBxuyAyg3ZTKfI3Ke3vemL_GjIul6Z-whZZDL9YhZuR3sUWAsSYFjWnjIwLajjt-wVzrjel-AUJM0B9vYDgQoZLq3rgHlKV6XB_ZJYGKcufgasU2HOjYoBLRNpcA2VGkwd3XSFsKhCCFvCAJb1jP-uQfSGaRZZPIZHiGq4k3_hMqyLmuEpXK7Rn5DK4vnC4L4Vtk21FZ0qkVtMMe0umjYnERwMZ5AeLbTfF0Ff3l7gd9JDUDoEqQuDT6gKwt6F9O6xtZ1oqq2tpX-R_WrY12P8XAIQazWTUByEWib5LvSpGvGsbi-cwfTJYxvrNY--d4w6DxOsEb-wkv4ePVD7gTdMAnbZyAqOcbC0gHZqCStqivscLb85gc0tnwO48JnwQ925Ebnfur4KqiDnAquZT0fYyd7fuGNv84iD9E5VKJFG9IYlho7zhnR-b9xGm4x9lmosDNGnIqEQw-fxBTsOoRlI7b2mE_DhcQQ5_D6EO1JrMt43ojvS3jNoUuwZzGNc5zC9byR-78)

## Features

- Any room shape. Name each wall ("kitchen side", "outside wall"), set lengths, and add doors, openings, sliding doors, windows, a fireplace and wall art.
- Furniture measured from walls: "the closest edge is 18″ from the kitchen wall". Pieces follow their walls when the room changes. Clearance lines show open floor in every direction.
- Colors and 15 sketchy patterns for walls, floor and furniture. Turn a photo of a painting into a small mosaic that travels in the link.
- Plan, wall elevation and 3D views.
- Estimates are drawn dashed and collected into a "To measure" list.
- History in IndexedDB: versions save when you pause editing, ⌘S marks a major version, and partner links get a "what changed" banner.
- Built for AI agents too: the page carries agent instructions in its static HTML, [llms.txt](public/llms.txt) has the full schema, and a one-file CLI decodes, describes, renders (SVG/PNG) and encodes links.

## For agents

```sh
curl -sO https://njvack.github.io/decoroom/decoroom.mjs
node decoroom.mjs describe 'LINK'
node decoroom.mjs render 'LINK' -o plan.png
```

See [public/llms.txt](public/llms.txt).

## Development

```sh
npm install
npm run dev        # app at http://localhost:5173
npm run build      # app and CLI into dist/
npm run check      # typecheck and tests (CLI tests run after a build)
node dist/decoroom.mjs --help
```

Layout:

- `src/model/` types, normalization, geometry, anchors, room edits, diffs, sketches. No DOM.
- `src/codec/` the URL format (packed arrays, deflate, base64url).
- `src/render/` plan, elevation and text renderers that return a plain element tree, shared by the app and the CLI.
- `src/app/` the Preact editor, IndexedDB history and the lazy-loaded 3D view.
- `cli/` the command-line tool, bundled to `dist/decoroom.mjs`.
- Settings such as the history settle delay are in `src/config.ts`.

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`. Pages has to be turned on once in the repo settings with Source set to "GitHub Actions".

See [docs/PLAN.md](docs/PLAN.md) for the design.
