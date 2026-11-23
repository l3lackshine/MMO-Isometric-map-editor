# Blackshine Map Editor

Standalone Windows desktop editor for creating Isometric 2.5D MMORPG maps.

**Version:** 1.0.0  
**Stack:** Electron 33, React 18, TypeScript, electron-vite, HTML Canvas.

## Features

- Isometric map canvas with object placement and editing.
- Map sizes from 16×16 through 512×512.
- Terrain elevation levels 0–12, elevation walls, ramps/slopes and stairs.
- Terrain brush with adjustable brush size and raise/lower operations.
- Procedural mountain generation.
- Procedural dungeon/interior generation with multiple room shapes, organic rooms, multiple floors, secret rooms and boss chambers.
- Layers, visibility controls, project naming, JSON save/load and undo/redo history.
- Performance modes: Low Spec, Balanced and High Quality, with canvas scaling and render optimizations.

## Development

Requires Node.js 22+.

```bash
npm install
npm run dev
```

## Build Windows installers

```bash
npm install
npm run build:win
```

The Windows build produces NSIS installer and portable executable files in `release/`.

A GitHub Actions workflow at `.github/workflows/build-windows.yml` builds Windows artifacts on pushes to `main`, version tags, or manual dispatch.

## Validation status

The v1.0.0 source archive was checked for ZIP integrity. TypeScript transpile diagnostics reported no syntax errors. A full typecheck and Windows packaging have not yet been verified in this environment; GitHub Actions is configured to perform the Windows build.
