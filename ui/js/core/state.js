// =============================================================================
// AppState — Centralized State Management
// =============================================================================
// Single source of truth para todo o estado da aplicação
// Compatível com sistema legado durante transição

'use strict';

const AppState = (() => {
  // Private state object
  const state = {
    // === NAVIGATION ===
    navigation: {
      mode: 'GLOBAL',           // GLOBAL | TAG | ELEMENT
      currentTag: null,
      currentElement: null,
      previousMode: 'GLOBAL',
      breadcrumb: ['GLOBAL']
    },

    // === FILTERS ===
    filters: {
      search: '',
      storey: '',
      tag: ''
    },

    // === DATA ===
    data: {
      rows: [],                 // Fonte original de dados
      tags: {},                 // Modelo de tags { TAG: { elementos, total_elementos, ... } }
      metrics: {},              // Métricas calculadas globais
      byStorey: {}              // Dados organizados por pavimento
    },

    // === SELECTION ===
    selection: {
      selectedTag: null,
      selectedElement: null,
      selectedStorey: null,
      highlightedRow: null
    },

    // === UI STATE ===
    ui: {
      loading: false,
      loadingMessage: '',
      modalOpen: null,          // 'settings' | 'ifc' | 'export' | null
      sidebarExpanded: true,
      searchFocused: false,
      currentTable: 'elements'   // 'elements' | 'ifcSummary' | 'storeys'
    },

    // === CACHE ===
    cache: {
      lastKPIs: null,
      lastMetrics: null,
      tagSignature: '',
      elementCount: 0
    },

    // === SETTINGS ===
    settings: {
      roundLength: '0.00',
      formatLength: 'number',
      roundArea: '0.00',
      formatArea: 'number',
      roundVolume: '0.00',
      formatVolume: 'number',
      decimalSeparator: '.',
      currency: 'USD'
    }
  };

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    // --- GETTERS ---
    getState() {
      // ✅ HARDENING: Return deep copy to prevent external mutations
      return JSON.parse(JSON.stringify(state));
    },

    getNavigation() {
      return { ...state.navigation };
    },

    getMode() {
      return state.navigation.mode;
    },

    getCurrentTag() {
      return state.navigation.currentTag;
    },

    getCurrentElement() {
      return state.navigation.currentElement;
    },

    getFilters() {
      return { ...state.filters };
    },

    getData() {
      return {
        rows: state.data.rows.slice(),
        tags: JSON.parse(JSON.stringify(state.data.tags)),
        metrics: { ...state.data.metrics }
      };
    },

    getRows() {
      return state.data.rows.slice();
    },

    getTags() {
      return state.data.tags;
    },

    getMetrics() {
      return { ...state.data.metrics };
    },

    getUI() {
      return { ...state.ui };
    },

    getSettings() {
      return { ...state.settings };
    },

    getBreadcrumb() {
      return state.navigation.breadcrumb.slice();
    },

    // --- SETTERS ---

    setMode(mode) {
      if (['GLOBAL', 'TAG', 'ELEMENT'].includes(mode)) {
        state.navigation.previousMode = state.navigation.mode;
        state.navigation.mode = mode;
        this._updateBreadcrumb();
      }
    },

    setCurrentTag(tag) {
      state.navigation.currentTag = tag;
      if (tag) {
        state.navigation.mode = 'TAG';
      }
      this._updateBreadcrumb();
    },

    setCurrentElement(elementKey) {
      state.navigation.currentElement = elementKey;
      if (elementKey) {
        state.navigation.mode = state.navigation.currentTag ? 'TAG' : 'ELEMENT';
      } else if (state.navigation.currentTag) {
        state.navigation.mode = 'TAG';
      } else if (state.navigation.mode === 'ELEMENT') {
        state.navigation.mode = 'GLOBAL';
      }
      this._updateBreadcrumb();
    },

    setData(rows, tags, metrics) {
      state.data.rows = Array.isArray(rows) ? rows : [];
      state.data.tags = typeof tags === 'object' ? tags : {};
      state.data.metrics = typeof metrics === 'object' ? metrics : {};
      state.cache.elementCount = state.data.rows.length;
    },

    setRows(rows) {
      state.data.rows = Array.isArray(rows) ? rows : [];
    },

    setTags(tags) {
      state.data.tags = typeof tags === 'object' ? tags : {};
    },

    setMetrics(metrics) {
      state.data.metrics = typeof metrics === 'object' ? metrics : {};
    },

    setFilter(filterName, value) {
      if (filterName in state.filters) {
        state.filters[filterName] = String(value);
      }
    },

    clearFilters() {
      state.filters = {
        search: '',
        storey: '',
        tag: ''
      };
    },

    setSearchTerm(term) {
      state.filters.search = String(term);
    },

    setStoreyFilter(storey) {
      state.filters.storey = String(storey);
    },

    setLoading(isLoading, message = '') {
      state.ui.loading = Boolean(isLoading);
      state.ui.loadingMessage = String(message);
    },

    setModal(modalName) {
      state.ui.modalOpen = modalName || null;
    },

    setSetting(key, value) {
      if (key in state.settings) {
        state.settings[key] = value;
      }
    },

    setSettings(settings) {
      if (typeof settings === 'object') {
        Object.assign(state.settings, settings);
      }
    },

    // --- STATE TRANSITIONS ---

    backToGlobal() {
      state.navigation.currentTag = null;
      state.navigation.currentElement = null;
      state.navigation.mode = 'GLOBAL';
      state.filters.storey = '';
      state.filters.search = '';
      this._updateBreadcrumb();
    },

    backToTag() {
      if (state.navigation.currentTag) {
        state.navigation.currentElement = null;
        state.navigation.mode = 'TAG';
        this._updateBreadcrumb();
      }
    },

    selectElement(elementKey, tag) {
      state.navigation.currentElement = elementKey;
      if (tag) {
        state.navigation.currentTag = tag;
      }
      state.navigation.mode = state.navigation.currentTag ? 'TAG' : 'ELEMENT';
      this._updateBreadcrumb();
    },

    // --- HELPERS ---

    _updateBreadcrumb() {
      const crumb = ['GLOBAL'];
      if (state.navigation.currentTag) {
        crumb.push(state.navigation.currentTag);
      }
      if (state.navigation.currentElement) {
        crumb.push(state.navigation.currentElement);
      }
      state.navigation.breadcrumb = crumb;
    },

    // --- UTILITIES ---

    reset() {
      state.navigation.mode = 'GLOBAL';
      state.navigation.currentTag = null;
      state.navigation.currentElement = null;
      state.filters = { search: '', storey: '', tag: '' };
      state.data = { rows: [], tags: {}, metrics: {}, byStorey: {} };
      state.ui.loading = false;
      this._updateBreadcrumb();
    },

    debug() {
      console.log('[AppState]', state);
      return state;
    },

    // ✅ HARDENING: Validate state integrity
    validateIntegrity() {
      const issues = [];

      // Check mode consistency
      if (state.navigation.mode === 'ELEMENT' && !state.navigation.currentElement) {
        issues.push('Mode is ELEMENT but currentElement is null');
        state.navigation.mode = 'TAG';
      }

      if (state.navigation.mode === 'TAG' && !state.navigation.currentTag) {
        issues.push('Mode is TAG but currentTag is null');
        state.navigation.mode = 'GLOBAL';
      }

      // Check breadcrumb consistency
      const expectedBreadcrumb = ['GLOBAL'];
      if (state.navigation.currentTag) {
        expectedBreadcrumb.push(state.navigation.currentTag);
      }
      if (state.navigation.currentElement) {
        expectedBreadcrumb.push(state.navigation.currentElement);
      }

      if (JSON.stringify(state.navigation.breadcrumb) !== JSON.stringify(expectedBreadcrumb)) {
        issues.push('Breadcrumb out of sync');
        state.navigation.breadcrumb = expectedBreadcrumb;
      }

      if (issues.length > 0) {
        console.warn('[AppState] Integrity issues detected:', issues);
      }

      return {
        valid: issues.length === 0,
        issues: issues
      };
    }
  };
})();

// Exportar para uso global
window.AppState = AppState;
