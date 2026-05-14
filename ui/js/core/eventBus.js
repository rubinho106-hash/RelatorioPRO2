// =============================================================================
// EventBus — Publish-Subscribe System
// =============================================================================
// Sistema de eventos desacoplado para comunicação entre componentes
// Suporta namespaces, wildcard listeners, e once()

'use strict';

const EventBus = (() => {
  // Private listeners registry
  const listeners = new Map();

  // Private internal methods
  const _normalizeEvent = (event) => String(event).toLowerCase().trim();

  const _getListeners = (event) => {
    const normalized = _normalizeEvent(event);
    if (!listeners.has(normalized)) {
      listeners.set(normalized, []);
    }
    return listeners.get(normalized);
  };

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    /**
     * Subscribe to an event
     * @param {string} event - Event name (supports namespaces: 'tag:selected')
     * @param {function} callback - Handler function
     * @returns {function} Unsubscribe function
     */
    on(event, callback) {
      if (typeof callback !== 'function') {
        console.warn('[EventBus.on] Invalid callback for event:', event);
        return () => {};
      }

      const listeners = _getListeners(event);
      listeners.push({ callback, once: false });

      // Return unsubscribe function
      return () => this.off(event, callback);
    },

    /**
     * Subscribe to event, trigger once, then unsubscribe
     * @param {string} event - Event name
     * @param {function} callback - Handler function
     * @returns {function} Unsubscribe function
     */
    once(event, callback) {
      if (typeof callback !== 'function') {
        console.warn('[EventBus.once] Invalid callback for event:', event);
        return () => {};
      }

      const listeners = _getListeners(event);
      listeners.push({ callback, once: true });

      // Return unsubscribe function
      return () => this.off(event, callback);
    },

    /**
     * Unsubscribe from an event
     * @param {string} event - Event name
     * @param {function} callback - Handler to remove
     */
    off(event, callback) {
      const normalized = _normalizeEvent(event);
      if (!listeners.has(normalized)) return;

      const list = listeners.get(normalized);
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].callback === callback) {
          list.splice(i, 1);
        }
      }
    },

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Event payload
     * @param {boolean} async - Fire callbacks asynchronously
     */
    emit(event, data, async = false) {
      const normalized = _normalizeEvent(event);
      if (!listeners.has(normalized)) return;

      const list = listeners.get(normalized);
      const toRemove = [];

      const executeCallbacks = () => {
        for (let i = 0; i < list.length; i++) {
          const { callback, once } = list[i];
          try {
            callback(data);
            if (once) {
              toRemove.push(i);
            }
          } catch (error) {
            console.error(`[EventBus] Error in listener for '${event}':`, error);
          }
        }

        // Remove once-only listeners
        for (let i = toRemove.length - 1; i >= 0; i--) {
          list.splice(toRemove[i], 1);
        }
      };

      if (async) {
        Promise.resolve().then(executeCallbacks);
      } else {
        executeCallbacks();
      }
    },

    /**
     * Remove all listeners for an event
     * @param {string} event - Event name (omit to clear all)
     */
    clear(event) {
      if (!event) {
        listeners.clear();
      } else {
        const normalized = _normalizeEvent(event);
        listeners.delete(normalized);
      }
    },

    /**
     * Get listener count for an event
     * @param {string} event - Event name
     * @returns {number} Number of listeners
     */
    listenerCount(event) {
      const normalized = _normalizeEvent(event);
      return listeners.has(normalized) ? listeners.get(normalized).length : 0;
    },

    /**
     * Get all registered events
     * @returns {Array<string>} List of event names
     */
    eventNames() {
      return Array.from(listeners.keys());
    },

    /**
     * Debug: log all listeners
     */
    debug() {
      console.log('[EventBus] Registered events:');
      listeners.forEach((list, event) => {
        console.log(`  ${event}: ${list.length} listener(s)`);
      });
      return {
        events: Array.from(listeners.keys()),
        listenerMap: Object.fromEntries(
          Array.from(listeners.entries()).map(([event, list]) => [
            event,
            list.length
          ])
        )
      };
    }
  };
})();

// Common event names (for reference and autocomplete)
EventBus.Events = {
  // Navigation
  NAVIGATION_MODE_CHANGED: 'navigation:modeChanged',
  TAG_SELECTED: 'tag:selected',
  ELEMENT_SELECTED: 'element:selected',
  BACK_TO_TAG: 'navigation:backToTag',
  BACK_TO_GLOBAL: 'navigation:backToGlobal',

  // Data
  DATA_LOADED: 'data:loaded',
  DATA_UPDATED: 'data:updated',
  TAGS_UPDATED: 'tags:updated',
  METRICS_UPDATED: 'metrics:updated',

  // Filters
  FILTER_CHANGED: 'filter:changed',
  SEARCH_TERM_CHANGED: 'search:changed',
  STOREY_FILTER_CHANGED: 'storey:changed',

  // UI
  UI_LOADING_START: 'ui:loadingStart',
  UI_LOADING_END: 'ui:loadingEnd',
  MODAL_OPENED: 'modal:opened',
  MODAL_CLOSED: 'modal:closed',

  // Render
  RENDER_REQUESTED: 'render:requested',
  RENDER_KPI: 'render:kpi',
  RENDER_TABLE: 'render:table',
  RENDER_SIDEBAR: 'render:sidebar',
  RENDER_BREADCRUMB: 'render:breadcrumb',

  // SketchUp Bridge
  SELECTION_HIGHLIGHT: 'sketchup:highlight',
  SELECTION_ZOOM: 'sketchup:zoom',
  SELECTION_FOCUS: 'sketchup:focus',

  // Export
  EXPORT_EXCEL: 'export:excel',
  EXPORT_CSV: 'export:csv'
};

// Exportar para uso global
window.EventBus = EventBus;
