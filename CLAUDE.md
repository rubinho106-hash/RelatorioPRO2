# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RelatorioPRO is a BIM (Building Information Modeling) dashboard that runs as a SketchUp extension dialog. It processes IFC building element data and presents it as an interactive dashboard with KPIs, tables, and bidirectional selection sync with SketchUp.

The UI is a standalone HTML/JS/CSS web app loaded inside SketchUp's WebDialog/HtmlDialog. There is no build system — files are served directly.

## Running Python Scripts

VS Code tasks are configured in `.vscode/tasks.json`:

```powershell
python python/analytics.py     # Generates json/summary.json from json/elements.json
python python/grouping.py      # Generates json/groups.json from json/elements.json
```

These scripts read from `json/elements.json` and write output JSON files consumed by the UI.

## Testing / Verification

There is no automated test runner. Verification is done in the browser DevTools console after loading the dialog in SketchUp (or directly opening the HTML file):

```javascript
// Run full Phase 1 integration test suite
IntegrationTest.runAll()

// Run quick event-driven flow checks
QuickCheck.runAll()

// Run full diagnostics report (all layers)
Diagnostics.run()

// Validate dashboard module contracts
DashboardContracts.validateAll(AppState.getState())
```

## Architecture

### Layer 1 — Core Foundation (load order is critical)

Scripts must load in this exact order:

1. `ui/js/core/state.js` — **AppState**: singleton state manager. Single source of truth for `navigation` (mode, currentTag, currentElement), `filters` (search, storey), and `data` (rows, tags, metrics). Navigation modes: `GLOBAL | TAG | ELEMENT`.
2. `ui/js/core/eventBus.js` — **EventBus**: pub/sub bus. All event names are normalized to lowercase. Predefined event constants live on `EventBus.Events`. Never use string literals; reference `EventBus.Events.*`.
3. `ui/js/core/bridge.js` — **Bridge**: the only permitted interface to `window.sketchup`. Never call `window.sketchup` directly. Use `Bridge.isAvailable()` to guard SketchUp-only calls.
4. `ui/js/legacy/adapter.js` — **LegacyAdapter**: proxies legacy globals (`window.currentMode`, `window.currentTag`, etc.) to AppState so old code continues working unchanged.

### Layer 2 — UI Modules

Each UI module (`KPICardsModule`, `BreadcrumbModule`, `SidebarModule`, `DetailsModule`) receives data validated against a contract defined in `ui/js/contracts/dashboard.contracts.js`. The contract system throws in strict mode (currently enabled) if required fields are missing or wrong type.

### Layer 3 — Services & Utilities

- `ui/js/services/dataLoader.js` — **RelatorioDataLoader**: fetches `elements.json`, `groups.json`, and `summary.json` with path-candidate fallback, then calls `window.updateData()` and fires `EventBus.Events.DATA_LOADED`.
- `ui/js/core/kpiEngine.js` — **KPIEngine**: pure computation (no DOM). Calculates per-tag KPIs with priority: volume → metro linear → area.
- `ui/js/export-excel.js` — Excel export using the bundled SheetJS (`ui/js/xlsx.full.min.js`). Reads the live DOM table and `window.tagModel` / `window.relatorioTagDashboard` globals.

### Data Flow

```
SketchUp Ruby → Bridge.requestDataRefresh() → window.updateData() → RelatorioDataLoader
→ EventBus.emit(DATA_LOADED) → UI modules re-render via AppState
```

For standalone/browser mode: `RelatorioDataLoader.bootstrapFromJson()` loads the JSON files directly.

### JSON Schema

`json/schema.json` defines the element schema. Required fields per element: `id`, `name`, `type` (IFC class, e.g. `IfcWall`), `level` (storey), `material`, `volume`, `area`. Additional properties are allowed.

### Key Global State Variables

The following are proxied globals (write to them → AppState updates automatically):
- `window.currentMode` / `window.currentTag` / `window.currentElement`
- `window.tagModel` — tag → grouped element data, read by KPIEngine and Excel export
- `window.relatorioTagDashboard` — pre-built model for Excel export
- `window.relatorioIfcSummary` — IFC-by-storey summary for Excel storey sheet

## Architecture Constraints

- **Never call `window.sketchup.*` directly** — always use `Bridge`.
- **Never add cross-dependencies between core modules** — AppState, EventBus, and Bridge must remain independent; they communicate only through the EventBus or AppState.
- New UI code should listen to EventBus events and read from AppState, not from legacy globals.
- Legacy code in `info.js` still works unchanged via LegacyAdapter; migrate functions to the new pattern incrementally.
- Language is fixed to Portuguese (`pt`); the language loader in `ui/languages/language.js` sets this on load.
