# Modern Retro Frontend

A premium, modern frontend for EmulationStation/RetroBat built with Electron, React, and TypeScript.

## Features

- Fully compatible with RetroBat/ES configuration and gamelists.
- High-performance UI with Framer Motion animations.
- SQLite-ready architecture for fast game indexing.
- Direct integration with `emulatorLauncher.exe`.

## Getting Started

### 1. Install Dependencies

Since PowerShell execution policies might be restricted, use CMD to install:

```bash
cmd /c npm install
```

### 2. Run in Development

```bash
cmd /c npm run dev
```

### 3. Deploy for Production

```bash
cmd /c npm run deploy
```

## Structure

- `src/main`: Electron main process (logic, parsers, services).
- `src/renderer`: React frontend (UI, stores, components).
- `src/shared`: Shared types and utilities.
- `src/preload`: IPC bridge.

## Relative Paths

The app is designed to be placed in the `/emulationstation` folder of your RetroBat installation. It automatically resolves paths relative to its location to find ROMs and configurations.
