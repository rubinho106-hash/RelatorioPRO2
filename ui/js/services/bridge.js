// =============================================================================
// Bridge — SketchUp Integration Layer
// =============================================================================
// Interface única para comunicação com SketchUp
// Evita window.sketchup espalhado pela UI
// Padroniza requests e respostas

'use strict';

const Bridge = (() => {
  // Check if SketchUp API is available
  const isSketchUpAvailable = () => typeof window.sketchup === 'object';

  // Safe call to SketchUp
  const _safeCall = (method, args = []) => {
    try {
      if (!isSketchUpAvailable()) {
        console.warn(`[Bridge] SketchUp not available for: ${method}`);
        return null;
      }

      if (typeof window.sketchup[method] === 'function') {
        return window.sketchup[method](...args);
      } else {
        console.warn(`[Bridge] Method not found: window.sketchup.${method}`);
        return null;
      }
    } catch (error) {
      console.error(`[Bridge] Error calling ${method}:`, error);
      return null;
    }
  };

  const _reloadJsonWithRetry = (retries, intervalMs) => {
    if (!window.RelatorioDataLoader || typeof window.RelatorioDataLoader.reloadFromJson !== 'function') {
      return Promise.resolve(false);
    }

    let attempt = 0;
    const runAttempt = () => {
      attempt += 1;
      return window.RelatorioDataLoader.reloadFromJson().then((loaded) => {
        if (loaded) {
          return true;
        }

        if (attempt >= retries) {
          return false;
        }

        return new Promise((resolve) => {
          setTimeout(() => resolve(runAttempt()), intervalMs);
        });
      });
    };

    return runAttempt();
  };

  window.addEventListener('relatoriopro:pipelineFinished', () => {
    _reloadJsonWithRetry(8, 250);
  });

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    /**
     * Check if running inside SketchUp
     */
    isAvailable() {
      return isSketchUpAvailable();
    },

    /**
     * Highlight/select element in SketchUp model
     * @param {string|Array} entityId - Entity ID(s) to highlight
     */
    highlightEntity(entityId) {
      if (!entityId) return;

      EventBus.emit(EventBus.Events.SELECTION_HIGHLIGHT, { entityId });

      if (Array.isArray(entityId)) {
        entityId.forEach(id => _safeCall('highlight', [String(id)]));
      } else {
        _safeCall('highlight', [String(entityId)]);
      }
    },

    /**
     * Focus entity (similar to highlight)
     * @param {string} entityId - Entity ID
     */
    focusEntity(entityId) {
      if (!entityId) return;
      _safeCall('focus_entity', [String(entityId)]);
    },

    /**
     * Zoom to selected entity
     */
    zoomSelection() {
      EventBus.emit(EventBus.Events.SELECTION_ZOOM);
      _safeCall('zoomSelection', []);
    },

    /**
     * Zoom to entity
     * @param {string} entityId - Entity ID
     */
    zoomEntity(entityId) {
      if (!entityId) return;
      _safeCall('zoom_entity', [String(entityId)]);
    },

    /**
     * Clear current selection
     */
    clearSelection() {
      _safeCall('clear_selection', []);
    },

    /**
     * Select multiple entities
     * @param {Array<string>} entityIds - Array of entity IDs
     */
    selectEntities(entityIds) {
      if (!Array.isArray(entityIds)) return;

      entityIds.forEach(id => {
        _safeCall('select_entity', [String(id)]);
      });
    },

    /**
     * Select all model entities that belong to a TAG/LAYER
     * @param {string} tagName - TAG name
     * @param {object} options - { focus: boolean, isolate: boolean }
     */
    selectTagEntities(tagName, options = {}) {
      const name = String(tagName || '').trim();
      if (!name) return;

      const focus = !!(options && options.focus);
      const isolate = !!(options && options.isolate);
      _safeCall('select_tag_entities', [name, focus, isolate]);
    },

    /**
     * Clear temporary TAG isolation and restore original visibility
     */
    clearTagIsolation() {
      _safeCall('clear_tag_isolation', []);
    },

    /**
     * Request data refresh from Ruby backend
     */
    requestDataRefresh() {
      console.log('[Bridge] Requesting data refresh...');
      EventBus.emit(EventBus.Events.UI_LOADING_START, { message: 'Atualizando dados...' });

      // Priority 1: ask Ruby to read the CURRENT SketchUp model and push rows to UI.
      if (this.hasMethod('request_data')) {
        _safeCall('request_data', []);
        return Promise.resolve(true);
      }

      const hasPipelineRunner = this.hasMethod('run_full_pipeline');
      if (hasPipelineRunner) {
        _safeCall('run_full_pipeline', []);
        return _reloadJsonWithRetry(12, 350).then((loaded) => {
          if (!loaded) {
            _safeCall('request_data', []);
          }
          return loaded;
        });
      }

      _safeCall('request_data', []);
      return _reloadJsonWithRetry(4, 250);
    },

    /**
     * Export to Excel
     * @param {object} options - Export options
     */
    exportExcel(options = {}) {
      EventBus.emit(EventBus.Events.EXPORT_EXCEL, options);
      _safeCall('export_excel', []);
    },

    /**
     * Export to CSV
     * @param {object} options - Export options
     */
    exportCsv(options = {}) {
      EventBus.emit(EventBus.Events.EXPORT_CSV, options);
      _safeCall('export_csv', []);
    },

    /**
     * Log message to Ruby console
     * @param {string} message - Message to log
     */
    log(message) {
      _safeCall('log', [String(message)]);
    },

    /**
     * Generic method call to SketchUp
     * @param {string} method - Method name
     * @param {Array} args - Arguments
     */
    call(method, args = []) {
      return _safeCall(method, args);
    },

    /**
     * Check if method exists in SketchUp API
     * @param {string} method - Method name
     */
    hasMethod(method) {
      return isSketchUpAvailable() && typeof window.sketchup[method] === 'function';
    },

    /**
     * Get all available methods in SketchUp API
     */
    getAvailableMethods() {
      if (!isSketchUpAvailable()) return [];

      return Object.keys(window.sketchup).filter(key =>
        typeof window.sketchup[key] === 'function'
      );
    },

    /**
     * Debug info
     */
    debug() {
      return {
        available: isSketchUpAvailable(),
        methods: this.getAvailableMethods()
      };
    }
  };
})();

// Exportar para uso global
window.Bridge = Bridge;
