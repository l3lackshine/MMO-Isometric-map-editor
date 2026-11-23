# Blackshine Map Editor

Standalone Windows desktop application for creating 2.5D diamond-isometric maps.

## Requirements
- Node.js 22+
- npm

## Development
```bash
npm install
npm run dev
```

## Build Windows installer
```bash
npm run build:win
```

The NSIS installer and portable executable are generated in `release/`.

## GitHub Actions
Push to `main`, create a `v*` tag, or run **Build Windows App** manually from the Actions tab. Download the `Blackshine-Map-Editor-Windows` artifact from the completed workflow.

## Version 0.3
- Diamond isometric grid and configurable map size
- Multi-level terrain tiles with editable height levels (0–12)
- Rendered cliff walls on exposed tile edges, with darker side faces
- Terrain brush: choose a height level and click tiles to raise or lower them
- Objects and imported PNGs automatically sit on the terrain height at their tile
- Place sample grass, stone, water, tree, house, rock and flower objects
- Select and drag objects to reposition them
- Import PNG images as map objects (PNG data is embedded in the project JSON)
- Three visibility-controlled layers: Ground, Objects and Decoration
- Edit X/Y/Z, scale and layer properties
- Undo/redo with Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z
- Delete selected objects with Delete/Backspace
- Save and open JSON projects
- Windows installer and portable build through GitHub Actions

## Current limitations
- Terrain height is currently a discrete per-tile heightmap (0–12 levels); smooth slopes, automatic ramps/stairs, water depth, and terrain sculpting by drag-brush are not implemented.
- Layer management currently supports visibility and assigning objects to the three built-in layers; custom layer creation/reordering is not implemented.
- PNG assets are embedded as data URLs in the project JSON, so very large images can make project files large.
- Collision editing, atlas slicing, map PNG export, and game-engine export formats are not implemented yet.


## Map dimensions (v0.4.0)

- Square map sizes from 16 × 16 up to 512 × 512 tiles.
- Presets: 16, 32, 64, 128, 256, and 512 tiles per side.
- Custom integer sizes are also accepted within the same range.
- The selected map size is saved in the project JSON and restored when reopening it.
- Canvas ground-grid drawing is viewport-culled to avoid iterating over the entire 512 × 512 map on every redraw.


## v0.6.0
- Added procedural random mountain generation with configurable maximum terrain height (1–12).
- Generated terrain is stored as normal terrain tiles and supports Undo/Redo and JSON save/load.

## v0.5.0 – Undo / Redo
- Undo/Redo via toolbar buttons, `Ctrl+Z` / `Ctrl+Y`, and `Ctrl+Shift+Z`.
- History retains up to 100 steps and restores map objects, selection, map dimensions, layer visibility, and project name.
- New edits clear the redo stack.


## v0.7.0
- Added Dungeon & Interior Generator for procedural room layouts.
- Choose Dungeon / Underground or Building Interior themes.
- Configure room count (2–30); rooms are connected with corridors.
- Automatically creates floor tiles, perimeter walls, and doorway openings.
- Generated geometry is stored as regular map objects and is included in JSON save/load and Undo/Redo.
- Dungeon uses stone-like floor and wall colors; interior uses wood-like colors.


## v0.9.0 — Multiple Room Shapes
- Added room shape selection: Mixed/Random, Rectangle, Circle, Octagon, L-Shape, and Cross.
- Room placement checks the actual shape footprint and keeps spacing for surrounding walls.
- Corridors connect room centers; floor, walls, and doors are generated as before.
- Room geometry is stored as ordinary terrain/object tiles, so existing project save/load and undo/redo continue to apply.


## v0.9.0
- Freeform / organic room footprints, configurable 1–5 dungeon floor levels, secret-room chance, and an optional final boss chamber with a central landmark.
- Terrain brush supports click-and-drag painting, brush radius, raise/set and lower modes; one drag is a single Undo step.
- Added Ramp and Stairs placement tools with orientation and rise settings.
- Map data stores `floorLevel`, `secret`, `boss`, and `orientation` metadata on objects.

Note: floor levels are represented as elevated tile layers in the current isometric renderer; this is a first-pass editor representation, not a full walkable multi-storey navigation system. Ramp/stairs are visual connector objects and do not yet enforce player traversal or collision.


## v1.0.0 — Low-spec Performance Optimization

- Added render quality presets: Low Spec, Balanced, and High Quality.
- Low Spec caps Canvas device-pixel ratio at 1x and disables image smoothing to reduce GPU fill and memory bandwidth.
- Canvas redraws are scheduled with `requestAnimationFrame` and resized through `ResizeObserver`, avoiding redundant synchronous paints.
- Static map background and isometric grid are cached in an offscreen canvas and reused while objects change.
- Visible objects, terrain lookup, and depth-sorted render lists are memoized between edits.
- Terrain and object rendering are culled outside the viewport.
- Object hit testing reuses a depth-sorted candidate list and a tile lookup map instead of repeatedly scanning the full object list.
- Terrain brush updates build a cell index once per stroke update instead of searching the object array for every painted cell.

Recommended setting for older PCs: **Low Spec · Fast**. Performance still depends on map size, object count, imported PNG dimensions, and the computer's GPU/CPU.
