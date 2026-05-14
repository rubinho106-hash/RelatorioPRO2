# Phase 1 — Architecture Foundation

## Overview
Phase 1 establishes the **core infrastructure** for RelatorioPRO's transition to enterprise modular architecture. This layer runs **in parallel** with legacy code (`info.js`, `settings.js`, etc.) without breaking existing functionality.

## Core Components

### 1. **AppState** (`state.js`) — Centralized State Management
Single source of truth for all application state using the singleton FIFO pattern.

```javascript
// Get current state
AppState.getState()        // Returns full state object
AppState.getMode()         // 'GLOBAL' | 'TAG' | 'ELEMENT'
AppState.getCurrentTag()   // Current tag name or null
AppState.getCurrentElement() // Current element ID or null

// Update state
AppState.setMode('TAG')
AppState.setCurrentTag('PILAR')
AppState.setData(rows, tags, metrics)
AppState.setSearchTerm('search text')
AppState.setStoreyFilter('pavimento 1')

// Navigation helpers
AppState.backToGlobal()    // Navigate to GLOBAL mode
AppState.backToTag()       // Navigate back to TAG from ELEMENT
AppState.selectElement(elementKey, currentTag)
```

**State Structure:**
- `navigation`: mode, currentTag, currentElement, breadcrumb
- `filters`: search, storey, tag
- `data`: rows, tags, metrics
- `selection`: selectedTag, selectedElement
- `ui`: loading, modalOpen
- `cache`: lastKPIs, tagSignature
- `settings`: roundLength, decimalSeparator, etc.

---

### 2. **EventBus** (`eventBus.js`) — Event Pub/Sub System
Decoupled event communication with namespace support and `once()` listeners.

```javascript
// Subscribe to events
EventBus.on('tag:selected', (data) => {
  console.log('Tag selected:', data.tag);
});

// Emit events
EventBus.emit('tag:selected', { tag: 'PILAR' });

// Single-fire listeners
EventBus.once('data:loaded', (data) => {
  console.log('Data arrived:', data);
});

// Unsubscribe
EventBus.off('tag:selected', callbackFn);

// Debug
EventBus.listenerCount('tag:selected')  // Get count
EventBus.eventNames()                   // List all active events
EventBus.debug()                        // Full debug info
```

**Predefined Events:**
- Navigation: `tag:selected`, `element:selected`, `navigation:backToTag`, `navigation:backToGlobal`
- Data: `data:loaded`, `data:updated`, `tags:updated`, `metrics:updated`
- Filters: `filter:changed`, `search:changed`, `storey:changed`
- Render: `render:requested`, `render:kpi`, `render:table`, `render:sidebar`
- SketchUp: `sketchup:highlight`, `sketchup:zoom`, `sketchup:focus`

---

### 3. **Bridge** (`bridge.js`) — SketchUp Integration Standardization
Single interface to all SketchUp API calls. **NEVER** call `window.sketchup` directly.

```javascript
// Check availability
if (Bridge.isAvailable()) { /* Running in SketchUp */ }

// Entity selection
Bridge.highlightEntity('entity_123')
Bridge.focusEntity('entity_456')
Bridge.zoomSelection()
Bridge.clearSelection()
Bridge.selectEntities(['e1', 'e2', 'e3'])

// Data operations
Bridge.requestDataRefresh()  // Ask Ruby backend for data

// Export
Bridge.exportExcel()
Bridge.exportCsv()

// Logging
Bridge.log('Debug message to SketchUp console')

// Generic calls
Bridge.call('custom_method', [arg1, arg2])
```

---

### 4. **LegacyAdapter** (`adapter.js`) — Backward Compatibility Layer
Maintains all legacy code functionality while exposing new AppState API. Legacy code continues working unchanged.

```javascript
// Legacy globals now proxied to AppState
window.currentMode              // → AppState.getMode()
window.currentTag               // → AppState.getCurrentTag()
window.currentElement           // → AppState.getCurrentElement()
window.currentStoreyFilter      // → AppState.getFilters().storey
window.dashboardSearchTerm      // → AppState.getFilters().search

// Legacy functions auto-exposed
backToGlobalMode()              // → AppState.backToGlobal() + event
backToTagMode()                 // → AppState.backToTag() + event
selectTag('PILAR')              // → AppState.setCurrentTag() + event
setDashboardSearchTerm('text')  // → AppState.setSearchTerm() + event
getDashboardMode()              // Returns current mode from AppState
```

---

## Integration Guide

### For Existing Code (`info.js`)
**No changes needed!** Code continues working as-is:

```javascript
// Old code still works
renderDashboard()
selectTag('PILAR')
window.currentMode = 'TAG'

// Can also use new systems if desired
AppState.setCurrentTag('PILAR')
EventBus.emit('tag:selected', { tag: 'PILAR' })
```

### For New Code
Use the new systems immediately:

```javascript
// Modular, event-driven approach
class TagPanel {
  constructor() {
    // Listen for state changes
    EventBus.on('tag:selected', (data) => this.render(data.tag))
  }

  selectTag(tag) {
    // Update state through AppState, not direct DOM
    AppState.setCurrentTag(tag)
    // Event fires automatically, triggers listener above
  }

  render(tag) {
    const tagData = AppState.getTags()[tag]
    // Render using AppState data
  }
}
```

---

## Script Load Order (Critical)
Must load in this **exact order** in HTML:

```html
<script src="js/core/state.js"></script>         <!-- AppState -->
<script src="js/core/eventBus.js"></script>      <!-- EventBus -->
<script src="js/core/bridge.js"></script>        <!-- Bridge -->
<script src="js/legacy/adapter.js"></script>     <!-- LegacyAdapter (enables legacy code) -->
<script src="js/info.js"></script>               <!-- Legacy code now can access new systems -->
```

---

## Architecture Principles

### 1. **Single Responsibility**
- `state.js` → Pure state management
- `eventBus.js` → Pure event communication
- `bridge.js` → Pure SketchUp abstraction
- `adapter.js` → Pure legacy compatibility

### 2. **No Cross-Dependencies**
- Components don't know about each other
- Communication via AppState and EventBus
- Bridge never calls AppState, AppState never calls Bridge

### 3. **Backward Compatibility**
- Old code runs unchanged in parallel
- New code runs alongside old code
- Gradual migration, no hard cutover

### 4. **Event-Driven**
- State changes emit events
- Components listen to events
- Decoupled, scalable communication

---

## Testing & Verification

Run integration tests in browser console:

```javascript
// Run all tests
IntegrationTest.runAll()

// Manual verification
console.log(AppState.getState())
console.log(EventBus.eventNames())
console.log(Bridge.debug())
console.log(LegacyAdapter.debug())
```

Expected output:
```
✅ AppState (State Management)
✅ EventBus (Event System)
✅ Bridge (SketchUp Integration)
✅ LegacyAdapter (Backward Compatibility)
✅ Script Load Order
📊 Results: 5/5 tests passed
```

---

## Next Steps (Phase 2+)

Once Phase 1 foundation stabilizes (no breaking issues in production):

1. **Modular Dashboard** (`js/dashboard/`) — Extract `renderDashboard()` from `info.js`
2. **Modular Table** (`js/table/`) — Extract `renderTabela()` into reusable component
3. **Services Layer** (`js/services/`) — API calls, data transformations
4. **UI Components** (`js/ui/`) — Reusable buttons, modals, etc.
5. **Full Migration** — Move `info.js` logic into modules

Each phase maintains parallel execution until all code is migrated.

---

## Performance Notes

- **No overhead for legacy code**: Proxies are native JS, negligible impact
- **EventBus is zero-config**: No registration needed, fires immediately
- **AppState is in-memory**: No localStorage/API calls by default
- **Bridge is lazy**: Only calls SketchUp when explicitly invoked

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "AppState is not defined" | Scripts loading in wrong order |
| "EventBus listeners not firing" | Check event name case (normalized to lowercase) |
| "Legacy globals not updating" | Ensure adapter.js loads before info.js |
| "Bridge calls failing" | Check `Bridge.isAvailable()` — may not be in SketchUp |

---

## Questions?

This architecture is designed for:
- ✅ Zero breaking changes to existing code
- ✅ Gradual, module-by-module migration
- ✅ Professional enterprise patterns
- ✅ Incremental execution and testing
- ✅ Clear separation of concerns

The system is **production-ready**. Legacy code continues working while new code uses modern patterns.
