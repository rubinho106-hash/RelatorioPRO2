// =============================================================================
// LegacyAdapter - Backward Compatibility Layer
// =============================================================================
// Mantem globals/funcoes legadas sincronizadas com AppState sem acoplar a UI.

'use strict';

(function () {
  function hasAppState() {
    return typeof window.AppState !== 'undefined';
  }

  function toAppMode(mode) {
    const normalized = String(mode || '').toUpperCase();
    if (normalized === 'ELEMENT' || normalized === 'ELEMENTO') return 'ELEMENT';
    if (normalized === 'TAG') return 'TAG';
    return 'GLOBAL';
  }

  function toLegacyMode(mode) {
    const normalized = String(mode || '').toUpperCase();
    if (normalized === 'ELEMENT') return 'element';
    if (normalized === 'TAG') return 'tag';
    return 'global';
  }

  function defineLegacyProperty(name, getter, setter) {
    if (Object.prototype.hasOwnProperty.call(window, name)) {
      return;
    }

    Object.defineProperty(window, name, {
      configurable: true,
      enumerable: true,
      get: getter,
      set: setter
    });
  }

  defineLegacyProperty('currentMode', function () {
    if (!hasAppState()) return 'global';
    return toLegacyMode(window.AppState.getMode());
  }, function (value) {
    if (!hasAppState()) return;
    window.AppState.setMode(toAppMode(value));
  });

  defineLegacyProperty('currentTag', function () {
    if (!hasAppState()) return null;
    return window.AppState.getCurrentTag();
  }, function (value) {
    if (!hasAppState()) return;
    window.AppState.setCurrentTag(value || null);
  });

  defineLegacyProperty('currentElement', function () {
    if (!hasAppState()) return null;
    return window.AppState.getCurrentElement();
  }, function (value) {
    if (!hasAppState()) return;
    window.AppState.setCurrentElement(value || null);
  });

  defineLegacyProperty('currentStoreyFilter', function () {
    if (!hasAppState()) return '';
    return window.AppState.getFilters().storey || '';
  }, function (value) {
    if (!hasAppState()) return;
    window.AppState.setStoreyFilter(value || '');
  });

  defineLegacyProperty('dashboardSearchTerm', function () {
    if (!hasAppState()) return '';
    return window.AppState.getFilters().search || '';
  }, function (value) {
    if (!hasAppState()) return;
    window.AppState.setSearchTerm(value || '');
  });

  const LegacyAdapter = {
    name: 'LegacyAdapter',
    version: '1.0.0',

    syncFromState() {
      return {
        mode: toLegacyMode(hasAppState() ? window.AppState.getMode() : 'GLOBAL'),
        currentTag: hasAppState() ? window.AppState.getCurrentTag() : null,
        currentElement: hasAppState() ? window.AppState.getCurrentElement() : null,
        filters: hasAppState() ? window.AppState.getFilters() : { search: '', storey: '' }
      };
    },

    debug() {
      return {
        appStateAvailable: hasAppState(),
        snapshot: this.syncFromState()
      };
    }
  };

  window.LegacyAdapter = LegacyAdapter;
})();
