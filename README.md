# decoroom

Sketch a room's layout and share it as a link.

decoroom is a static web app: walls, doors, furniture, colors, simple patterns and sketch-quality wall art. The whole room lives in the URL, so sending a layout means sending a link. Version history stays in your browser, and opening a link someone sent back shows what they changed.

**Live:** https://njvack.github.io/decoroom/ · **Example:** [the fireplace room](https://njvack.github.io/decoroom/#id=frplc1&z=7VVNb-M2EP0rBM-0QFKkKF67wLZAYxRoDnswfKAoKhIiSwtZTpr--r6hHG-QZrGHvS5sSSMO3-ObD1IHJfjnYUlfxxATW-b5xIUSUhwkbkpX17uWZOF-FIcD_y3ER_YcxpGLAw--sb7hR3j4_Ti0afmfCxgtKiucFnnKMD2wdp4XLHXMuD-HNfZp-ggohZeilIJ_GudzWgkiIFpLYTF4Bd6IvoXyAZUSCiJKL_gfcD6HFxo1QkkrbPUmDVsGEG5eyb9HWCAoI4L_nVp2vtDqQjthTUZdc7f9ICsDtCtshvy1hOkh_QClEUwOp42tbxVmWsGbtvGhy4Hw5fKAUX7fhwcGmwsLlK-wDsGrWtRXTt74po0SDKXgvgsm1GBAIog9hsaA5fN8WXZUDoaBYaIcl8CaGumC6hJshaYYPPSC81BmbSl1MqWt7gBWpGf45yMitxE5EpnLiVIApV_zc6PaZJ3XGZXj9-tMT2gl8fSHILrsVh3EJmtbITYkx1dOGkpOZmjm-REMX8I4XVZGbzGcUdasBkRoRiytPF6gaxN0E1M1JpRlZrVVGbR7ZY1rQ7o-zV2XEltDM4KSgkB35rxbJ1xJdCSurZvO15kmmuBczHk3RHQaRqSG7_Fgcb7Efms4Z4gJ5fMQlTNGwnIXFTZL06VGhbeUP8ce-4d_ScNCWy72YaD9RN1T01-KGnI0srbpeYsdw-krFf4ysc1E5wiFnWCEg6kcKp5XPCAu9OiBq0g_YDrT6URG6toYkADeamN1B6PsfHAahtZVY1EX7mKUPly3Md9LJnstn7Trd1r-S8M4fPaq0AxXr1xRPWlTVP2OzOzHebHXhWW4emWftIbPZg_aeV8VhkFoKIuK0SWZwuXAJ9-N7fJgBppXSlPYOwU3Xu6w4DaSp6Bk36ZUjJx3qMk2Ya_kDW3ge4fFOQJdb-gh8E6hza7oG6_BnmJagf9Ka64YW7jseMtLtfh-KXSjg0ar8SRd0DRShjpUZKjORuNhVF1INfXgr1L8bCmOOPjxKXqe53bbvixMsGgDCtbgA_LIxhTWPi0Fuw847OlTdBasn6f0spvDI1uX4VSw35f0skGXFE5sHKZ5TJdTwY__AQ)

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
