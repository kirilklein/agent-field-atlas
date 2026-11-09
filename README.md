# Agent Field Atlas

An interactive learning map for engineers who want to understand LLM agents by building one: a paper-search assistant in plain Python, from one model call to an evaluated agent. Everything runs on recorded fixtures — no API key.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
# or the production build
npm run build && npm run preview   # http://localhost:4173
```

### Single-page build

`npm run build:artifact` bundles the app into one self-contained page at `dist-artifact/agent-field-atlas.html` (scripts and styles inlined, fonts from Google Fonts), suitable for hosting as a single file.

## Python companion

`companion/` holds the paper-search assistant itself: four runnable checkpoints (one per landmark), `compare.py` for the Multi-agent branch, a scripted fake model so everything runs offline, and an adapter for Claude (`ATLAS_MODEL=claude`). The atlas imports these files and their recorded output (`companion/expected/`) directly, so the lessons always show the real code. After changing a checkpoint, re-record its output; see `companion/README.md`.

## How it's put together

| Path | What it holds |
|---|---|
| `src/data/map.ts` | Hand-placed landmarks, concept stops, branch curves, terrain peaks and place names (world units) |
| `src/data/lessons.ts` | Explanation, example and interaction for every concept |
| `src/data/traces.ts` | Deterministic step-through fixtures (Inspect a call, Parse a reply, Watch a run, Score a replay, Untrusted results) |
| `src/data/companion.ts` | Imports the Python companion, its fixtures and expected output as text |
| `src/lib/progress.ts` | Which lessons this viewer has opened (browser storage only), drawn as walked trail and landmark rings |
| `src/lib/stats.ts` | Wilson and paired t-intervals, the same maths as the companion |
| `src/lib/camera.ts` | The single camera: `fit()` targets and the anchor-preserving animation |
| `src/lib/relief.ts`, `src/lib/reliefGL.ts` | The overview as a 3D relief model (three.js, loaded on demand): framing, idle drift, and the fly-down into the flat map |
| `src/lib/route.ts` | Hash routes (`#tool-calling`, `#tool-calling--inspect-a-call`) — the source of truth for the view |
| `src/data/terrain.ts` | The height field: one mountain the main trail climbs, with a side peak for each branch |
| `src/lib/contours.ts`, `src/lib/hillshade.ts` | Contours (marching squares) and shaded relief computed from the height field |
| `src/lib/geometry.ts` | Trail stretches, spurs, contour paths and contour-label placement |
| `src/components/` | SVG scene, HTML markers, cards, workbench, trace stepper |

The route decides the camera target; the camera animates zoom geometrically while moving the selected landmark in a straight line on screen, so the landmark stays in view. A new route mid-flight restarts from the current camera, so fast clicks and Back stay in sync. `prefers-reduced-motion` jumps straight to the target. Labels and controls are HTML outside the camera transform, so they stay crisp at every scale.

On the overview the flat map lifts into a 3D relief model once three.js has loaded (it needs hardware WebGL 2 and stays flat under `prefers-reduced-motion` or a deep link). Opening a landmark flies the model down into the flat map, and going back lifts it out again. In the model, drag turns it a little, and zooming in (scroll, pinch, +, arrow keys) hands over to the flat map; recenter brings the model back.

Map controls: the +, − and recenter buttons sit at the top right of the map. Drag to pan; scroll or pinch to zoom at the cursor. On phones one finger keeps scrolling the page and two fingers move and zoom the map; in a narrow desktop window, Ctrl/⌘ + scroll zooms. Free pan/zoom never changes the URL — clicking a landmark, Back, or recenter flies to the route's view.

Keyboard: Tab through landmarks and stops, Enter to open, Escape to go up a level, ←/→ to step through a trace. With the map focused, arrow keys pan, + / − zoom and 0 recenters.
