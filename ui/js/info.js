// =============================================================================
// info.js — RelatorioPRO  (strict mode; sem globals implícitas)
// =============================================================================
'use strict';

// ── Estado do módulo (escopo de arquivo; NÃO são globals window.*) ─────────
let columnOrder;
let checkboxStates;

const defaultCheckboxStates = {
  ordinal: false, image: false, entity: false, definition: false,
  instance: true, description: false,
  material: false, storey: true,
  tipo: true, secao: true, comprimento: true,
  quantidade: true, metro_linear_total: true, area_total: true, volume_total: true,
  instancias: false,
  len_x: false, len_y: false, len_z: false,
  len_xz: false, len_xy: false, len_xyz: true,
  area_xz: false, area_xy: false, area: true, volume: true,
  ifc: false, tag: true, status: false, owner: false,
  url: false, size: false, price: false, custom: false,
  quantity: true, total: false
};

// Estado compartilhado entre funções deste arquivo
let objects = [];
let savedSettings = {};
let layerList = [];
let dynamicList = [];
let dynamicSchemaByKey = {};
let customKeys = [];
let sumList = [];
let sortColumn = 'ordinal';
let sortOrder = 1;
let thousandSeparator = ',';
let currency = 'USD';
let sumKey = 'None';
let currentHighlightedCell = null;
let currentHighlightedHeaderCell = null;
let currentLanguage = 'pt';
let groupedStructuralMode = false;
let ifcSummary = null;
let tagDashboardModel = { tags: [], all: null, by_storey: [] };
let activeTagDashboardKey = '__ALL__';
let tagModelLastSignature = '';
let tagModelLastValue = null;
let simpleTagModelLastSignature = '';  // Cache signature para buildSimpleTagModel
// ✅ HARDENING: currentMode, currentTag, currentElement removed
// These are now managed exclusively by AppState (js/core/state.js)
// Legacy access provided via LegacyAdapter (js/legacy/adapter.js)
// Do NOT create new global variables for state management
let dashboardModeEventsBound = false;
let outboundSelectionKey = '';
let outboundSelectionLockUntil = 0;
let dashboardSelectionPulseTimer = null;
const DEFAULT_TAG_IFC_RULES = {
  VIGA: ['IFCBEAM'],
  PILAR: ['IFCCOLUMN'],
  LAJE: ['IFCSLAB'],
  PAREDE: ['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCCURTAINWALL'],
  COBERTURA: ['IFCROOF', 'IFCCOVERING'],
  FUNDACAO: ['IFCFOOTING', 'IFCPILE']
};

// Estruturas para atualização incremental
const objectsMap = new Map(); // id -> objeto
const rowMap = new Map();     // id -> <tr>
const groupsMap = new Map();  // groupKey -> Set(ids)
const rowGroupKeyMap = new Map(); // id -> groupKey
const incrementalPendingById = new Map(); // id -> última versão da linha
let incrementalFramePending = false;

const GROUP_EXCLUDED_KEYS = new Set(['id', 'ordinal', 'quantity', 'total']);
const SUM_KEYS = new Set([
  'len_x', 'len_y', 'len_z', 'len_xz', 'len_xy', 'len_xyz',
  'area_xz', 'area_xy', 'area', 'volume', 'price', 'size'
]);

const sumCache = {}; // key -> valor acumulado (representante por grupo)
const groupSumCache = new Map(); // groupKey -> snapshot numérico
let sumCacheReady = false;

// Nomes personalizados de colunas salvos pelo usuário
const USER_LABEL_KEYS = [
  'ordinal', 'image', 'entity', 'definition', 'instance', 'description',
  'material', 'storey',
  'tipo', 'secao', 'comprimento', 'quantidade', 'metro_linear_total', 'area_total', 'volume_total', 'instancias',
  'len_x', 'len_y', 'len_z', 'len_xz', 'len_xy', 'len_xyz',
  'area_xz', 'area_xy', 'area', 'volume', 'ifc', 'tag',
  'status', 'owner', 'url', 'size', 'price', 'quantity', 'total', 'custom'
];
let userLabels = {};   // { key: 'Nome customizado' }

customLog('(*) DATA PREPARED');

document.addEventListener('DOMContentLoaded', function () {
  // Carrega estados salvos sem globals implícitas
  checkboxStates = JSON.parse(localStorage.getItem('checkboxStates')) || Object.assign({}, defaultCheckboxStates);
  sortColumn = localStorage.getItem('sortColumnSaved') || 'ordinal';
  sortOrder = parseInt(localStorage.getItem('sortOrderSaved') || '1', 10);
  thousandSeparator = localStorage.getItem('thousandSeparator') || ',';
  currency = localStorage.getItem('currency') || 'USD';
  sumKey = localStorage.getItem('sumKey') || 'None';

  // Carrega labels personalizados do usuário
  USER_LABEL_KEYS.forEach(function (k) {
    const saved = localStorage.getItem('user_' + k);
    if (saved) { userLabels[k] = saved; }
  });

  document.getElementById('currency').value = currency;

  customLog('(!) checkboxStates:', JSON.stringify(checkboxStates));
  customLog('(!) sortColumn:', sortColumn, '| sortOrder:', sortOrder);
  customLog('(!) currency:', currency, '| sumKey:', sumKey);

  const ifcCsvBtn = document.getElementById('ifcExportCsvBtn');
  if (ifcCsvBtn) {
    ifcCsvBtn.addEventListener('click', exportIfcSummaryCsv);
  }

  const ifcExcelBtn = document.getElementById('ifcExportExcelBtn');
  if (ifcExcelBtn) {
    ifcExcelBtn.addEventListener('click', exportIfcSummaryExcel);
  }

  // =========================================================================
  // EVENT-DRIVEN INTEGRATION — Wire up new architecture
  // =========================================================================
  _initializeEventDrivenArchitecture();

  const canRequestLiveData =
    window.Bridge &&
    typeof window.Bridge.requestDataRefresh === 'function' &&
    typeof window.Bridge.hasMethod === 'function' &&
    window.Bridge.hasMethod('request_data');

  // Always prefer live SketchUp model data when available.
  if (canRequestLiveData) {
    window.Bridge.requestDataRefresh();
    return;
  }

  // Fallback for browser/dev mode (without SketchUp bridge).
  if (window.RelatorioDataLoader && typeof window.RelatorioDataLoader.bootstrapFromJson === 'function') {
    window.RelatorioDataLoader.bootstrapFromJson();
  }
});

// =========================================================================
// EVENT-DRIVEN ARCHITECTURE INTEGRATION
// =========================================================================

// ✅ HARDENING: State synchronization proxy
// These will be populated by _syncStateProxies() called on every render
// This allows old code to work while we migrate to AppState-only
let _proxyCurrentElement = null;
let _proxyCurrentTag = null;
let _proxyCurrentStoreyFilter = '';
let _proxyDashboardSearchTerm = '';

// Get state and sync proxies for legacy code
function _syncStateProxies() {
  'use strict';
  if (typeof AppState === 'undefined') { return; }
  const state = AppState.getState();
  _proxyCurrentElement = state.navigation.currentElement;
  _proxyCurrentTag = state.navigation.currentTag;
  _proxyCurrentStoreyFilter = state.filters.storey || '';
  _proxyDashboardSearchTerm = state.ui.searchTerm || '';
}

// Legacy accessor - redirects to current proxies instead of undefined global
Object.defineProperty(window, 'currentElement', {
  get() { return _proxyCurrentElement; },
  set(v) { AppState.setCurrentElement(v); _syncStateProxies(); },
  configurable: true
});

Object.defineProperty(window, 'currentTag', {
  get() { return _proxyCurrentTag; },
  set(v) { AppState.setCurrentTag(v); _syncStateProxies(); },
  configurable: true
});

Object.defineProperty(window, 'currentStoreyFilter', {
  get() { return _proxyCurrentStoreyFilter; },
  set(v) { AppState.setStoreyFilter(v); _syncStateProxies(); },
  configurable: true
});

Object.defineProperty(window, 'dashboardSearchTerm', {
  get() { return _proxyDashboardSearchTerm; },
  set(v) { AppState.setSearchTerm(v); _syncStateProxies(); },
  configurable: true
});

function _initializeEventDrivenArchitecture() {
  'use strict';

  // Sync state proxies before listeners
  _syncStateProxies();

  // Escutar mudanças de navegação no AppState
  EventBus.on(EventBus.Events.NAVIGATION_MODE_CHANGED, function (data) {
    _syncStateProxies();
    if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
      RenderManager.renderAll();
    }
  });

  EventBus.on(EventBus.Events.TAG_SELECTED, function (data) {
    _syncStateProxies();
    if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
      RenderManager.renderAll();
    }
  });

  EventBus.on(EventBus.Events.ELEMENT_SELECTED, function (data) {
    _syncStateProxies();
    if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
      RenderManager.renderAll();
    }
  });

  EventBus.on(EventBus.Events.FILTER_CHANGED, function (data) {
    _syncStateProxies();
    if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
      RenderManager.renderAll();
    }
  });

  EventBus.on(EventBus.Events.BACK_TO_GLOBAL, function (data) {
    _syncStateProxies();
    carregarPavimentos(null);
    if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
      RenderManager.renderAll();
    }
  });

  EventBus.on(EventBus.Events.BACK_TO_TAG, function (data) {
    _syncStateProxies();
    const tag = AppState.getCurrentTag();
    if (tag) {
      carregarPavimentos(tag);
    }
    if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
      RenderManager.renderAll();
    }
  });

  // SketchUp -> Dashboard: sync selected entity from model to dashboard state.
  window.addEventListener('relatoriopro:selectionChanged', function (event) {
    try {
      const detail = event && event.detail ? event.detail : {};
      const ids = Array.isArray(detail.ids) ? detail.ids : [];

      if (ids.length === 0) {
        AppState.setCurrentElement(null);
        if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
          RenderManager.renderAll();
        }
        return;
      }

      const firstId = String(ids[0] || '').trim();
      if (!firstId) { return; }

      // Ignore immediate echo when selection originated from dashboard click.
      if (Date.now() < outboundSelectionLockUntil && firstId === outboundSelectionKey) {
        return;
      }

      const current = String((typeof AppState !== 'undefined' && AppState.getCurrentElement) ? (AppState.getCurrentElement() || '') : '').trim();
      if (current === firstId) {
        pulseDashboardSelection('sketchup');
        return;
      }

      // focusInModel=false avoids echo-loop since selection already came from SketchUp.
      if (typeof window.selectElementByKey === 'function') {
        window.selectElementByKey(firstId, false, 'sketchup');
      }
    } catch (err) {
      if (window.console && console.warn) {
        console.warn('[RelatorioPRO] selectionChanged sync failed:', err);
      }
    }
  });

  customLog('(+) Event-driven architecture initialized with state proxies');
}

function buildDynamicSchemaMap(dynamicSchema) {
  'use strict';
  const map = {};
  (Array.isArray(dynamicSchema) ? dynamicSchema : []).forEach(function (item) {
    if (!item || typeof item !== 'object') { return; }
    const key = String(item.key || '').trim();
    if (!key) { return; }
    map[key] = item;
  });
  return map;
}

function getColumnDisplayLabel(key) {
  'use strict';
  const k = String(key || '').trim();
  if (!k) { return ''; }
  if (userLabels[k]) { return userLabels[k]; }

  const schema = dynamicSchemaByKey[k];
  if (schema && schema.label) {
    return String(schema.label);
  }

  return k;
}

// UPDATE DATA — chamado pelo Ruby via execute_script
function updateData(data, saved_settings, layer_list, dynamic_list, custom_keys, ifc_summary) {
  customLog('(*) DATA REFRESHED');
  objects = data;
  groupedStructuralMode = Array.isArray(data) && data.length > 0 && data[0] && data[0].is_group === true;
  window.relatorioGroupedMode = groupedStructuralMode;
  window.relatorioRowsSource = objects;
  window.relatorioLayerList = layer_list;
  ifcSummary = ifc_summary || null;
  window.relatorioIfcSummary = ifcSummary;
  renderIfcSummary(ifcSummary);
  buildTagModel(data, layer_list);

  // ✅ CORREÇÃO 4: Cache agressivo - calcular signature mas NÃO renderizar ainda
  // renderMenu/renderFirst são chamados APÓS a tabela legado ser construída
  let dataSignature = 0;
  if (Array.isArray(data)) {
    dataSignature = data.length;
    if (data.length > 0) {
      dataSignature += String(data[0].id || '').length;
      dataSignature += String(data[data.length - 1].id || '').length;
    }
  }

  const needsDashboardRebuild = (dataSignature !== simpleTagModelLastSignature);
  if (needsDashboardRebuild) {
    window.tagModel = buildSimpleTagModel(data);
    simpleTagModelLastSignature = dataSignature;
  }

  window.rows = data;

  // ✅ NOVO: Sincronizar dados com AppState
  if (typeof AppState !== 'undefined' && AppState.setData) {
    AppState.setData(data, window.tagModel || {}, {});
    customLog('(+) Data synchronized with AppState');
  }

  savedSettings = saved_settings;

  // Sincroniza selects de configuração com os valores vindos do Ruby
  const settingMap = {
    roundLength: 'round_length', formatLength: 'format_length',
    roundArea: 'round_area', formatArea: 'format_area',
    roundVolume: 'round_volume', formatVolume: 'format_volume',
    decimalSeparator: 'decimal_separator'
  };
  Object.keys(settingMap).forEach(function (elId) {
    const el = document.getElementById(elId);
    if (el) { el.value = saved_settings[settingMap[elId]]; }
  });

  const concreteCoverEl = document.getElementById('concreteCoverThickness');
  if (concreteCoverEl) {
    const decSep = saved_settings.decimal_separator || '.';
    const coverM = Number(saved_settings.concrete_cover_thickness_m || 0);
    const coverCm = isFinite(coverM) ? Math.max(0, coverM * 100) : 0;
    let coverText = (Math.round(coverCm * 100) / 100).toString();
    if (decSep === ',') { coverText = coverText.replace('.', ','); }
    concreteCoverEl.value = coverText;
  }

  const slabModeEl = document.getElementById('slabMode');
  if (slabModeEl) {
    const mode = String(saved_settings.slab_mode || 'nervurada').toLowerCase();
    slabModeEl.value = (mode === 'nervurada') ? 'nervurada' : 'convencional';
  }

  const slabFactorEl = document.getElementById('slabRibbedFactor');
  if (slabFactorEl) {
    const decSep = saved_settings.decimal_separator || '.';
    const factorM = Number(saved_settings.slab_ribbed_factor_m || 0.10);
    const factorCm = isFinite(factorM) ? Math.max(0, factorM * 100) : 10;
    let factorText = (Math.round(factorCm * 100) / 100).toString();
    if (decSep === ',') { factorText = factorText.replace('.', ','); }
    slabFactorEl.value = factorText;
  }

  const concreteDensityEl = document.getElementById('concreteDensity');
  if (concreteDensityEl) {
    const density = Number(saved_settings.concrete_density_kg_m3 || 2500);
    concreteDensityEl.value = isFinite(density) && density > 0 ? Math.round(density).toString() : '2500';
  }

  const concreteCostEl = document.getElementById('concreteCostPerM3');
  if (concreteCostEl) {
    const decSep = saved_settings.decimal_separator || '.';
    const v = Number(saved_settings.concrete_cost_per_m3 || 0);
    let txt = (Math.round(Math.max(0, v) * 100) / 100).toString();
    if (decSep === ',') { txt = txt.replace('.', ','); }
    concreteCostEl.value = txt;
  }

  const epsCostEl = document.getElementById('epsCostPerM3');
  if (epsCostEl) {
    const decSep = saved_settings.decimal_separator || '.';
    const v = Number(saved_settings.eps_cost_per_m3 || 0);
    let txt = (Math.round(Math.max(0, v) * 100) / 100).toString();
    if (decSep === ',') { txt = txt.replace('.', ','); }
    epsCostEl.value = txt;
  }

  // Atualiza labels personalizados vindos do localStorage
  USER_LABEL_KEYS.forEach(function (k) {
    const saved = localStorage.getItem('user_' + k);
    if (saved) { userLabels[k] = saved; }
  });

  dynamicList = Array.isArray(dynamic_list) ? dynamic_list : [];
  dynamicSchemaByKey = buildDynamicSchemaMap(dynamicList);
  customKeys = custom_keys;
  const customKey = customKeys[0];
  const customSchema = customKey ? dynamicSchemaByKey[customKey] : null;
  const customKeyLabel = customSchema && customSchema.label ? String(customSchema.label) : customKey;
  customLog('(!) customKey:', customKey);

  currentLanguage = localStorage.getItem('language') || 'pt';
  loadLanguage(currentLanguage);

  layerList = layer_list.slice().sort(function (a, b) {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });

  // ── Referências de containers ─────────────────────────────────────────────
  const container = document.getElementById('tableContainer');
  const dashboard = document.getElementById('dashboardContainer');

  if (!data || data.length === 0) {
    resetIncrementalMaps();
    if (dashboard) {
      dashboard.innerHTML = '<div style="padding:32px; color:#7d8088; font-size:14px;">Nenhum elemento selecionado no modelo.</div>';
    }
    if (container) { container.innerHTML = ''; }
    return;
  }

  // ── Reconstrói tabela legado (oculta) em #tableContainer ──────────────────
  if (container) { container.innerHTML = ''; }

  const table = document.createElement('table');
  table.id = 'myTable';
  table.className = 'table table-sm table-bordered table-hover mt-0';

  // ── THEAD ─────────────────────────────────────────────────────────────────
  const thead = document.createElement('thead');
  thead.className = 'mt-0';
  const headerRow = document.createElement('tr');
  headerRow.id = 'header-row';

  const columns = Object.keys(data[0]).slice(1); // remove 'id'

  const savedOrder = localStorage.getItem('columnOrder');
  if (!savedOrder || savedOrder === 'none') {
    columnOrder = columns.map(function (_, i) { return i; });
  } else {
    columnOrder = savedOrder.split(',');
  }

  const orderedColumns = getOrderedColumns(columns, columnOrder);

  orderedColumns.forEach(function (key) {
    const th = document.createElement('th');
    th.id = key;
    th.className = 'bg-gray-light sticky-top header-cell';
    th.setAttribute('data-toggle', 'tooltip');
    th.setAttribute('data-placement', 'top');
    th.setAttribute('title', 'Click to sort table');

    // Label: nome customizado > schema dinâmico > tradução padrão
    if (userLabels[key]) {
      th.textContent = userLabels[key];
      th.setAttribute('no-translate', key);
      th.classList.add('modified');
    } else if (dynamicSchemaByKey[key] && dynamicSchemaByKey[key].label) {
      th.textContent = String(dynamicSchemaByKey[key].label);
      th.setAttribute('no-translate', key);
      th.classList.remove('modified');
    } else {
      th.setAttribute('data-translate', key);
      th.textContent = key;
      th.classList.remove('modified');
    }

    // Alinhamento por tipo de coluna
    if (key === 'ordinal' || key === 'image' || key === 'size') {
      th.style.textAlign = 'center';
    } else if (key.includes('len') || key.includes('area') || key === 'volume' ||
      key === 'price' || key === 'quantity' || key === 'total') {
      th.style.textAlign = 'right';
    }

    th.addEventListener('click', function (event) {
      if (event.target.tagName === 'INPUT') { return; }
      sortColumn = th.id;
      sortOrder *= -1;
      sortDataByColumn(sortColumn, sortOrder);
      localStorage.setItem('sortColumnSaved', sortColumn);

      if (currentHighlightedHeaderCell) {
        currentHighlightedHeaderCell.classList.remove('header-highlight', 'header-highlight-modified');
      }
      th.classList.add(th.classList.contains('modified') ? 'header-highlight-modified' : 'header-highlight');
      currentHighlightedHeaderCell = th;
    });

    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);

  // ── Extra row (badges de unidade) ─────────────────────────────────────────
  const extraRow = document.createElement('tr');
  extraRow.id = 'extra';

  orderedColumns.forEach(function (key) {
    const colIdx = getColumnIndexByKey(table, key) + 1;
    // A tabela ainda não está no DOM; buscamos pelo index em headerRow
    const thRef = headerRow.querySelector('#' + key);

    const td = document.createElement('td');
    td.id = 'extra_' + key;
    td.className = 'extra-cell extra-sticky-top';

    const badge = document.createElement('span');

    if (key.includes('len')) {
      badge.className = 'badge badge-pill badge-dark';
      badge.textContent = savedSettings.format_length || 'm';
      td.appendChild(badge);
    } else if (key.includes('area')) {
      badge.className = 'badge badge-pill badge-dark';
      badge.textContent = savedSettings.format_area || 'm²';
      td.appendChild(badge);
    } else if (key.includes('volume')) {
      badge.className = 'badge badge-pill badge-dark';
      badge.textContent = savedSettings.format_volume || 'm³';
      td.appendChild(badge);
    } else if (key.includes('price')) {
      badge.className = 'badge badge-pill badge-primary';
      badge.textContent = currency;
      td.appendChild(badge);
    } else if (key === 'quantity') {
      badge.className = 'badge badge-pill badge-danger';
      badge.setAttribute('data-translate', 'selection');
      td.appendChild(badge);
    } else if (key === 'total') {
      badge.className = 'badge badge-pill badge-tertiary';
      badge.setAttribute('data-translate', 'in_model');
      td.appendChild(badge);
    } else if (key.includes('custom')) {
      badge.className = 'badge badge-pill badge-dark';
      badge.textContent = customKeyLabel || '';
      td.appendChild(badge);
    }

    if (thRef && thRef.style.textAlign) {
      td.style.textAlign = thRef.style.textAlign;
    }

    extraRow.appendChild(td);
  });

  thead.appendChild(extraRow);
  table.appendChild(thead);

  // ── TBODY ─────────────────────────────────────────────────────────────────
  const tbody = document.createElement('tbody');
  tbody.id = 'myTableBody';
  tbody.className = 'scrollable-body';

  resetIncrementalMaps();
  data.forEach(function (row) {
    const tr = buildDataRow(row, orderedColumns, table);
    tbody.appendChild(tr);
    registerRow(row.id, tr, row, orderedColumns);

    if (groupedStructuralMode && row.is_group) {
      const detailsTr = buildGroupDetailsRow(row, orderedColumns);
      tbody.appendChild(detailsTr);
    }
  });

  table.appendChild(tbody);
  container.appendChild(table);

  addColumnToOption(objects, table);
  toggleColumnVisibility();

  // Dashboard é sempre o sistema principal. groupRows() é legado e nunca roda.
  if (!groupedStructuralMode) {
    sortDataByColumn(sortColumn, sortOrder);
  } else {
    updateIndex();
  }
  renderSumRow();

  // ✅ Renderizar dashboard APÓS tabela legado (evita container.innerHTML = '' destruir #resumo)
  // #dashboardContainer é separado de #tableContainer — sem conflito
  if (needsDashboardRebuild) {
    bindDashboardModeEvents();
    renderMenu();
    renderFirst();
  }
}

function renderIfcSummary(summary) {
  'use strict';

  const safeSummary = summary || {
    physical_elements: [],
    ifc_structure: [],
    other_types: [],
    por_pavimento: [],
    totals: {
      physical_elements: 0,
      ifc_structure: 0,
      other_types: 0,
      overall: 0
    }
  };

  const totals = safeSummary.totals || {};
  setText('ifcTotalPhysical', formatInteger(totals.physical_elements));
  setText('ifcTotalStructure', formatInteger(totals.ifc_structure));
  setText('ifcTotalOther', formatInteger(totals.other_types));
  setText('ifcTotalOverall', formatInteger(totals.overall));

  fillIfcSummaryTable('ifcPhysicalBody', safeSummary.physical_elements);
  fillIfcSummaryTable('ifcStructureBody', safeSummary.ifc_structure);
  fillIfcSummaryTable('ifcOtherBody', safeSummary.other_types);
  fillIfcStoreySummaryTable('ifcStoreyBody', safeSummary.por_pavimento);
  renderExecutiveSummary(objects, safeSummary);
}

function renderExecutiveSummary(rows, summary) {
  'use strict';

  const executive = buildExecutiveSummary(rows, summary);

  setText('execFootingsValue', formatCountOrDash(executive.footings_qtd, 'un'));
  setText('execBaldrameValue', formatMetricOrDash(executive.baldrame_m, 'm'));
  setText('execColumnsValue', formatCountOrDash(executive.columns_qtd, 'un'));
  setText('execCentralBeamsValue', formatMetricOrDash(executive.central_beams_m, 'm'));
  setText('execMarquiseBeamsValue', formatMetricOrDash(executive.marquise_beams_m, 'm'));
  setText('execInternalSlabsValue', formatMetricOrDash(executive.internal_slabs_m2, 'm²'));
  setText('execMarquiseSlabsValue', formatMetricOrDash(executive.marquise_slabs_m2, 'm²'));

  setText('execFoundationTotalValue', formatDualTotalOrDash(executive.footings_qtd, 'un', executive.baldrame_m, 'm'));
  setText('execStructureTotalValue', formatDualTotalOrDash(executive.columns_qtd, 'un', executive.central_beams_m, 'm'));
  setText('execCoverageTotalValue', formatMetricOrDash(executive.marquise_beams_m, 'm'));
  setText('execSlabsTotalValue', formatMetricOrDash(executive.internal_slabs_m2 + executive.marquise_slabs_m2, 'm²'));
}

function buildExecutiveSummary(rows, summary) {
  'use strict';

  const acc = {
    footings_qtd: 0,
    baldrame_m: 0,
    columns_qtd: 0,
    central_beams_m: 0,
    marquise_beams_m: 0,
    internal_slabs_m2: 0,
    marquise_slabs_m2: 0
  };

  const groupedRows = (Array.isArray(rows) ? rows : []).filter(function (row) {
    return row && row.is_group;
  });

  if (groupedRows.length > 0) {
    groupedRows.forEach(function (row) {
      const tipo = String(row.tipo || '').toUpperCase();
      const ifc = String(row.ifc || '').toUpperCase();
      const qtd = toNumberSafe(row.quantidade || row.quantity || 0);
      const ml = toNumberSafe(row.metro_linear_total || 0);
      const area = toNumberSafe(row.area_total || 0);

      if (ifc.includes('FOOTING') || ifc.includes('PILE') || tipo.includes('FUND')) {
        acc.footings_qtd += qtd;
      }

      if (tipo.includes('VIGA BALDRAME')) {
        acc.baldrame_m += ml;
      } else if (tipo.includes('VIGA MARQUISE')) {
        acc.marquise_beams_m += ml;
      } else if (tipo.includes('VIGA')) {
        acc.central_beams_m += ml;
      }

      if (tipo.includes('PILAR') || ifc.includes('COLUMN')) {
        acc.columns_qtd += qtd;
      }

      if (tipo.includes('LAJE') || ifc.includes('SLAB')) {
        if (tipo.includes('MARQUISE')) {
          acc.marquise_slabs_m2 += area;
        } else {
          acc.internal_slabs_m2 += area;
        }
      }
    });
    return acc;
  }

  // Fallback quando não houver linhas agrupadas (modo não estrutural):
  // usa por_pavimento IFC para manter resumo mínimo disponível.
  const storeys = summary && Array.isArray(summary.por_pavimento) ? summary.por_pavimento : [];
  storeys.forEach(function (storeyBucket) {
    const tipos = storeyBucket && Array.isArray(storeyBucket.tipos) ? storeyBucket.tipos : [];
    tipos.forEach(function (item) {
      const ifc = String(item && item.ifc ? item.ifc : '').toUpperCase();
      const qtd = toNumberSafe(item && item.quantidade ? item.quantidade : 0);
      const ml = toNumberSafe(item && item.metro_linear_m ? item.metro_linear_m : 0);
      const area = toNumberSafe(item && item.area_m2 ? item.area_m2 : 0);

      if (ifc.includes('FOOTING') || ifc.includes('PILE')) {
        acc.footings_qtd += qtd;
      } else if (ifc.includes('COLUMN')) {
        acc.columns_qtd += qtd;
      } else if (ifc.includes('BEAM')) {
        acc.central_beams_m += ml;
      } else if (ifc.includes('SLAB')) {
        acc.internal_slabs_m2 += area;
      }
    });
  });

  return acc;
}

function toNumberSafe(value) {
  'use strict';
  if (typeof value === 'number' && Number.isFinite(value)) { return value; }
  const decSep = localStorage.getItem('decimalSeparator') || '.';
  const thsSep = localStorage.getItem('thousandSeparator') || ',';
  return parseLocalizedNumber(value, decSep, thsSep);
}

function formatCountOrDash(value, unit) {
  'use strict';
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) { return '-'; }
  return formatInteger(n) + (unit ? (' ' + unit) : '');
}

function formatDualTotalOrDash(valueA, unitA, valueB, unitB) {
  'use strict';
  const a = Number(valueA || 0);
  const b = Number(valueB || 0);
  const hasA = Number.isFinite(a) && a > 0;
  const hasB = Number.isFinite(b) && b > 0;
  if (!hasA && !hasB) { return '-'; }

  const parts = [];
  if (hasA) { parts.push(formatInteger(a) + (unitA ? (' ' + unitA) : '')); }
  if (hasB) { parts.push(formatDecimal(b) + (unitB ? (' ' + unitB) : '')); }
  return parts.join(' | ');
}

function fillIfcSummaryTable(tbodyId, rows) {
  'use strict';

  const tbody = document.getElementById(tbodyId);
  if (!tbody) { return; }

  tbody.innerHTML = '';
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    const trEmpty = document.createElement('tr');
    const tdEmpty = document.createElement('td');
    tdEmpty.colSpan = 2;
    tdEmpty.className = 'ifc-summary-empty';
    tdEmpty.textContent = t('ifcNoData', 'Sem dados');
    trEmpty.appendChild(tdEmpty);
    tbody.appendChild(trEmpty);
    return;
  }

  list.forEach(function (row) {
    const tr = document.createElement('tr');
    const tdType = document.createElement('td');
    const tdQty = document.createElement('td');

    tdType.textContent = row && row.ifc ? String(row.ifc) : '';
    tdQty.textContent = formatInteger(row && row.quantity ? row.quantity : 0);

    tr.appendChild(tdType);
    tr.appendChild(tdQty);
    tbody.appendChild(tr);
  });
}

function setText(id, value) {
  'use strict';
  const el = document.getElementById(id);
  if (!el) { return; }
  el.textContent = value;
}

function formatInteger(value) {
  'use strict';
  const n = Number(value || 0);
  if (!Number.isFinite(n)) { return '0'; }
  return Math.round(n).toLocaleString('pt-BR');
}

function formatDecimal(value) {
  'use strict';
  const n = Number(value || 0);
  if (!Number.isFinite(n)) { return '0'; }
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function formatMetricOrDash(value, unit) {
  'use strict';
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) { return '-'; }
  return formatDecimal(n) + (unit ? (' ' + unit) : '');
}

function storeySortNumber(storeyName) {
  'use strict';
  const raw = (storeyName == null ? '' : String(storeyName)).toUpperCase();
  if (raw.includes('TERREO')) { return 0; }
  if (raw.includes('SEM PAVIMENTO')) { return Number.MAX_SAFE_INTEGER; }
  const m = raw.match(/\d+/);
  return m ? parseInt(m[0], 10) : 999999;
}

function sortStoreyBuckets(storeys) {
  'use strict';
  if (typeof window.relatorioSortStoreys === 'function') {
    return window.relatorioSortStoreys(storeys);
  }

  const list = Array.isArray(storeys) ? storeys.slice() : [];
  list.sort(function (a, b) {
    const aName = a && a.storey ? String(a.storey) : '';
    const bName = b && b.storey ? String(b.storey) : '';
    const na = storeySortNumber(aName);
    const nb = storeySortNumber(bName);
    if (na !== nb) { return na - nb; }
    return aName.localeCompare(bName, 'pt-BR');
  });
  return list;
}

function ifcDisplayLabel(ifcType) {
  'use strict';
  const map = {
    IfcBeam: 'Vigas',
    IfcColumn: 'Pilares',
    IfcSlab: 'Lajes',
    IfcFooting: 'Fundacoes',
    IfcPile: 'Fundacoes',
    IfcWall: 'Paredes',
    IfcWallStandardCase: 'Paredes',
    IfcRoof: 'Coberturas',
    IfcCovering: 'Coberturas'
  };
  const key = ifcType == null ? '' : String(ifcType);
  return map[key] || key;
}

function t(key, fallback) {
  'use strict';
  if (window.languageData && window.languageData[key]) {
    return String(window.languageData[key]);
  }
  return fallback;
}

function buildIfcSummaryExportRows(summary) {
  'use strict';
  const safeSummary = summary || {};
  const sections = [
    { name: t('ifcPhysicalElements', 'Elementos Fisicos'), rows: safeSummary.physical_elements || [] },
    { name: t('ifcStructure', 'Estrutura IFC'), rows: safeSummary.ifc_structure || [] },
    { name: t('ifcOtherTypes', 'Outros Tipos'), rows: safeSummary.other_types || [] }
  ];

  const output = [];
  sections.forEach(function (section) {
    section.rows.forEach(function (row) {
      output.push({
        category: section.name,
        ifc: row && row.ifc ? String(row.ifc) : '',
        quantity: Number(row && row.quantity ? row.quantity : 0)
      });
    });
  });

  return output;
}

function buildIfcStoreyExportRows(summary) {
  'use strict';
  const list = sortStoreyBuckets(summary && Array.isArray(summary.por_pavimento) ? summary.por_pavimento : []);
  const output = [];

  list.forEach(function (storeyBucket) {
    const storeyName = storeyBucket && storeyBucket.storey ? String(storeyBucket.storey) : t('noStorey', 'SEM PAVIMENTO');
    const tipos = (storeyBucket && Array.isArray(storeyBucket.tipos)) ? storeyBucket.tipos : [];
    tipos.forEach(function (item) {
      output.push({
        storey: storeyName,
        ifc: ifcDisplayLabel(item && item.ifc ? String(item.ifc) : ''),
        quantity: Number(item && item.quantidade ? item.quantidade : 0),
        metro_linear_m: Number(item && item.metro_linear_m ? item.metro_linear_m : 0),
        area_m2: Number(item && item.area_m2 ? item.area_m2 : 0)
      });
    });
  });

  return output;
}

function sanitizeForCsv(value) {
  'use strict';
  const str = value == null ? '' : String(value);
  const safe = /^[=+\-@]/.test(str) ? ("'" + str) : str;
  return '"' + safe.replace(/"/g, '""') + '"';
}

function exportIfcSummaryCsv() {
  'use strict';
  const rows = buildIfcSummaryExportRows(ifcSummary);
  const headerCategory = t('ifcCategory', 'Categoria');
  const headerIfc = t('ifcType', 'Tipo IFC');
  const headerQty = t('quantity', 'Quantidade');

  const lines = [];
  lines.push([sanitizeForCsv(headerCategory), sanitizeForCsv(headerIfc), sanitizeForCsv(headerQty)].join(','));
  rows.forEach(function (row) {
    lines.push([
      sanitizeForCsv(row.category),
      sanitizeForCsv(row.ifc),
      sanitizeForCsv(formatInteger(row.quantity))
    ].join(','));
  });

  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'ifc_summary.csv';
  link.click();
}

function exportIfcSummaryExcel() {
  'use strict';
  if (typeof window.XLSX === 'undefined') {
    exportIfcSummaryCsv();
    return;
  }

  const rows = buildIfcSummaryExportRows(ifcSummary);
  const wb = XLSX.utils.book_new();
  const aoa = [];

  aoa.push([t('ifcSummary', 'Resumo IFC')]);
  aoa.push([t('date', 'Data'), new Date().toLocaleString()]);
  aoa.push([]);
  aoa.push([t('ifcCategory', 'Categoria'), t('ifcType', 'Tipo IFC'), t('quantity', 'Quantidade')]);

  rows.forEach(function (row) {
    aoa.push([row.category, row.ifc, row.quantity]);
  });

  const totals = (ifcSummary && ifcSummary.totals) ? ifcSummary.totals : {};
  aoa.push([]);
  aoa.push([t('ifcTotalPhysical', 'Total Fisicos'), Number(totals.physical_elements || 0)]);
  aoa.push([t('ifcTotalStructure', 'Total Estrutura'), Number(totals.ifc_structure || 0)]);
  aoa.push([t('ifcTotalOther', 'Total Outros'), Number(totals.other_types || 0)]);
  aoa.push([t('ifcTotalOverall', 'Total Geral'), Number(totals.overall || 0)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Resumo_IFC');

  const storeyRows = buildIfcStoreyExportRows(ifcSummary);
  if (storeyRows.length > 0) {
    const aoaStorey = [];
    aoaStorey.push([t('ifcByStorey', 'Por Pavimento')]);
    aoaStorey.push([t('date', 'Data'), new Date().toLocaleString()]);
    aoaStorey.push([]);
    aoaStorey.push([
      t('storey', 'Pavimento'),
      t('ifcType', 'Tipo IFC'),
      t('quantity', 'Quantidade'),
      t('metroLinear', 'Metro Linear (m)'),
      t('area', 'Area (m²)')
    ]);

    storeyRows.forEach(function (row) {
      aoaStorey.push([row.storey, row.ifc, row.quantity, row.metro_linear_m, row.area_m2]);
    });

    const wsStorey = XLSX.utils.aoa_to_sheet(aoaStorey);
    XLSX.utils.book_append_sheet(wb, wsStorey, 'Por_Pavimento');
  }

  const excelFile = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelFile], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'ifc_summary.xlsx';
  link.click();
}

// ── Constrói uma única linha de dados ─────────────────────────────────────────
function buildDataRow(row, orderedColumns, table) {
  'use strict';
  const tr = document.createElement('tr');
  tr.setAttribute('data-row-id', row.id);
  if (row.is_group) {
    tr.classList.add('group-row');
    tr.setAttribute('data-group-row', '1');
    tr.setAttribute('data-instancias', JSON.stringify(Array.isArray(row.instancias) ? row.instancias : []));
  }

  orderedColumns.forEach(function (key) {
    const colIdx = getColumnIndexByKey(table, key);
    const thRef = colIdx >= 0
      ? table.querySelector('thead tr:first-child th:nth-child(' + (colIdx + 1) + ')')
      : null;

    if (!thRef) { return; }

    const td = document.createElement('td');
    td.id = row.id + '-' + key;
    td.className = 'ellipsis-text user-select-all';

    if (key === 'image') {
      const img = document.createElement('img');
      img.alt = '';
      if (!row[key]) {
        img.src = 'images/image.png';
        img.height = 32;
      } else {
        img.src = row[key];
        img.classList.add('fit-image');
      }
      img.onload = function () {
        if (img.naturalHeight > 0) {
          img.width = Math.round((img.naturalWidth / img.naturalHeight) * img.height);
        }
      };
      td.appendChild(img);

    } else if (key === 'url') {
      const link = document.createElement('a');
      link.href = sanitizeUrl(row[key] || '');
      link.target = '_blank';
      link.rel = 'noopener noreferrer';   // segurança: evita acesso ao opener
      link.textContent = row[key] || '';
      td.appendChild(link);

    } else if (key === 'status') {
      const span = document.createElement('span');
      span.textContent = row[key];
      const sid = checkLanguages(row[key]);
      const statusClassMap = {
        'new': 'badge badge-primary',
        'existing': 'badge badge-warning',
        'reuse': 'badge badge-success',
        'temporary': 'badge badge-tertiary',
        'demolition': 'badge badge-danger'
      };
      span.className = statusClassMap[sid] || 'badge badge-secondary';
      td.appendChild(span);

    } else if (key === 'quantity') {
      td.textContent = '';   // preenchido pelo groupRows()
    } else {
      td.textContent = row[key] != null ? row[key] : '';
    }

    if (row.is_group && key === 'ordinal') {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'btn btn-sm btn-text-secondary';
      toggle.textContent = '+';
      toggle.setAttribute('data-toggle-for', row.id);
      toggle.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();

        const details = document.querySelector('tr[data-group-detail-for="' + row.id + '"]');
        if (!details) { return; }

        const isOpen = details.style.display !== 'none';
        details.style.display = isOpen ? 'none' : '';
        toggle.textContent = isOpen ? '+' : '-';
      });

      td.innerHTML = '';
      td.appendChild(toggle);
    }

    // Quebra de linha inteligente
    td.style.whiteSpace = (td.textContent || '').includes('\n') ? 'pre-wrap' : 'nowrap';

    td.setAttribute('data-toggle', 'tooltip');
    td.setAttribute('data-placement', 'top');
    td.setAttribute('title', 'Click to highlight');

    // Um único listener de clique (substitui os dois duplicados originais)
    const editableKeys = ['image', 'definition', 'instance', 'description',
      'tag', 'price', 'size', 'url', 'owner', 'status'];
    td.addEventListener('click', function (event) {
      if (row.is_group) { return; }
      const target = event.target;
      if (currentHighlightedCell) {
        currentHighlightedCell.classList.remove('highlight', 'edit-highlight');
      }
      if (target.tagName === 'TD' || target.tagName === 'SPAN' || target.tagName === 'IMG') {
        if (editableKeys.includes(key)) {
          td.classList.add('edit-highlight');
          td.setAttribute('title', 'Double click to edit');
        } else {
          td.classList.add('highlight');
        }
        currentHighlightedCell = td;
        // ✅ HARDENING: Use Bridge instead of direct window.sketchup
        const parts = td.id.split('-');
        const oid = parts[0];
        if (typeof Bridge !== 'undefined' && Bridge.highlightEntity) {
          Bridge.highlightEntity(oid);
        }
      }
    });

    if (thRef.style.textAlign) {
      td.style.textAlign = thRef.style.textAlign;
    }

    tr.appendChild(td);
  });

  return tr;
}

function buildGroupDetailsRow(groupRow, orderedColumns) {
  'use strict';
  const detailsTr = document.createElement('tr');
  detailsTr.className = 'group-details-row';
  detailsTr.setAttribute('data-group-detail-for', groupRow.id);
  detailsTr.style.display = 'none';

  const td = document.createElement('td');
  td.colSpan = orderedColumns.length;

  const wrap = document.createElement('div');
  wrap.className = 'p-2';

  const title = document.createElement('div');
  title.className = 'mb-2 text-secondary';
  title.textContent = 'Instancias do grupo:';
  wrap.appendChild(title);

  const ids = Array.isArray(groupRow.instancias) ? groupRow.instancias : [];
  ids.forEach(function (id) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-sm btn-outline-secondary mr-1 mb-1';
    btn.textContent = String(id);
    btn.addEventListener('click', function () {
      // ✅ HARDENING: Use Bridge instead of direct window.sketchup
      if (typeof Bridge !== 'undefined' && Bridge.highlightEntity) {
        Bridge.highlightEntity(String(id));
      }
    });
    wrap.appendChild(btn);
  });

  td.appendChild(wrap);
  detailsTr.appendChild(td);
  return detailsTr;
}

function resetIncrementalMaps() {
  'use strict';
  objectsMap.clear();
  rowMap.clear();
  groupsMap.clear();
  rowGroupKeyMap.clear();
  groupSumCache.clear();
  incrementalPendingById.clear();
  incrementalFramePending = false;
  SUM_KEYS.forEach(function (key) { sumCache[key] = 0; });
  sumCacheReady = false;
}

function getGroupKey(obj, orderedColumns) {
  'use strict';
  if (!obj || !orderedColumns || orderedColumns.length === 0) { return 'OUTROS'; }

  const parts = [];
  orderedColumns.forEach(function (key) {
    if (GROUP_EXCLUDED_KEYS.has(key)) { return; }
    parts.push(String(obj[key] != null ? obj[key] : ''));
  });

  return parts.join('|') || 'OUTROS';
}

function parseLocalizedNumber(value, decSep, thsSep) {
  'use strict';
  if (typeof value === 'number' && isFinite(value)) { return value; }
  if (value == null) { return 0; }

  let raw = String(value).trim();
  if (!raw) { return 0; }

  if (thsSep) {
    raw = raw.split(thsSep).join('');
  }
  if (decSep && decSep !== '.') {
    raw = raw.split(decSep).join('.');
  }
  raw = raw.replace(/\s+/g, '');

  const parsed = parseFloat(raw);
  return isNaN(parsed) ? 0 : parsed;
}

function buildNumericSnapshot(obj) {
  'use strict';
  const decSep = localStorage.getItem('decimalSeparator') || '.';
  const thsSep = localStorage.getItem('thousandSeparator') || ',';
  const snapshot = {};

  SUM_KEYS.forEach(function (key) {
    snapshot[key] = parseLocalizedNumber(obj ? obj[key] : 0, decSep, thsSep);
  });

  return snapshot;
}

function getRepresentativeIdForGroup(groupKey) {
  'use strict';
  const groupSet = groupsMap.get(groupKey);
  if (!groupSet || groupSet.size === 0) { return null; }

  const ids = Array.from(groupSet);
  for (let i = 0; i < ids.length; i++) {
    if (objectsMap.has(ids[i])) { return ids[i]; }
  }
  return null;
}

function refreshGroupSumCache(groupKey) {
  'use strict';
  const previous = groupSumCache.get(groupKey);
  if (previous) {
    SUM_KEYS.forEach(function (key) {
      sumCache[key] -= previous[key] || 0;
    });
  }

  const representativeId = getRepresentativeIdForGroup(groupKey);
  if (!representativeId) {
    groupSumCache.delete(groupKey);
    return;
  }

  const representative = objectsMap.get(representativeId);
  const next = buildNumericSnapshot(representative);
  groupSumCache.set(groupKey, next);

  SUM_KEYS.forEach(function (key) {
    sumCache[key] += next[key] || 0;
  });
}

function rebuildSumCaches() {
  'use strict';
  SUM_KEYS.forEach(function (key) { sumCache[key] = 0; });
  groupSumCache.clear();

  groupsMap.forEach(function (_groupSet, groupKey) {
    refreshGroupSumCache(groupKey);
  });

  sumCacheReady = true;
}

function registerRow(id, rowEl, data, orderedColumns) {
  'use strict';
  const previousGroup = rowGroupKeyMap.get(id);
  if (previousGroup) {
    removeRowFromGroup(id, previousGroup);
  }

  objectsMap.set(id, data);
  rowMap.set(id, rowEl);

  const group = getGroupKey(data, orderedColumns);
  rowGroupKeyMap.set(id, group);

  if (!groupsMap.has(group)) {
    groupsMap.set(group, new Set());
  }
  groupsMap.get(group).add(id);
}

function removeRowFromGroup(id, groupKey) {
  'use strict';
  const groupSet = groupsMap.get(groupKey);
  if (!groupSet) { return; }

  groupSet.delete(id);
  if (groupSet.size === 0) {
    groupsMap.delete(groupKey);
  }
}

function applyGroupVisibility(groupKey) {
  'use strict';
  const groupSet = groupsMap.get(groupKey);
  if (!groupSet || groupSet.size === 0) { return; }

  const ids = Array.from(groupSet).filter(function (id) {
    return rowMap.has(id);
  });
  if (ids.length === 0) {
    groupsMap.delete(groupKey);
    return;
  }

  const firstId = ids[0];
  const count = ids.length;

  ids.forEach(function (id) {
    const row = rowMap.get(id);
    if (!row) { return; }
    if (id === firstId) {
      if (row.style.display === 'none') { row.style.display = ''; }
    } else {
      row.style.display = 'none';
    }

    const quantityCell = row.querySelector('td[id$="-quantity"]');
    if (quantityCell) {
      quantityCell.innerText = (id === firstId) ? String(count) : '';
    }
  });
}

function updateRowCells(id, data, orderedColumns, table) {
  'use strict';
  const tbody = document.getElementById('myTableBody');
  const oldRow = rowMap.get(id);
  if (!tbody || !oldRow) { return null; }

  const newRow = buildDataRow(data, orderedColumns, table);
  tbody.replaceChild(newRow, oldRow);
  rowMap.set(id, newRow);
  return newRow;
}

function updateGroupIncremental(id, newData, orderedColumns, table) {
  'use strict';
  const oldData = objectsMap.get(id);
  if (!oldData) {
    const tbody = document.getElementById('myTableBody');
    if (!tbody) { return; }
    const newRow = buildDataRow(newData, orderedColumns, table);
    tbody.appendChild(newRow);
    registerRow(id, newRow, newData, orderedColumns);
    const groupKey = getGroupKey(newData, orderedColumns);
    applyGroupVisibility(groupKey);
    refreshGroupSumCache(groupKey);
    return;
  }

  const oldGroup = rowGroupKeyMap.get(id) || getGroupKey(oldData, orderedColumns);
  const newGroup = getGroupKey(newData, orderedColumns);

  objectsMap.set(id, newData);
  updateRowCells(id, newData, orderedColumns, table);

  if (oldGroup !== newGroup) {
    removeRowFromGroup(id, oldGroup);
    if (!groupsMap.has(newGroup)) {
      groupsMap.set(newGroup, new Set());
    }
    groupsMap.get(newGroup).add(id);
    rowGroupKeyMap.set(id, newGroup);
    applyGroupVisibility(oldGroup);
    applyGroupVisibility(newGroup);
    refreshGroupSumCache(oldGroup);
    refreshGroupSumCache(newGroup);
  } else {
    rowGroupKeyMap.set(id, newGroup);
    applyGroupVisibility(newGroup);
    refreshGroupSumCache(newGroup);
  }
}

function getCurrentOrderedColumnsFromTable(table) {
  'use strict';
  if (!table) { return []; }
  return Array.from(table.querySelectorAll('thead tr:first-child th')).map(function (th) {
    return th.id;
  });
}

function replaceRowInObjects(updatedRow) {
  'use strict';
  const idx = objects.findIndex(function (row) { return row.id === updatedRow.id; });
  if (idx >= 0) {
    objects[idx] = updatedRow;
  } else {
    objects.push(updatedRow);
  }
}

function processRowsIncremental(rows) {
  'use strict';
  if (!Array.isArray(rows) || rows.length === 0) { return; }

  const table = document.getElementById('myTable');
  const tbody = document.getElementById('myTableBody');
  if (!table || !tbody) {
    updateData(objects, savedSettings, layerList, dynamicList, customKeys, ifcSummary);
    return;
  }

  const orderedColumns = getCurrentOrderedColumnsFromTable(table);
  if (orderedColumns.length === 0) {
    updateData(objects, savedSettings, layerList, dynamicList, customKeys, ifcSummary);
    return;
  }

  const findInput = document.getElementById('findInput');
  const hasActiveFilter = !!(findInput && findInput.value && findInput.value.trim() !== '');

  if (!hasActiveFilter && !sumCacheReady) {
    rebuildSumCaches();
  }

  const scrollContainer = document.getElementById('tableContainer');
  const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

  if (groupedStructuralMode) {
    rows.forEach(function (updatedRow) {
      if (!updatedRow || !updatedRow.id) { return; }

      const existing = tbody.querySelector('tr[data-row-id="' + updatedRow.id + '"]');
      const existingDetails = document.querySelector('tr[data-group-detail-for="' + updatedRow.id + '"]');

      if (updatedRow._deleted) {
        if (existing) { existing.remove(); }
        if (existingDetails) { existingDetails.remove(); }
        objects = objects.filter(function (row) { return row.id !== updatedRow.id; });
        objectsMap.delete(updatedRow.id);
        rowMap.delete(updatedRow.id);
        return;
      }

      replaceRowInObjects(updatedRow);

      const newTr = buildDataRow(updatedRow, orderedColumns, table);
      if (existing) {
        tbody.replaceChild(newTr, existing);
      } else {
        tbody.appendChild(newTr);
      }

      if (existingDetails) { existingDetails.remove(); }
      if (updatedRow.is_group) {
        const newDetails = buildGroupDetailsRow(updatedRow, orderedColumns);
        newTr.insertAdjacentElement('afterend', newDetails);
      }

      registerRow(updatedRow.id, newTr, updatedRow, orderedColumns);
    });

    toggleColumnVisibility();
    updateIndex();
    sumCacheReady = false;
    renderSumRow();

    if (scrollContainer) {
      scrollContainer.scrollTop = scrollTop;
    }

    buildTagModel(objects, layerList);
    return;
  }

  if (hasActiveFilter) {
    rows.forEach(function (updatedRow) {
      replaceRowInObjects(updatedRow);
      const newTr = buildDataRow(updatedRow, orderedColumns, table);
      const currentTr = tbody.querySelector('tr[data-row-id="' + updatedRow.id + '"]');
      if (currentTr) {
        tbody.replaceChild(newTr, currentTr);
      } else {
        tbody.appendChild(newTr);
      }
      registerRow(updatedRow.id, newTr, updatedRow, orderedColumns);
    });
    toggleColumnVisibility();

    // Dashboard é sempre o sistema principal — groupRows() não roda
    sortDataByColumn(sortColumn, sortOrder);
    sumCacheReady = false;
    renderSumRow();
  } else {
    rows.forEach(function (updatedRow) {
      replaceRowInObjects(updatedRow);
      updateGroupIncremental(updatedRow.id, updatedRow, orderedColumns, table);
    });

    toggleColumnVisibility();
    // Mantém estado visual sem revarrer a tabela inteira em groupRows().
    // Ordenação completa pode ser acionada pelo usuário quando necessário.
    updateIndex();
    renderSumRow();
  }

  if (scrollContainer) {
    scrollContainer.scrollTop = scrollTop;
  }

  buildTagModel(objects, layerList);
}

function updateRowsIncremental(rows) {
  'use strict';
  if (!Array.isArray(rows) || rows.length === 0) { return; }

  rows.forEach(function (row) {
    if (row && row.id) {
      incrementalPendingById.set(row.id, row);
    }
  });

  if (incrementalFramePending) { return; }
  incrementalFramePending = true;

  const flush = function () {
    incrementalFramePending = false;
    const batch = Array.from(incrementalPendingById.values());
    incrementalPendingById.clear();
    processRowsIncremental(batch);
  };

  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(flush);
  } else {
    flush();
  }
}

// ── Sanitização de URL — previne javascript: e data: maliciosos ───────────────
function sanitizeUrl(val) {
  'use strict';
  if (!val || typeof val !== 'string') { return '#'; }
  try {
    const u = new URL(val);
    if (u.protocol === 'https:' || u.protocol === 'http:') { return val; }
    return '#';
  } catch (_) {
    // URL relativa ou inválida — retorna vazia mas não bloqueia
    return val.startsWith('/') ? val : '#';
  }
}

// ── Aviso de múltiplas instâncias (chamado pelo Ruby via execute_script) ──────
function showMultiInstanceWarning() {
  'use strict';
  const el = document.getElementById('noticeMultiInstanceModal');
  if (el) { showModalElement(el); }
}

// Create Select Columns
var buttonColumn = document.getElementById('buttonColumn');
buttonColumn.addEventListener('click', function () {
  var table = document.getElementById('myTable');
  addColumnToOption(objects, table);
});

function renderSumRow() {
  'use strict';
  const table = document.getElementById('myTable');
  if (!table) { return; }

  // Remove tfoot anterior
  const oldFoot = table.querySelector('tfoot');
  if (oldFoot) { oldFoot.remove(); }

  const thead = table.querySelector('thead');
  const headerRow = thead ? thead.querySelector('tr') : null;
  if (!headerRow) { return; }

  const decSep = localStorage.getItem('decimalSeparator') || '.';
  const thsSep = localStorage.getItem('thousandSeparator') || ',';
  const findInput = document.getElementById('findInput');
  const hasActiveFilter = !!(findInput && findInput.value && findInput.value.trim() !== '');

  const ths = Array.from(headerRow.cells);
  let hasSumColumn = false;
  const sums = {};

  if (hasActiveFilter) {
    // Filtro ativo: mantém semântica de soma sobre linhas visíveis no DOM.
    const tbody = table.querySelector('tbody');
    const visRows = tbody
      ? Array.from(tbody.rows).filter(function (r) { return r.style.display !== 'none'; })
      : [];

    ths.forEach(function (th) {
      const key = th.id;
      if (!SUM_KEYS.has(key)) { return; }
      hasSumColumn = true;
      let total = 0;
      visRows.forEach(function (row) {
        const cell = row.querySelector('td[id$="-' + key + '"]');
        if (!cell) { return; }
        total += parseLocalizedNumber(cell.textContent.trim(), decSep, thsSep);
      });
      sums[key] = total;
    });
  } else {
    if (!sumCacheReady) {
      rebuildSumCaches();
    }

    ths.forEach(function (th) {
      const key = th.id;
      if (!SUM_KEYS.has(key)) { return; }
      hasSumColumn = true;
      sums[key] = sumCache[key] || 0;
    });
  }

  if (!hasSumColumn) { return; }

  // Formata número com separador decimal do usuário
  function fmtNum(val, decimals) {
    return val.toFixed(decimals).replace('.', decSep);
  }

  // Descobre casas decimais da configuração
  function decimalsFor(key) {
    if (key.includes('len')) { return (savedSettings.round_length || '0.00').split('.')[1] ? (savedSettings.round_length.split('.')[1].length) : 2; }
    if (key.includes('area')) { return (savedSettings.round_area || '0.00').split('.')[1] ? (savedSettings.round_area.split('.')[1].length) : 2; }
    if (key.includes('volume')) { return (savedSettings.round_volume || '0.000').split('.')[1] ? (savedSettings.round_volume.split('.')[1].length) : 3; }
    if (key === 'price' || key === 'size') { return 2; }
    return 2;
  }

  // Constrói tfoot
  const tfoot = document.createElement('tfoot');
  const sumRow = document.createElement('tr');
  sumRow.id = 'sum-row';
  sumRow.className = 'sum-row';

  let firstSumDone = false;

  ths.forEach(function (th, idx) {
    const key = th.id;
    const td = document.createElement('td');
    td.id = 'sum-cell-' + key;
    td.className = 'sum-cell';

    // Aplica visibilidade igual à coluna
    if (th.style.display === 'none') { td.style.display = 'none'; }

    if (SUM_KEYS.has(key)) {
      const dec = decimalsFor(key);
      td.textContent = fmtNum(sums[key] || 0, dec);
      td.style.textAlign = 'right';
      td.style.fontWeight = '600';
      td.style.color = '#0063a3';
    } else if (!firstSumDone && idx === 0) {
      // Primeira coluna: label Σ
      td.textContent = '\u03a3';
      td.style.textAlign = 'center';
      td.style.fontWeight = '700';
      td.style.color = '#0063a3';
      firstSumDone = true;
    }

    sumRow.appendChild(td);
  });

  tfoot.appendChild(sumRow);
  table.appendChild(tfoot);

  // Sincroniza visibilidade das células com estado das colunas
  Object.keys(checkboxStates).forEach(function (key) {
    const cell = document.getElementById('sum-cell-' + key);
    if (cell) { cell.style.display = checkboxStates[key] ? '' : 'none'; }
  });
}

// SHOW/HIDE COLUMN
function addColumnToOption(data, table) {
  'use strict';
  var selectColumns = document.getElementById('selectColumns');
  var tbl = document.getElementById('myTable');

  if (!data || data.length === 0) { return; }

  selectColumns.innerHTML = '';

  // Check All / Uncheck All
  const checkAllButton = document.createElement('button');
  checkAllButton.id = 'checkAllButton';
  checkAllButton.type = 'button';
  checkAllButton.className = 'btn btn-sm btn-outline-primary mt-2 mb-2';
  checkAllButton.textContent = (window.languageData && window.languageData.checkAll) || 'Check All';
  selectColumns.appendChild(checkAllButton);

  // Reset column order
  const resetBtn = document.createElement('button');
  resetBtn.id = 'reset-oredered-column';
  resetBtn.className = 'btn btn-icon-only btn-text-secondary ml-2';
  resetBtn.type = 'button';
  const resetIcon = document.createElement('i');
  resetIcon.className = 'modus-icons';
  resetIcon.setAttribute('aria-hidden', 'true');
  resetIcon.textContent = 'refresh';
  resetBtn.appendChild(resetIcon);
  selectColumns.appendChild(resetBtn);

  resetBtn.addEventListener('click', function () {
    localStorage.setItem('columnOrder', 'none');
    customLog('Column Order reset to: none');
  });

  const listContainer = document.createElement('ul');
  listContainer.id = 'sortable-list';
  listContainer.className = 'list-group list-group-condensed';
  selectColumns.appendChild(listContainer);

  const columns = Object.keys(data[0]).slice(1);
  const orderedCols = getOrderedColumns(columns, columnOrder);
  let isCheckedAll = false;

  columnOrder.forEach(function (orderKey) {
    const key = orderedCols[columnOrder.indexOf(orderKey)];

    const listItem = document.createElement('li');
    listItem.classList.add('list-group-item', 'list-item-right-control');
    listItem.setAttribute('data-id', orderKey);
    listContainer.appendChild(listItem);

    const divCheck = document.createElement('div');
    divCheck.classList.add('custom-control', 'custom-checkbox', 'checkbox-wrapper');
    listItem.appendChild(divCheck);

    const divReorder = document.createElement('div');
    divReorder.classList.add('custom-control', 'custom-checkbox', 'reorder-wrapper');
    listItem.appendChild(divReorder);

    const inputEl = document.createElement('input');
    inputEl.type = 'checkbox';
    inputEl.checked = checkboxStates[key] !== undefined ? checkboxStates[key] : true;
    inputEl.classList.add('custom-control-input');
    inputEl.id = key;

    const labelEl = document.createElement('label');
    labelEl.classList.add('custom-control-label');
    labelEl.setAttribute('for', key);
    const displayLabel = getColumnDisplayLabel(key);
    if (displayLabel && displayLabel !== key) {
      labelEl.setAttribute('no-translate', key);
      labelEl.textContent = displayLabel;
    } else {
      labelEl.setAttribute('data-translate', key);
      labelEl.textContent = key;
    }

    divCheck.appendChild(inputEl);
    divCheck.appendChild(labelEl);

    // Up / Down reorder
    const spanUp = document.createElement('span');
    spanUp.classList.add('reorder-button');
    spanUp.onclick = function () { moveItemUp(this); };
    const iUp = document.createElement('i');
    iUp.className = 'modus-icons';
    iUp.setAttribute('aria-hidden', 'true');
    iUp.textContent = 'expand_less';
    spanUp.appendChild(iUp);
    divReorder.appendChild(spanUp);

    const spanDown = document.createElement('span');
    spanDown.classList.add('reorder-button');
    spanDown.onclick = function () { moveItemDown(this); };
    const iDown = document.createElement('i');
    iDown.className = 'modus-icons';
    iDown.setAttribute('aria-hidden', 'true');
    iDown.textContent = 'expand_more';
    spanDown.appendChild(iDown);
    divReorder.appendChild(spanDown);

    // Check All handler — reregistrado a cada item mas age na lista completa
    checkAllButton.addEventListener('click', function () {
      isCheckedAll = !isCheckedAll;
      checkAllButton.textContent = isCheckedAll
        ? ((window.languageData && window.languageData.uncheckAll) || 'Uncheck All')
        : ((window.languageData && window.languageData.checkAll) || 'Check All');
      selectColumns.querySelectorAll('.custom-control-input').forEach(function (cb) {
        cb.checked = isCheckedAll;
        checkboxStates[cb.id] = isCheckedAll;
      });
      localStorage.setItem('checkboxStates', JSON.stringify(checkboxStates));
      toggleColumnVisibility();
    });

    // Per-checkbox change
    inputEl.addEventListener('change', function () {
      checkboxStates[key] = inputEl.checked;
      const colIdx = getColumnIndexByKey(tbl, key) + 1;
      const cells = tbl.querySelectorAll('td:nth-child(' + colIdx + '), th:nth-child(' + colIdx + ')');
      const filtered = Array.from(cells).filter(function (c) { return !c.id.includes('sum'); });
      filtered.forEach(function (el) { el.style.display = inputEl.checked ? '' : 'none'; });
      localStorage.setItem('checkboxStates', JSON.stringify(checkboxStates));
    });

    checkboxStates[key] = inputEl.checked;
  });

  sumList = Object.keys(checkboxStates).filter(function (k) { return checkboxStates[k] === true; });

  currentLanguage = localStorage.getItem('language') || 'pt';
  loadLanguage(currentLanguage);
}

// Function to toggle column visibility based on checkboxStates
function toggleColumnVisibility() {
  'use strict';
  var table = document.getElementById('myTable');
  if (!table) { return; }

  Object.keys(checkboxStates).forEach(function (key) {
    var colIdx = getColumnIndexByKey(table, key) + 1;
    var visible = checkboxStates[key];
    var cells = table.querySelectorAll('td:nth-child(' + colIdx + '), th:nth-child(' + colIdx + ')');
    Array.from(cells)
      .filter(function (c) { return !c.id.includes('sum'); })
      .forEach(function (el) { el.style.display = visible ? '' : 'none'; });
  });
}

function moveItemUp(button) {
  'use strict';
  const item = button.parentElement.parentElement;
  const prev = item.previousElementSibling;
  if (prev) { item.parentElement.insertBefore(item, prev); }
  getUpdatedOrder();
}

function moveItemDown(button) {
  'use strict';
  const item = button.parentElement.parentElement;
  const next = item.nextElementSibling;
  if (next) { item.parentElement.insertBefore(next, item); }
  getUpdatedOrder();
}

function getUpdatedOrder() {
  'use strict';
  const items = document.querySelectorAll('#sortable-list li');
  const newOrder = [];
  items.forEach(function (item, i) { newOrder[i] = item.getAttribute('data-id'); });
  localStorage.setItem('columnOrder', newOrder);
  updateData(objects, savedSettings, layerList, dynamicList, customKeys, ifcSummary);
}

function getColumnIndexByKey(table, key) {
  'use strict';
  if (!table) { return -1; }
  const headerRow = table.querySelector('thead tr');
  if (!headerRow) { return -1; }
  const cells = headerRow.getElementsByTagName('th');
  for (var i = 0; i < cells.length; i++) {
    if (cells[i].id === key) { return i; }
  }
  return -1;
}

function getOrderedColumns(data, order) {
  'use strict';
  return order.map(function (i) { return data[i]; });
}

function getTextWidth(text) {
  'use strict';
  const el = document.getElementById('textMeasure');
  if (!el || !text) { return 0; }
  el.textContent = text;
  return el.clientWidth;
}

function checkLineBreak(text) {
  'use strict';
  return (text && text.includes('\n')) ? 0 : 1;
}

function fillIfcStoreySummaryTable(tbodyId, storeys) {
  'use strict';

  const tbody = document.getElementById(tbodyId);
  if (!tbody) { return; }

  tbody.innerHTML = '';
  const list = sortStoreyBuckets(storeys);
  if (list.length === 0) {
    const trEmpty = document.createElement('tr');
    const tdEmpty = document.createElement('td');
    tdEmpty.colSpan = 5;
    tdEmpty.className = 'ifc-summary-empty';
    tdEmpty.textContent = t('ifcNoData', 'Sem dados');
    trEmpty.appendChild(tdEmpty);
    tbody.appendChild(trEmpty);
    return;
  }

  list.forEach(function (storeyBucket) {
    const storeyName = storeyBucket && storeyBucket.storey ? String(storeyBucket.storey) : t('noStorey', 'SEM PAVIMENTO');
    const tipos = (storeyBucket && Array.isArray(storeyBucket.tipos)) ? storeyBucket.tipos : [];

    if (tipos.length === 0) {
      const tr = document.createElement('tr');
      const tdStorey = document.createElement('td');
      const tdIfc = document.createElement('td');
      const tdQty = document.createElement('td');
      const tdMl = document.createElement('td');
      const tdArea = document.createElement('td');

      tdStorey.textContent = storeyName;
      tdIfc.textContent = '-';
      tdQty.textContent = '0';
      tdMl.textContent = '0';
      tdArea.textContent = '0';

      tr.appendChild(tdStorey);
      tr.appendChild(tdIfc);
      tr.appendChild(tdQty);
      tr.appendChild(tdMl);
      tr.appendChild(tdArea);
      tbody.appendChild(tr);
      return;
    }

    tipos.forEach(function (item) {
      const tr = document.createElement('tr');
      const tdStorey = document.createElement('td');
      const tdIfc = document.createElement('td');
      const tdQty = document.createElement('td');
      const tdMl = document.createElement('td');
      const tdArea = document.createElement('td');

      tdStorey.textContent = storeyName;
      tdIfc.textContent = ifcDisplayLabel(item && item.ifc ? String(item.ifc) : '');
      tdQty.textContent = formatInteger(item && item.quantidade ? item.quantidade : 0);
      tdMl.textContent = formatMetricOrDash(item && item.metro_linear_m ? item.metro_linear_m : 0, 'm');
      tdArea.textContent = formatMetricOrDash(item && item.area_m2 ? item.area_m2 : 0, 'm²');

      tr.appendChild(tdStorey);
      tr.appendChild(tdIfc);
      tr.appendChild(tdQty);
      tr.appendChild(tdMl);
      tr.appendChild(tdArea);
      tbody.appendChild(tr);
    });
  });
}

function toDashboardMetric(value) {
  'use strict';
  const decSep = localStorage.getItem('decimalSeparator') || '.';
  const thsSep = localStorage.getItem('thousandSeparator') || ',';
  return parseLocalizedNumber(value, decSep, thsSep);
}

function detectElementLength(row) {
  'use strict';
  if (!row) { return 0; }
  const candidates = [row.metro_linear_total, row.comprimento, row.len_z, row.len_x, row.len_y, row.len_xyz];
  for (let i = 0; i < candidates.length; i++) {
    const n = toDashboardMetric(candidates[i]);
    if (n > 0) { return n; }
  }
  return 0;
}

function detectElementArea(row) {
  'use strict';
  if (!row) { return 0; }
  const candidates = [row.area_total, row.area, row.area_xy, row.area_xz];
  for (let i = 0; i < candidates.length; i++) {
    const n = toDashboardMetric(candidates[i]);
    if (n > 0) { return n; }
  }
  return 0;
}

function normalizeIfcCode(value) {
  'use strict';
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function getTagIfcRules() {
  'use strict';
  const merged = {};
  Object.keys(DEFAULT_TAG_IFC_RULES).forEach(function (k) {
    merged[k] = DEFAULT_TAG_IFC_RULES[k].slice();
  });

  try {
    const raw = localStorage.getItem('tagIfcRules');
    if (!raw) {
      window.relatorioTagIfcRules = merged;
      return merged;
    }

    const parsed = JSON.parse(raw);
    Object.keys(parsed || {}).forEach(function (tagKey) {
      const key = String(tagKey || '').toUpperCase().trim();
      if (!key) { return; }
      const list = Array.isArray(parsed[tagKey]) ? parsed[tagKey] : [];
      const normalized = list.map(normalizeIfcCode).filter(Boolean);
      if (normalized.length > 0) {
        merged[key] = normalized;
      }
    });
  } catch (_e) {
    // keep defaults when malformed rules are provided.
  }

  window.relatorioTagIfcRules = merged;
  return merged;
}

function isTagIfcMismatch(tag, ifc) {
  'use strict';
  const t = String(tag || '').toUpperCase();
  const i = normalizeIfcCode(ifc);
  if (!t || !i) { return false; }

  const rules = getTagIfcRules();
  const matchedRule = Object.keys(rules).find(function (token) {
    return t.includes(token);
  });
  if (!matchedRule) { return false; }

  const allowed = rules[matchedRule] || [];
  return allowed.indexOf(i) < 0;
}

function buildTagModel(rows, availableTags) {
  'use strict';
  return buildTagDashboardModel(rows, availableTags);
}

function buildTagModelSignature(rows, availableTags) {
  'use strict';
  const list = Array.isArray(rows) ? rows : [];
  const tags = Array.isArray(availableTags) ? availableTags : [];
  const rules = getTagIfcRules();

  const rowsSig = list.map(function (row) {
    if (!row) { return ''; }
    return [
      row.id || '',
      row.tag || '',
      row.ifc || '',
      row.storey || '',
      row.instancias ? JSON.stringify(row.instancias) : '',
      row.quantidade || row.quantity || 1,
      row.metro_linear_total || row.comprimento || row.len_z || row.len_x || row.len_y || row.len_xyz || '',
      row.area_total || row.area || row.area_xy || row.area_xz || '',
      row.instance || row.definition || row.entity || ''
    ].join('~');
  }).join('|');

  return [
    groupedStructuralMode ? 'G' : 'R',
    tags.join(','),
    JSON.stringify(rules),
    rowsSig
  ].join('||');
}

function buildTagDashboardModel(rows, availableTags) {
  'use strict';
  const signature = buildTagModelSignature(rows, availableTags);
  if (signature === tagModelLastSignature && tagModelLastValue) {
    tagDashboardModel = tagModelLastValue;
    window.relatorioTagDashboard = tagDashboardModel;
    if (document.getElementById('tagDashboardModal') && document.getElementById('tagDashboardModal').classList.contains('show')) {
      renderTagDashboard();
    }
    return tagDashboardModel;
  }

  const list = Array.isArray(rows) ? rows : [];
  const tagMap = new Map();
  const byStorey = new Map();

  function ensureTag(tagName) {
    if (!tagMap.has(tagName)) {
      tagMap.set(tagName, {
        tag: tagName,
        elements: [],
        quantidade: 0,
        total_ml: 0,
        total_area: 0,
        mismatches: 0
      });
    }
    return tagMap.get(tagName);
  }

  function updateStorey(storey, qty, ml, area) {
    if (!byStorey.has(storey)) {
      byStorey.set(storey, { storey: storey, quantidade: 0, total_ml: 0, total_area: 0 });
    }
    const bucket = byStorey.get(storey);
    bucket.quantidade += qty;
    bucket.total_ml += ml;
    bucket.total_area += area;
  }

  const all = {
    tag: '__ALL__',
    elements: [],
    quantidade: 0,
    total_ml: 0,
    total_area: 0,
    mismatches: 0
  };

  list.forEach(function (row) {
    if (!row) { return; }
    if (groupedStructuralMode && !row.is_group) { return; }

    const rawTag = row.tag == null ? '' : String(row.tag).trim();
    const tag = rawTag || 'SEM TAG';
    const nome = String(row.instance || row.definition || row.entity || row.id || 'Elemento');
    const ifc = String(row.ifc || '');
    const pavimento = String(row.storey || 'SEM PAVIMENTO');

    const qtd = Math.max(1, Math.round(toDashboardMetric(row.quantidade || row.quantity || 1)));
    const ml = detectElementLength(row);
    const area = detectElementArea(row);

    const highlightId = (row.is_group && Array.isArray(row.instancias) && row.instancias.length > 0)
      ? String(row.instancias[0])
      : String(row.id || '').split('-')[0];

    const element = {
      id: String(row.id || ''),
      highlight_id: highlightId,
      nome: nome,
      ifc: ifc,
      comprimento: ml,
      area: area,
      pavimento: pavimento,
      quantidade: qtd,
      mismatch: isTagIfcMismatch(tag, ifc)
    };

    const bucket = ensureTag(tag);
    bucket.elements.push(element);
    bucket.quantidade += qtd;
    bucket.total_ml += ml;
    bucket.total_area += area;
    if (element.mismatch) { bucket.mismatches += 1; }

    all.elements.push(element);
    all.quantidade += qtd;
    all.total_ml += ml;
    all.total_area += area;
    if (element.mismatch) { all.mismatches += 1; }

    updateStorey(pavimento, qtd, ml, area);
  });

  const preferred = Array.isArray(availableTags) ? availableTags.slice() : [];
  preferred.forEach(function (name) {
    const tagName = String(name || '').trim();
    if (!tagName) { return; }
    ensureTag(tagName);
  });

  const tags = Array.from(tagMap.values()).sort(function (a, b) {
    if (a.quantidade !== b.quantidade) { return b.quantidade - a.quantidade; }
    return String(a.tag).localeCompare(String(b.tag), 'pt-BR');
  });

  const storeyRows = sortStoreyBuckets(Array.from(byStorey.values()).map(function (row) {
    return { storey: row.storey, tipos: [], total: row.quantidade, _dashboard: row };
  })).map(function (x) { return x._dashboard; });

  tagDashboardModel = {
    tags: tags,
    all: all,
    by_storey: storeyRows
  };

  tagModelLastSignature = signature;
  tagModelLastValue = tagDashboardModel;

  window.relatorioTagDashboard = tagDashboardModel;
  if (document.getElementById('tagDashboardModal') && document.getElementById('tagDashboardModal').classList.contains('show')) {
    renderTagDashboard();
  }

  return tagDashboardModel;
}

function focusDashboardEntity(entityId) {
  'use strict';
  if (!entityId) { return; }
  // ✅ HARDENING: Use Bridge instead of direct window.sketchup calls
  if (typeof Bridge !== 'undefined' && Bridge.highlightEntity) {
    Bridge.highlightEntity(String(entityId));
    Bridge.zoomSelection();
  }
}

function resolveTagDashboardSelection() {
  'use strict';
  if (activeTagDashboardKey === '__ALL__') {
    return tagDashboardModel.all || { elements: [], quantidade: 0, total_ml: 0, total_area: 0 };
  }

  if (activeTagDashboardKey === '__STOREY__') {
    return {
      elements: (tagDashboardModel.by_storey || []).map(function (s) {
        return {
          id: 'storey-' + s.storey,
          highlight_id: '',
          nome: s.storey,
          ifc: '-',
          comprimento: s.total_ml,
          area: s.total_area,
          pavimento: String(s.quantidade) + ' itens',
          quantidade: s.quantidade,
          mismatch: false
        };
      }),
      quantidade: (tagDashboardModel.by_storey || []).reduce(function (acc, s) { return acc + Number(s.quantidade || 0); }, 0),
      total_ml: (tagDashboardModel.by_storey || []).reduce(function (acc, s) { return acc + Number(s.total_ml || 0); }, 0),
      total_area: (tagDashboardModel.by_storey || []).reduce(function (acc, s) { return acc + Number(s.total_area || 0); }, 0),
      mismatches: 0
    };
  }

  const found = (tagDashboardModel.tags || []).find(function (t) {
    return String(t.tag) === String(activeTagDashboardKey);
  });
  return found || { elements: [], quantidade: 0, total_ml: 0, total_area: 0, mismatches: 0 };
}

function renderTagDashboardSidebar() {
  'use strict';
  const sidebar = document.getElementById('tagSidebar');
  if (!sidebar) { return; }

  sidebar.innerHTML = '';

  const entries = [
    { key: '__ALL__', label: 'TODOS ELEMENTOS', qty: Number(tagDashboardModel.all && tagDashboardModel.all.quantidade ? tagDashboardModel.all.quantidade : 0) },
    { key: '__STOREY__', label: 'POR PAVIMENTO', qty: Number((tagDashboardModel.by_storey || []).length) }
  ];

  (tagDashboardModel.tags || []).forEach(function (tag) {
    entries.push({ key: tag.tag, label: tag.tag, qty: Number(tag.quantidade || 0) });
  });

  entries.forEach(function (entry) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tag-sidebar-item' + (String(activeTagDashboardKey) === String(entry.key) ? ' active' : '');
    btn.textContent = entry.label + ' (' + formatInteger(entry.qty) + ')';
    btn.addEventListener('click', function () {
      activeTagDashboardKey = entry.key;
      renderTagDashboard();
    });
    sidebar.appendChild(btn);
  });
}

function renderTagDashboardBody(selection) {
  'use strict';
  const tbody = document.getElementById('tagDashboardBody');
  if (!tbody) { return; }
  tbody.innerHTML = '';

  const list = selection && Array.isArray(selection.elements) ? selection.elements.slice() : [];
  list.sort(function (a, b) {
    const sa = String(a.pavimento || '');
    const sb = String(b.pavimento || '');
    const na = storeySortNumber(sa);
    const nb = storeySortNumber(sb);
    if (na !== nb) { return na - nb; }
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });

  if (list.length === 0) {
    const trEmpty = document.createElement('tr');
    const tdEmpty = document.createElement('td');
    tdEmpty.colSpan = 5;
    tdEmpty.className = 'tag-empty';
    tdEmpty.textContent = 'Sem elementos para esta selecao.';
    trEmpty.appendChild(tdEmpty);
    tbody.appendChild(trEmpty);
    return;
  }

  list.forEach(function (row) {
    const tr = document.createElement('tr');
    tr.className = 'tag-row-highlight';

    const tdNome = document.createElement('td');
    const tdIfc = document.createElement('td');
    const tdMl = document.createElement('td');
    const tdArea = document.createElement('td');
    const tdStorey = document.createElement('td');

    tdMl.className = 'num';
    tdArea.className = 'num';

    tdNome.textContent = row.nome || '-';
    tdIfc.textContent = row.ifc || '-';
    if (row.mismatch) {
      tdIfc.textContent = (row.ifc || '-') + ' [TAG/IFC]';
      tdIfc.style.color = '#b42318';
      tdIfc.style.fontWeight = '700';
    }
    tdMl.textContent = formatMetricOrDash(row.comprimento, 'm');
    tdArea.textContent = formatMetricOrDash(row.area, 'm²');
    tdStorey.textContent = row.pavimento || 'SEM PAVIMENTO';

    tr.appendChild(tdNome);
    tr.appendChild(tdIfc);
    tr.appendChild(tdMl);
    tr.appendChild(tdArea);
    tr.appendChild(tdStorey);

    if (row.highlight_id) {
      tr.addEventListener('click', function () {
        focusDashboardEntity(row.highlight_id);
      });
    }

    tbody.appendChild(tr);
  });
}

function renderTagDashboard() {
  'use strict';
  renderTagDashboardSidebar();

  const selection = resolveTagDashboardSelection();
  const tags = Array.isArray(tagDashboardModel.tags) ? tagDashboardModel.tags : [];
  const topMl = tags.slice().sort(function (a, b) {
    return Number(b.total_ml || 0) - Number(a.total_ml || 0);
  })[0];
  const topArea = tags.slice().sort(function (a, b) {
    return Number(b.total_area || 0) - Number(a.total_area || 0);
  })[0];

  const qtyEl = document.getElementById('tagKpiQty');
  const mlEl = document.getElementById('tagKpiMl');
  const areaEl = document.getElementById('tagKpiArea');
  const mismatchEl = document.getElementById('tagKpiMismatch');
  const topMlEl = document.getElementById('tagKpiTopMl');
  const topAreaEl = document.getElementById('tagKpiTopArea');

  if (qtyEl) { qtyEl.textContent = formatInteger(selection.quantidade || 0); }
  if (mlEl) { mlEl.textContent = formatMetricOrDash(selection.total_ml || 0, 'm'); }
  if (areaEl) { areaEl.textContent = formatMetricOrDash(selection.total_area || 0, 'm²'); }
  if (mismatchEl) { mismatchEl.textContent = formatInteger(selection.mismatches || 0); }
  if (topMlEl) {
    topMlEl.textContent = topMl ? (String(topMl.tag) + ' | ' + formatMetricOrDash(topMl.total_ml || 0, 'm')) : '-';
  }
  if (topAreaEl) {
    topAreaEl.textContent = topArea ? (String(topArea.tag) + ' | ' + formatMetricOrDash(topArea.total_area || 0, 'm²')) : '-';
  }

  renderTagDashboardBody(selection);
}

window.renderTagDashboard = renderTagDashboard;
window.relatorioBuildTagModel = buildTagModel;

// ============================================================================
// 🎯 MENU DO SISTEMA POR TAG — Renderização e Navegação
// ============================================================================

function buildSimpleTagModel(rows) {
  'use strict';
  const model = {};
  let notClassified = 0;  // Validação: elementos sem TAG

  (Array.isArray(rows) ? rows : []).forEach(function (e) {
    if (!e) { return; }

    let tag = (e.tag || '').toUpperCase().trim();

    // ✅ VALIDAÇÃO: se sem TAG, usar IFC como fallback
    if (!tag) {
      tag = (e.ifc || 'SEM TAG').toUpperCase();
      if (tag === 'SEM TAG') {
        notClassified++;
      }
    }

    const pav = (e.storey || 'SEM PAVIMENTO').toString();
    const ifc = (e.ifc || '').toUpperCase();

    if (!model[tag]) {
      model[tag] = {
        elementos: [],
        quantidade: 0,
        total_elementos: 0,
        total_grupos: 0,
        metro_linear: 0,
        area: 0,
        volume: 0,
        eps_volume: 0,
        concrete_cost: 0,
        eps_cost: 0,
        slab_weight_kg: 0,
        por_pavimento: {},
        ifc_types: {},
        not_classified: 0
      };
    }

    const totalElementosLinha = Math.max(1, Math.round(parseLocalizedNumberDisplay(e.quantidade || e.quantity || 1)));

    model[tag].elementos.push(e);
    model[tag].quantidade++;
    model[tag].total_grupos++;
    model[tag].total_elementos += totalElementosLinha;

    // ✅ Rastreamento de IFC types
    if (ifc && ifc !== 'SEM TAG') {
      model[tag].ifc_types[ifc] = (model[tag].ifc_types[ifc] || 0) + 1;
    }

    var _ml = e.metro_linear_total || e.comprimento;
    if (_ml) {
      model[tag].metro_linear += parseLocalizedNumberDisplay(_ml);
    }
    var _area = e.area_total || e.area;
    if (_area) {
      model[tag].area += parseLocalizedNumberDisplay(_area);
    }
    var _vol = e.volume_total || e.volume;
    if (_vol) {
      model[tag].volume += parseLocalizedNumberDisplay(_vol);
    }
    var _epsVol = e.eps_volume_total || e.eps_volume_m3;
    if (_epsVol) {
      model[tag].eps_volume += parseLocalizedNumberDisplay(_epsVol);
    }
    var _concCost = e.concrete_cost_total || e.concrete_cost;
    if (_concCost) {
      model[tag].concrete_cost += parseLocalizedNumberDisplay(_concCost);
    }
    var _epsCost = e.eps_cost_total || e.eps_cost;
    if (_epsCost) {
      model[tag].eps_cost += parseLocalizedNumberDisplay(_epsCost);
    }
    var _slabWeight = e.slab_weight_total_kg || e.slab_weight_kg;
    if (_slabWeight) {
      model[tag].slab_weight_kg += parseLocalizedNumberDisplay(_slabWeight);
    }

    if (!model[tag].por_pavimento[pav]) {
      model[tag].por_pavimento[pav] = {
        quantidade: 0,
        metro_linear: 0,
        area: 0,
        volume: 0,
        eps_volume: 0,
        concrete_cost: 0,
        eps_cost: 0,
        slab_weight_kg: 0
      };
    }
    model[tag].por_pavimento[pav].quantidade++;
    if (_ml) {
      model[tag].por_pavimento[pav].metro_linear += parseLocalizedNumberDisplay(_ml);
    }
    if (_area) {
      model[tag].por_pavimento[pav].area += parseLocalizedNumberDisplay(_area);
    }
    if (_vol) {
      model[tag].por_pavimento[pav].volume += parseLocalizedNumberDisplay(_vol);
    }
    if (_epsVol) {
      model[tag].por_pavimento[pav].eps_volume += parseLocalizedNumberDisplay(_epsVol);
    }
    if (_concCost) {
      model[tag].por_pavimento[pav].concrete_cost += parseLocalizedNumberDisplay(_concCost);
    }
    if (_epsCost) {
      model[tag].por_pavimento[pav].eps_cost += parseLocalizedNumberDisplay(_epsCost);
    }
    if (_slabWeight) {
      model[tag].por_pavimento[pav].slab_weight_kg += parseLocalizedNumberDisplay(_slabWeight);
    }
  });

  // ✅ Rastrear elementos não classificados
  if (notClassified > 0) {
    if (model['SEM TAG']) {
      model['SEM TAG'].not_classified = notClassified;
    }
  }

  return model;
}

// ✅ HARDENING: renderMenu() REMOVED
// This function is now handled by RenderManager._renderMenu()
// All menu rendering must go through RenderManager for consistency
// Legacy code that called renderMenu() will trigger EventBus listeners instead

function getTagIcon(tagName) {
  'use strict';
  const key = String(tagName || '').toUpperCase();
  if (key.indexOf('LAJE') !== -1) { return '🏢'; }
  if (key.indexOf('FUNDA') !== -1) { return '🏗'; }
  if (key.indexOf('ALVEN') !== -1) { return '🧱'; }
  if (key.indexOf('VIGA') !== -1) { return '🪵'; }
  if (key.indexOf('PILAR') !== -1) { return '🏛'; }
  if (key.indexOf('GLOBAL') !== -1 || key.indexOf('TODOS') !== -1) { return '🌐'; }
  return '📦';
}

function normalizeTagLookupKey(tagName) {
  'use strict';
  return String(tagName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/S$/g, '');
}

function resolveFallbackTagElements(tagName) {
  'use strict';
  const dashboard = window.relatorioTagDashboard;
  const tags = dashboard && Array.isArray(dashboard.tags) ? dashboard.tags : [];
  if (!tagName || tags.length === 0) { return []; }

  const wanted = normalizeTagLookupKey(tagName);
  let matched = tags.find(function (t) {
    return normalizeTagLookupKey(t && t.tag) === wanted;
  });

  if (!matched) {
    matched = tags.find(function (t) {
      const key = normalizeTagLookupKey(t && t.tag);
      return key.indexOf(wanted) >= 0 || wanted.indexOf(key) >= 0;
    });
  }

  if (!matched || !Array.isArray(matched.elements)) { return []; }

  return matched.elements.map(function (el) {
    return {
      id: el.id || el.highlight_id || '',
      instance: el.nome || 'Elemento',
      nome: el.nome || 'Elemento',
      ifc: el.ifc || '-',
      storey: el.pavimento || '-',
      pavimento: el.pavimento || '-',
      comprimento: Number(el.comprimento || 0),
      area: Number(el.area || 0),
      volume: 0,
      highlight_id: el.highlight_id || ''
    };
  });
}

function resolveTagElementsForRender(tagName, grupo) {
  'use strict';
  const base = Array.isArray(grupo && grupo.elementos) ? grupo.elementos : [];
  if (base.length > 0) { return base; }

  const fromDashboard = resolveFallbackTagElements(tagName);
  if (fromDashboard.length > 0) { return fromDashboard; }

  const wanted = normalizeTagLookupKey(tagName);
  const source = Array.isArray(objects) ? objects : [];
  return source.filter(function (row) {
    const rowTag = String((row && (row.tag || row.ifc)) || '').trim();
    if (!rowTag) { return false; }
    const key = normalizeTagLookupKey(rowTag);
    return key === wanted || key.indexOf(wanted) >= 0 || wanted.indexOf(key) >= 0;
  });
}

// ✅ HARDENING: getDashboardMode() - REDIRECTS TO AppState
function getDashboardMode() {
  'use strict';
  // All state queries must go through AppState now
  if (typeof AppState !== 'undefined' && AppState.getMode) {
    return String(AppState.getMode() || '').toLowerCase();
  }
  // Fallback (should not happen if AppState loaded)
  return 'global';
}

function renderMenu() {
  'use strict';
  // Legacy no-op: menu rendering is handled by RenderManager + SidebarModule.
}

function renderDashboardBreadcrumb() {
  'use strict';
  // Legacy no-op: breadcrumb rendering is handled by RenderManager + BreadcrumbModule.
}

function getElementKey(e) {
  'use strict';
  if (!e) { return ''; }
  return String(e.persistent_id || e.highlight_id || e.id || '').trim();
}

function getElementLabel(e) {
  'use strict';
  if (!e) { return 'Elemento'; }
  return String(e.instance || e.nome || e.entity || getElementKey(e) || 'Elemento');
}

function escapeForSingleQuote(text) {
  'use strict';
  return String(text == null ? '' : text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapeHtml(text) {
  'use strict';
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeQueryToken(value) {
  'use strict';
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveQueryFieldKey(rawField) {
  'use strict';
  const token = normalizeQueryToken(rawField);
  if (!token) { return ''; }

  const aliases = {
    classe_ifc: 'ifc',
    ifc_class: 'ifc',
    ifc: 'ifc',
    tag: 'tag',
    etiqueta: 'tag',
    pavimento: 'storey',
    storey: 'storey',
    volume: 'volume_total',
    volume_total: 'volume_total',
    area: 'area_total',
    area_total: 'area_total',
    comprimento: 'metro_linear_total',
    metro_linear: 'metro_linear_total',
    metro_linear_total: 'metro_linear_total',
    material: 'material',
    instancia: 'instance',
    instance: 'instance',
    nome: 'instance',
    id: 'id',
    entity: 'entity'
  };

  if (aliases[token]) { return aliases[token]; }

  const normalizedColumns = Object.keys(dynamicSchemaByKey || {}).reduce(function (acc, key) {
    acc[normalizeQueryToken(key)] = key;
    const item = dynamicSchemaByKey[key] || {};
    if (item.label) { acc[normalizeQueryToken(item.label)] = key; }
    if (item.property) { acc[normalizeQueryToken(item.property)] = key; }
    return acc;
  }, {});

  return normalizedColumns[token] || rawField;
}

function getRowQueryValue(row, key) {
  'use strict';
  if (!row) { return ''; }
  if (row[key] != null) { return row[key]; }
  if (key === 'volume_total') { return row.volume_total || row.volume || 0; }
  if (key === 'area_total') { return row.area_total || row.area || 0; }
  if (key === 'metro_linear_total') { return row.metro_linear_total || row.comprimento || 0; }
  return '';
}

function compareQueryValues(leftValue, op, rightRaw) {
  'use strict';
  const leftText = String(leftValue == null ? '' : leftValue).trim();
  const rightText = String(rightRaw == null ? '' : rightRaw).trim();

  const leftNumber = Number(parseLocalizedNumberDisplay(leftValue));
  const rightNumber = Number(parseLocalizedNumberDisplay(rightText));
  const bothNumeric = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);

  const leftNorm = normalizeQueryToken(leftText);
  const rightNorm = normalizeQueryToken(rightText);

  if (op === 'is empty') {
    return leftNorm === '' || leftNorm === '-' || leftNorm === 'null' || leftNorm === 'undefined';
  }
  if (op === 'is not empty') {
    return !(leftNorm === '' || leftNorm === '-' || leftNorm === 'null' || leftNorm === 'undefined');
  }

  if (bothNumeric) {
    if (op === '>') { return leftNumber > rightNumber; }
    if (op === '>=') { return leftNumber >= rightNumber; }
    if (op === '<') { return leftNumber < rightNumber; }
    if (op === '<=') { return leftNumber <= rightNumber; }
    if (op === '=' || op === '==') { return leftNumber === rightNumber; }
    if (op === '!=') { return leftNumber !== rightNumber; }
  }

  if (op === '=' || op === '==') { return leftNorm === rightNorm; }
  if (op === '!=') { return leftNorm !== rightNorm; }
  if (op === 'contains' || op === '~') { return leftNorm.indexOf(rightNorm) !== -1; }
  if (op === 'not contains') { return leftNorm.indexOf(rightNorm) === -1; }

  return leftNorm.indexOf(rightNorm) !== -1;
}

function parseQueryClause(rawClause) {
  'use strict';
  const clause = String(rawClause || '').trim();
  if (!clause) { return null; }

  const unary = clause.match(/^(.+?)\s+(is\s+not\s+empty|is\s+empty)$/i);
  if (unary) {
    return {
      field: resolveQueryFieldKey(unary[1]),
      op: normalizeQueryToken(unary[2]).replace(/\s+/g, ' '),
      value: ''
    };
  }

  const binary = clause.match(/^(.+?)\s*(>=|<=|!=|==|=|>|<|~|contains|not\s+contains)\s*(.+)$/i);
  if (!binary) { return null; }

  return {
    field: resolveQueryFieldKey(binary[1]),
    op: normalizeQueryToken(binary[2]).replace(/\s+/g, ' '),
    value: String(binary[3] || '').trim().replace(/^['\"]|['\"]$/g, '')
  };
}

function applyQueryEngineFilter(list, rawSearch) {
  'use strict';
  const source = Array.isArray(list) ? list : [];
  const query = String(rawSearch || '').trim();
  if (!query) { return source; }

  const hasQuerySyntax = /(>=|<=|!=|==|=|>|<|\bcontains\b|\bis\s+empty\b|\bis\s+not\s+empty\b)/i.test(query);
  if (!hasQuerySyntax) {
    const normalizedSearch = query.toLowerCase();
    return source.filter(function (e) {
      const label = String(e && (e.instance || e.nome || e.entity) ? (e.instance || e.nome || e.entity) : '').toLowerCase();
      const ifc = String(e && e.ifc ? e.ifc : '').toLowerCase();
      const storey = String(e && (e.storey || e.pavimento) ? (e.storey || e.pavimento) : '').toLowerCase();
      const pid = String(getElementKey(e) || '').toLowerCase();
      return label.indexOf(normalizedSearch) !== -1 ||
        ifc.indexOf(normalizedSearch) !== -1 ||
        storey.indexOf(normalizedSearch) !== -1 ||
        pid.indexOf(normalizedSearch) !== -1;
    });
  }

  const orGroups = query.split(/\s+OR\s+/i).map(function (group) {
    return String(group || '').trim();
  }).filter(Boolean);

  return source.filter(function (row) {
    return orGroups.some(function (group) {
      const andClauses = group.split(/\s+AND\s+/i).map(function (clause) {
        return parseQueryClause(clause);
      }).filter(Boolean);

      if (andClauses.length === 0) { return false; }

      return andClauses.every(function (clause) {
        const leftValue = getRowQueryValue(row, clause.field);
        return compareQueryValues(leftValue, clause.op, clause.value);
      });
    });
  });
}

// ✅ HARDENING: renderDashboardBreadcrumb() REMOVED
// This function is now handled by RenderManager._renderBreadcrumb()
// Breadcrumb is now completely state-derived from AppState.getState().navigation
// This ensures breadcrumb is always in sync with actual navigation state

function findElementByKey(key) {
  'use strict';
  const wanted = String(key || '').trim();
  if (!wanted) { return null; }
  const all = getAllTagElements();
  for (let i = 0; i < all.length; i += 1) {
    const e = all[i];
    if (getElementKey(e) === wanted) { return e; }
  }
  return null;
}

function selectElementByKey(key, focusInModel) {
  'use strict';
  const wanted = String(key || '').trim();
  if (!wanted) { return; }

  const selected = findElementByKey(wanted);
  if (!selected) { return; }

  const source = arguments.length >= 3 ? String(arguments[2] || 'dashboard') : 'dashboard';

  const rowTag = String(selected.tag || '').trim();
  const currentTagValue = String((typeof AppState !== 'undefined' && AppState.getCurrentTag) ? (AppState.getCurrentTag() || '') : '').trim();
  const currentElementValue = String((typeof AppState !== 'undefined' && AppState.getCurrentElement) ? (AppState.getCurrentElement() || '') : '').trim();
  const hasStateChange = currentElementValue !== wanted || (rowTag && rowTag !== currentTagValue);

  if (!hasStateChange && !focusInModel) {
    pulseDashboardSelection(source);
    return;
  }

  if (rowTag && window.tagModel && window.tagModel[rowTag]) {
    AppState.setCurrentTag(rowTag);
    carregarPavimentos(rowTag);
  }

  // ✅ NOVO: Usar AppState em vez de mutar global
  AppState.setCurrentElement(wanted);

  if (focusInModel) {
    outboundSelectionKey = wanted;
    outboundSelectionLockUntil = Date.now() + 500;

    // ✅ NOVO: Usar Bridge em vez de chamar focusEntity diretamente
    if (typeof Bridge !== 'undefined' && Bridge.highlightEntity) {
      Bridge.highlightEntity(wanted);
      Bridge.zoomSelection();
    } else {
      focusEntity(wanted);
    }
  }

  // ✅ NOVO: Emitir evento
  EventBus.emit(EventBus.Events.ELEMENT_SELECTED, { elementKey: wanted, focusInModel: focusInModel });

  renderMenu();

  // ✅ NOVO: RenderManager é chamado via EventBus listener
  if (typeof RenderManager === 'undefined') {
    renderDashboard();
  }

  pulseDashboardSelection(source);
}

function pulseDashboardSelection(source) {
  'use strict';
  const target = document.getElementById('globalSummary');
  if (!target) { return; }

  const color = source === 'sketchup' ? 'rgba(14, 116, 144, 0.58)' : 'rgba(22, 163, 74, 0.58)';
  target.style.transition = 'box-shadow 180ms ease, transform 180ms ease';
  target.style.boxShadow = '0 0 0 2px ' + color;
  target.style.transform = 'translateY(-1px)';

  if (dashboardSelectionPulseTimer) {
    clearTimeout(dashboardSelectionPulseTimer);
  }

  dashboardSelectionPulseTimer = setTimeout(function () {
    target.style.boxShadow = '';
    target.style.transform = '';
  }, 260);
}

function backToTagMode() {
  'use strict';
  // ✅ NOVO: Usar AppState
  AppState.setCurrentElement(null);
  AppState.setSearchTerm('');
  const input = document.getElementById('dashboardSearchInput');
  if (input) { input.value = ''; }

  let currentTag = AppState.getCurrentTag();
  if (!currentTag && window.tagModel) {
    const sortedTags = Object.keys(window.tagModel).sort();
    currentTag = sortedTags.length > 0 ? sortedTags[0] : null;
    AppState.setCurrentTag(currentTag);
  }

  if (currentTag) {
    carregarPavimentos(currentTag);
  }

  // ✅ NOVO: Emitir evento
  EventBus.emit(EventBus.Events.BACK_TO_TAG);

  renderMenu();

  if (typeof RenderManager === 'undefined') {
    renderDashboard();
  }
}

function backToGlobalMode() {
  'use strict';
  // ✅ NOVO: Usar AppState em vez de mutar globals
  AppState.backToGlobal();

  // ✅ NOVO: Emitir evento
  EventBus.emit(EventBus.Events.BACK_TO_GLOBAL);

  renderMenu();

  if (typeof RenderManager === 'undefined') {
    renderDashboard();
  }
}

function renderGlobalSummary() {
  'use strict';
  const globalSummary = document.getElementById('globalSummary');
  if (!globalSummary || !window.tagModel) { return; }

  const mode = getDashboardMode();
  if (mode === 'element') {
    const e = findElementByKey(currentElement);
    if (!e) {
      currentElement = null;
    } else {
      const tag = String(e.tag || currentTag || '-');
      const ifc = String(e.ifc || '-');
      const pav = String((e.storey || e.pavimento) || '-');
      const len = Number(parseLocalizedNumberDisplay(e.comprimento || e.metro_linear_total || 0));
      const area = Number(parseLocalizedNumberDisplay(e.area || e.area_total || 0));
      const vol = Number(parseLocalizedNumberDisplay(e.volume || e.volume_total || 0));
      const concCost = Number(parseLocalizedNumberDisplay(e.concrete_cost || e.concrete_cost_total || 0));
      const epsCost = Number(parseLocalizedNumberDisplay(e.eps_cost || e.eps_cost_total || 0));
      const totalCost = concCost + epsCost;
      const slabWeight = Number(parseLocalizedNumberDisplay(e.slab_weight_kg || e.slab_weight_total_kg || 0));

      globalSummary.innerHTML =
        '<div class="summary-card"><h4>Elemento Selecionado</h4><p>' + getElementLabel(e) + '</p><span class="meta">Modo: ELEMENTO</span></div>' +
        '<div class="summary-card"><h4>TAG</h4><p>' + tag + '</p></div>' +
        '<div class="summary-card"><h4>IFC</h4><p>' + ifc + '</p></div>' +
        '<div class="summary-card"><h4>Pavimento</h4><p>' + pav + '</p></div>' +
        '<div class="summary-card"><h4>Comprimento</h4><p>' + len.toFixed(2) + ' m</p></div>' +
        '<div class="summary-card"><h4>Área</h4><p>' + area.toFixed(2) + ' m²</p></div>' +
        '<div class="summary-card"><h4>Volume</h4><p>' + vol.toFixed(2) + ' m³</p></div>' +
        '<div class="summary-card"><h4>Custo</h4><p>R$ ' + totalCost.toFixed(2) + '</p></div>' +
        '<div class="summary-card"><h4>Peso</h4><p>' + slabWeight.toFixed(0) + ' kg</p></div>';
      return;
    }
  }

  const selectedGrupo = (mode === 'tag' && currentTag && window.tagModel[currentTag]) ? window.tagModel[currentTag] : null;
  const selectedElements = selectedGrupo ? getTagElementsByFilter(selectedGrupo) : [];
  const selectedResumo = selectedGrupo ? (currentStoreyFilter ? summarizeElements(selectedElements) : {
    totalElementos: Number(selectedGrupo.total_elementos || (selectedGrupo.elementos || []).length || 0),
    totalGrupos: Number(selectedGrupo.total_grupos || selectedGrupo.quantidade || 0),
    metroLinear: Number(selectedGrupo.metro_linear || 0),
    area: Number(selectedGrupo.area || 0),
    volume: Number(selectedGrupo.volume || 0)
  }) : null;

  if (selectedGrupo && selectedResumo) {
    const totalElementosTag = Number(selectedResumo.totalElementos || 0);
    const totalGruposTag = Number(selectedResumo.totalGrupos || 0);
    const totalMlTag = Number(selectedResumo.metroLinear || 0);
    const totalAreaTag = Number(selectedResumo.area || 0);
    const totalVolumeTag = Number(selectedResumo.volume || 0);
    const eficienciaTag = totalElementosTag > 0
      ? Math.max(0, ((1 - (totalGruposTag / totalElementosTag)) * 100))
      : 0;
    const inconsistenciasTag = selectedElements.reduce(function (acc, e) {
      const semIfc = !e || !e.ifc || String(e.ifc).trim() === '' || String(e.ifc).trim() === '-';
      if (!semIfc) { return acc; }
      return acc + Math.max(1, Math.round(parseLocalizedNumberDisplay(e.quantidade || e.quantity || 1)));
    }, 0);
    const qualidadeIfcTag = totalElementosTag > 0
      ? Math.max(0, ((1 - (inconsistenciasTag / totalElementosTag)) * 100))
      : 100;
    const filtroPav = currentStoreyFilter ? currentStoreyFilter : 'Todos os pavimentos';

    globalSummary.innerHTML =
      '<div class="summary-card"><h4>TAG Selecionada</h4><p>' + currentTag + '</p><span class="meta">Pavimento: ' + filtroPav + '</span></div>' +
      '<div class="summary-card"><h4>Elementos da TAG</h4><p>' + totalElementosTag + '</p></div>' +
      '<div class="summary-card"><h4>Grupos da TAG</h4><p>' + totalGruposTag + '</p></div>' +
      '<div class="summary-card"><h4>Eficiência da TAG</h4><p>' + eficienciaTag.toFixed(0) + '%</p></div>' +
      '<div class="summary-card"><h4>Metro Linear (TAG)</h4><p>' + totalMlTag.toFixed(2) + ' m</p></div>' +
      '<div class="summary-card"><h4>Área (TAG)</h4><p>' + totalAreaTag.toFixed(2) + ' m²</p></div>' +
      '<div class="summary-card"><h4>Volume (TAG)</h4><p>' + totalVolumeTag.toFixed(2) + ' m³</p></div>' +
      '<div class="summary-card"><h4>IFC sem Classificação</h4><p>' + inconsistenciasTag + '</p></div>' +
      '<div class="summary-card"><h4>Qualidade IFC (TAG)</h4><p>' + qualidadeIfcTag.toFixed(0) + '%</p><span class="meta">Base: TAG selecionada</span></div>';
    return;
  }

  let topMlTag = null;
  let topAreaTag = null;
  let totalElementos = 0;
  let totalGrupos = 0;
  let totalMetroLinear = 0;
  let totalArea = 0;
  let totalVolume = 0;

  Object.keys(window.tagModel).forEach(function (tag) {
    const grupo = window.tagModel[tag] || {};
    const grupoMl = Number(grupo.metro_linear || 0);
    const grupoArea = Number(grupo.area || 0);
    totalElementos += Number(grupo.total_elementos || (grupo.elementos || []).length || 0);
    totalGrupos += Number(grupo.total_grupos || grupo.quantidade || 0);
    totalMetroLinear += grupoMl;
    totalArea += grupoArea;
    totalVolume += Number(grupo.volume || 0);

    if (!topMlTag || grupoMl > topMlTag.valor) {
      topMlTag = { tag: tag, valor: grupoMl };
    }
    if (!topAreaTag || grupoArea > topAreaTag.valor) {
      topAreaTag = { tag: tag, valor: grupoArea };
    }
  });

  const eficienciaAgrupamento = totalElementos > 0
    ? Math.max(0, ((1 - (totalGrupos / totalElementos)) * 100))
    : 0;
  const dashboardModel = window.relatorioTagDashboard || null;
  const totalInconsistencias = Number(dashboardModel && dashboardModel.all ? dashboardModel.all.mismatches || 0 : 0);
  const qualidadeIfc = totalElementos > 0
    ? Math.max(0, ((1 - (totalInconsistencias / totalElementos)) * 100))
    : 100;

  const topMlLabel = topMlTag ? topMlTag.tag : '-';
  const topMlValue = topMlTag ? topMlTag.valor.toFixed(1) + ' m' : '-';
  const topAreaLabel = topAreaTag ? topAreaTag.tag : '-';
  const topAreaValue = topAreaTag ? topAreaTag.valor.toFixed(1) + ' m²' : '-';

  globalSummary.innerHTML =
    '<div class="summary-card"><h4>Elementos do Projeto</h4><p>' + totalElementos + '</p></div>' +
    '<div class="summary-card"><h4>Grupos Técnicos</h4><p>' + totalGrupos + '</p></div>' +
    '<div class="summary-card"><h4>Eficiência de Agrupamento</h4><p>' + eficienciaAgrupamento.toFixed(0) + '%</p></div>' +
    '<div class="summary-card"><h4>Metro Linear Total</h4><p>' + totalMetroLinear.toFixed(2) + ' m</p></div>' +
    '<div class="summary-card"><h4>Área Total</h4><p>' + totalArea.toFixed(2) + ' m²</p></div>' +
    '<div class="summary-card"><h4>Volume Total</h4><p>' + totalVolume.toFixed(2) + ' m³</p></div>' +
    '<div class="summary-card"><h4>Top TAG (ML)</h4><p>' + topMlLabel + '</p><span class="meta">' + topMlValue + '</span></div>' +
    '<div class="summary-card"><h4>Top TAG (Área)</h4><p>' + topAreaLabel + '</p><span class="meta">' + topAreaValue + '</span></div>' +
    '<div class="summary-card"><h4>Qualidade IFC</h4><p>' + qualidadeIfc.toFixed(0) + '%</p><span class="meta">' + totalInconsistencias + ' inconsistência(s) TAG x IFC</span></div>';
}

function renderGraficoML() {
  'use strict';
  const graficoMl = document.getElementById('graficoMl');
  if (!graficoMl || !window.tagModel) { return; }

  const mode = getDashboardMode();
  if (mode === 'element') {
    const e = findElementByKey(currentElement);
    if (!e) {
      currentElement = null;
    } else {
      const len = Number(parseLocalizedNumberDisplay(e.comprimento || e.metro_linear_total || 0));
      graficoMl.innerHTML =
        '<h4>Elemento Selecionado</h4>' +
        '<div style="margin-bottom:8px;color:#334155;font-size:12px;">' + getElementLabel(e) + ' • TAG: ' + String(e.tag || '-') + '</div>' +
        '<div class="bar-container">' +
        '<div class="bar-label"><span>Comprimento</span><span>' + len.toFixed(2) + ' m</span></div>' +
        '<div class="bar-track"><div class="bar" style="width:100%"></div></div>' +
        '</div>';
      return;
    }
  }

  if (mode === 'tag' && currentTag && window.tagModel[currentTag]) {
    const grupo = window.tagModel[currentTag];
    const elementos = getTagElementsByFilter(grupo);
    const ifcBuckets = {};

    elementos.forEach(function (e) {
      if (!e) { return; }
      const ifc = String(e.ifc || 'SEM IFC').trim() || 'SEM IFC';
      if (!ifcBuckets[ifc]) { ifcBuckets[ifc] = 0; }
      ifcBuckets[ifc] += Number(detectElementLength(e) || 0);
    });

    const series = Object.keys(ifcBuckets).map(function (ifcName) {
      return { nome: ifcName, metro_linear: Number(ifcBuckets[ifcName] || 0) };
    }).filter(function (item) {
      return item.metro_linear > 0;
    }).sort(function (a, b) {
      return b.metro_linear - a.metro_linear;
    }).slice(0, 5);

    if (series.length === 0) {
      graficoMl.innerHTML = '<h4>Top 5 IFC (ML) - ' + currentTag + '</h4><div style="color:#64748b;font-size:12px;">Sem dados de metro linear para esta TAG/filtro.</div>';
      return;
    }

    const maxMlLocal = Number(series[0].metro_linear || 0) || 1;
    let htmlLocal = '<h4>Top 5 IFC (ML) - ' + currentTag + '</h4>';

    series.forEach(function (item) {
      const widthLocal = Math.min((item.metro_linear / maxMlLocal) * 100, 100);
      htmlLocal +=
        '<div class="bar-container">' +
        '<div class="bar-label"><span>' + item.nome + '</span><span>' + item.metro_linear.toFixed(1) + ' m</span></div>' +
        '<div class="bar-track"><div class="bar" style="width:' + widthLocal.toFixed(2) + '%"></div></div>' +
        '</div>';
    });

    graficoMl.innerHTML = htmlLocal;
    return;
  }

  const tags = Object.keys(window.tagModel).map(function (tagName) {
    return {
      nome: tagName,
      metro_linear: Number(window.tagModel[tagName] && window.tagModel[tagName].metro_linear ? window.tagModel[tagName].metro_linear : 0)
    };
  }).filter(function (tag) {
    return tag.metro_linear > 0;
  }).sort(function (a, b) {
    return b.metro_linear - a.metro_linear;
  }).slice(0, 5);

  if (tags.length === 0) {
    graficoMl.innerHTML = '<h4>Top 5 TAG (ML)</h4><div style="color:#64748b;font-size:12px;">Sem dados de metro linear para exibir.</div>';
    return;
  }

  const maxMl = Number(tags[0].metro_linear || 0) || 1;
  let html = '<h4>Top 5 TAG (ML)</h4>';

  tags.forEach(function (tag) {
    const width = Math.min((tag.metro_linear / maxMl) * 100, 100);
    html +=
      '<div class="bar-container">' +
      '<div class="bar-label"><span>' + tag.nome + '</span><span>' + tag.metro_linear.toFixed(1) + ' m</span></div>' +
      '<div class="bar-track"><div class="bar" style="width:' + width.toFixed(2) + '%"></div></div>' +
      '</div>';
  });

  graficoMl.innerHTML = html;
}

function carregarPavimentos(tag) {
  'use strict';
  const select = document.getElementById('filtroPavimento');
  const grupo = window.tagModel && tag ? window.tagModel[tag] : null;
  if (!select) { return; }

  select.innerHTML = '<option value="">Todos os pavimentos</option>';

  if (!grupo || !Array.isArray(grupo.elementos)) {
    select.value = '';
    currentStoreyFilter = '';
    return;
  }

  const pavimentos = [];
  const seen = new Set();
  grupo.elementos.forEach(function (e) {
    const pav = String((e && (e.storey || e.pavimento)) || '').trim();
    if (!pav || seen.has(pav)) { return; }
    seen.add(pav);
    pavimentos.push(pav);
  });

  pavimentos.sort().forEach(function (pav) {
    const option = document.createElement('option');
    option.value = pav;
    option.textContent = pav;
    select.appendChild(option);
  });

  if (currentStoreyFilter && seen.has(currentStoreyFilter)) {
    select.value = currentStoreyFilter;
  } else {
    currentStoreyFilter = '';
    select.value = '';
  }
}

function getTagElementsByFilter(grupo) {
  'use strict';
  const elementos = Array.isArray(grupo && grupo.elementos) ? grupo.elementos : [];
  const byStorey = !currentStoreyFilter ? elementos : elementos.filter(function (e) {
    return String((e && (e.storey || e.pavimento)) || '') === currentStoreyFilter;
  });

  return applyQueryEngineFilter(byStorey, dashboardSearchTerm);
}

function summarizeElements(elements) {
  'use strict';
  return elements.reduce(function (acc, e) {
    const rowElementos = Math.max(1, Math.round(parseLocalizedNumberDisplay(e && (e.quantidade || e.quantity) ? (e.quantidade || e.quantity) : 1)));
    const rowGrupos = (e && e.is_group) ? 1 : rowElementos;
    acc.totalElementos += rowElementos;
    acc.totalGrupos += rowGrupos;
    var _sml = e && (e.metro_linear_total || e.comprimento);
    acc.metroLinear += Number(parseLocalizedNumberDisplay(_sml ? _sml : 0));
    var _sarea = e && (e.area_total || e.area);
    acc.area += Number(parseLocalizedNumberDisplay(_sarea ? _sarea : 0));
    var _svol = e && (e.volume_total || e.volume);
    acc.volume += Number(parseLocalizedNumberDisplay(_svol ? _svol : 0));
    var _epsVol = e && (e.eps_volume_total || e.eps_volume_m3);
    acc.epsVolume += Number(parseLocalizedNumberDisplay(_epsVol ? _epsVol : 0));
    var _concCost = e && (e.concrete_cost_total || e.concrete_cost);
    acc.concreteCost += Number(parseLocalizedNumberDisplay(_concCost ? _concCost : 0));
    var _epsCost = e && (e.eps_cost_total || e.eps_cost);
    acc.epsCost += Number(parseLocalizedNumberDisplay(_epsCost ? _epsCost : 0));
    var _slabWeight = e && (e.slab_weight_total_kg || e.slab_weight_kg);
    acc.slabWeightKg += Number(parseLocalizedNumberDisplay(_slabWeight ? _slabWeight : 0));
    return acc;
  }, {
    totalElementos: 0,
    totalGrupos: 0,
    metroLinear: 0,
    area: 0,
    volume: 0,
    epsVolume: 0,
    concreteCost: 0,
    epsCost: 0,
    slabWeightKg: 0
  });
}

function renderTabela(elements) {
  'use strict';
  const tabela = document.getElementById('tabela');
  const tabelaWrapper = document.getElementById('tabelaWrapper');
  if (!tabela) { return; }

  // Em modo ELEMENTO, não renderizar tabela (apenas KPIs são mostrados)
  if (getDashboardMode() === 'element') {
    if (tabelaWrapper) { setDashboardPanelVisible(tabelaWrapper, false); }
    return;
  }

  if (tabelaWrapper) { setDashboardPanelVisible(tabelaWrapper, true); }
  const list = Array.isArray(elements) ? elements : [];
  let filteredElements = applyQueryEngineFilter(list, dashboardSearchTerm);

  // Evita tela "vazia" em TAG por busca residual do contexto anterior.
  if (getDashboardMode() === 'tag' && filteredElements.length === 0 && list.length > 0) {
    filteredElements = list;
  }

  let metricKey = 'volume';
  let metricLabel = 'Volume (m³)';
  if (currentTag && window.tagModel && window.tagModel[currentTag]) {
    const g = window.tagModel[currentTag] || {};
    if (Number(g.volume || 0) <= 0 && Number(g.area || 0) > 0) {
      metricKey = 'area';
      metricLabel = 'Area (m²)';
    } else if (Number(g.volume || 0) <= 0 && Number(g.area || 0) <= 0) {
      metricKey = 'comprimento';
      metricLabel = 'Metro Linear (m)';
    }
  }

  const sectionTitle = currentTag ? currentTag : 'GLOBAL';
  const totalInstances = list.reduce(function (sum, e) {
    return sum + Math.max(1, Math.round(parseLocalizedNumberDisplay(e.quantidade || e.quantity || 1)));
  }, 0);
  const countLabel = getDashboardMode() === 'tag' && filteredElements.length > 0 && filteredElements.length !== totalInstances
    ? filteredElements.length + ' grupos • ' + totalInstances + ' instâncias'
    : filteredElements.length + ' elementos';
  let html = '<thead><tr><th>' + sectionTitle + ' <span style="opacity:.75;font-weight:600;">' + countLabel + '</span></th><th style="text-align:right;">' + metricLabel + '</th></tr></thead><tbody>';

  if (filteredElements.length === 0) {
    tabela.innerHTML = html + '<tr><td colspan="2" class="tag-empty">Nenhum elemento encontrado para esta TAG/filtro.</td></tr></tbody>';
    return;
  }

  filteredElements.forEach(function (e) {
    const rowKey = getElementKey(e);
    const safeKey = escapeForSingleQuote(rowKey);
    const rawMetric = metricKey === 'area' ? (e.area || e.area_total || 0) : (metricKey === 'comprimento' ? (e.comprimento || e.metro_linear_total || 0) : (e.volume || e.volume_total || 0));
    const metricValue = Number(parseLocalizedNumberDisplay(rawMetric || 0));
    const rowQty = Math.max(1, Math.round(parseLocalizedNumberDisplay(e.quantidade || e.quantity || 1)));
    const rowQtyLabel = rowQty > 1 ? rowQty + ' inst.' : '1 inst.';
    const rowSub = e.ifc ? String(e.ifc) : String((e.storey || e.pavimento) || '-');
    html += '<tr onclick="selectElementByKey(\'' + safeKey + '\', true)" style="cursor: pointer;">' +
      '<td><div style="font-weight:700;">' + (e.instance || e.nome || 'Elemento') + '</div><div style="font-size:11px;opacity:.72;">' + rowSub + ' • ' + rowQtyLabel + '</div></td>' +
      '<td style="text-align:right;font-weight:700;">' + metricValue.toFixed(2).replace('.', ',') + '</td>' +
      '</tr>';
  });

  tabela.innerHTML = html + '</tbody>';
}

// ✅ HARDENING: setDashboardSearchTerm() and clearDashboardSearch() REMOVED
// Use AppState.setSearchTerm() instead
// Legacy code using these will be routed through AppState via EventBus

function setDashboardSearchTerm(term) {
  'use strict';
  const value = String(term == null ? '' : term);
  const input = document.getElementById('dashboardSearchInput');
  if (input) { input.value = value; }

  if (typeof AppState !== 'undefined' && AppState.setSearchTerm) {
    AppState.setSearchTerm(value);
  }

  if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
    RenderManager.renderAll();
  } else {
    renderDashboard();
  }
}

function clearDashboardSearch() {
  'use strict';
  setDashboardSearchTerm('');
}

function getAllTagElements() {
  'use strict';
  if (!window.tagModel) { return []; }
  return Object.keys(window.tagModel).reduce(function (acc, tag) {
    const grupo = window.tagModel[tag] || {};
    const elements = Array.isArray(grupo.elementos) ? grupo.elementos : [];
    return acc.concat(elements);
  }, []);
}

function setDashboardPanelVisible(element, visible) {
  'use strict';
  if (!element) { return; }
  element.style.display = visible ? '' : 'none';
}

function renderResumoEtiquetas() {
  'use strict';
  const resumo = document.getElementById('resumo');
  if (!resumo || !window.tagModel) { return; }

  const rows = Object.keys(window.tagModel).map(function (tagName) {
    const grupo = window.tagModel[tagName] || {};
    const totalInst = Number(grupo.total_elementos || (grupo.elementos || []).length || 0);
    const grupos = Array.isArray(grupo.elementos) ? grupo.elementos.length : 0;
    return {
      tag: tagName,
      grupos: grupos,
      total: totalInst,
      area: Number(grupo.area || 0),
      volume: Number(grupo.volume || 0),
      ml: Number(grupo.metro_linear || 0)
    };
  }).sort(function (a, b) {
    return b.total - a.total;
  });

  if (rows.length === 0) {
    resumo.innerHTML = '';
    setDashboardPanelVisible(resumo, false);
    return;
  }

  let html =
    '<div style="background:#121722;border:1px solid #2b3444;border-radius:12px;overflow:hidden;">' +
    '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #2b3444;">' +
    '<strong style="color:#e2e8f0;font-size:16px;">📊 Resumo por Etiqueta</strong>' +
    '<span style="font-size:12px;color:#8ea3c2;">' + rows.length + ' tags</span>' +
    '</div>';

  rows.forEach(function (row) {
    const safeTag = escapeForSingleQuote(row.tag);
    const areaText = row.area > 0 ? row.area.toFixed(2).replace('.', ',') + ' m²' : '-';
    const volumeText = row.volume > 0 ? row.volume.toFixed(2).replace('.', ',') + ' m³' : '-';
    const mlText = row.ml > 0 ? row.ml.toFixed(2).replace('.', ',') + ' m' : '-';
    const countLabel = row.grupos > 1 && row.grupos !== row.total
      ? row.grupos + ' grupos • ' + row.total + ' inst.'
      : row.total + ' elementos';
    html +=
      '<div onclick="selectTag(\'' + safeTag + '\', null)" style="display:grid;grid-template-columns:1.3fr 0.9fr 0.9fr 0.9fr;gap:10px;padding:12px 16px;border-top:1px solid #243044;cursor:pointer;">' +
      '<div style="min-width:0;">' +
      '<div style="font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(row.tag) + '</div>' +
      '<div style="font-size:12px;color:#8ea3c2;">' + countLabel + '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:#c7d2e5;"><strong style="display:block;color:#f8fafc;font-size:16px;line-height:1.1;">' + areaText + '</strong>Area</div>' +
      '<div style="font-size:12px;color:#c7d2e5;"><strong style="display:block;color:#f8fafc;font-size:16px;line-height:1.1;">' + volumeText + '</strong>Volume</div>' +
      '<div style="font-size:12px;color:#c7d2e5;"><strong style="display:block;color:#f8fafc;font-size:16px;line-height:1.1;">' + mlText + '</strong>M. Linear</div>' +
      '</div>';
  });

  resumo.innerHTML = html + '</div>';
  setDashboardPanelVisible(resumo, true);
}

function renderGlobalModeDetails() {
  'use strict';
  const globalSummary = document.getElementById('globalSummary');
  const kpis = document.getElementById('kpis');
  const alerta = document.getElementById('alerta');
  const resumo = document.getElementById('resumo');
  const graficoMl = document.getElementById('graficoMl');
  const allElements = getAllTagElements();
  const totals = summarizeElements(allElements);
  const tabela = document.getElementById('tabela');

  if (globalSummary) {
    globalSummary.innerHTML =
      '<div class="summary-card"><h4>ELEMENTOS</h4><p>' + totals.totalElementos + '</p><span class="meta">unidades</span></div>' +
      '<div class="summary-card"><h4>AREA</h4><p>' + totals.area.toFixed(2).replace('.', ',') + '</p><span class="meta">m²</span></div>' +
      '<div class="summary-card"><h4>VOLUME</h4><p>' + totals.volume.toFixed(2).replace('.', ',') + '</p><span class="meta">m³</span></div>' +
      '<div class="summary-card"><h4>METRO LINEAR</h4><p>' + totals.metroLinear.toFixed(2).replace('.', ',') + '</p><span class="meta">m</span></div>';
  }

  if (kpis) {
    kpis.innerHTML = '';
    setDashboardPanelVisible(kpis, false);
  }
  if (graficoMl) {
    graficoMl.innerHTML = '';
    setDashboardPanelVisible(graficoMl, false);
  }
  if (alerta) { alerta.innerHTML = ''; }
  if (resumo) { resumo.innerHTML = ''; }
  if (tabela) { tabela.innerHTML = ''; }

  renderResumoEtiquetas();

  const rows = Object.keys(window.tagModel || {}).map(function (tagName) {
    const g = window.tagModel[tagName] || {};
    return {
      instance: tagName,
      ifc: 'TAG',
      storey: Number(g.total_elementos || (g.elementos || []).length || 0) + ' elementos',
      comprimento: Number(g.metro_linear || 0).toFixed(2) + ' m',
      area: Number(g.area || 0).toFixed(2)
    };
  });
  renderTabela(rows);
}

function renderElementModeDetails(selectedKey) {
  'use strict';
  const globalSummary = document.getElementById('globalSummary');
  const kpis = document.getElementById('kpis');
  const alerta = document.getElementById('alerta');
  const resumo = document.getElementById('resumo');
  const graficoMl = document.getElementById('graficoMl');
  const e = findElementByKey(selectedKey);

  if (!e) {
    currentElement = null;
    renderDashboard();
    return;
  }

  const len = Number(parseLocalizedNumberDisplay(e.comprimento || e.metro_linear_total || 0));
  const area = Number(parseLocalizedNumberDisplay(e.area || e.area_total || 0));
  const vol = Number(parseLocalizedNumberDisplay(e.volume || e.volume_total || 0));
  if (globalSummary) {
    globalSummary.innerHTML =
      '<div class="summary-card"><h4>ELEMENTO</h4><p>' + getElementLabel(e) + '</p><span class="meta">' + String(e.ifc || '-') + '</span></div>' +
      '<div class="summary-card"><h4>COMPRIMENTO</h4><p>' + len.toFixed(2).replace('.', ',') + '</p><span class="meta">m</span></div>' +
      '<div class="summary-card"><h4>AREA</h4><p>' + area.toFixed(2).replace('.', ',') + '</p><span class="meta">m²</span></div>' +
      '<div class="summary-card"><h4>VOLUME</h4><p>' + vol.toFixed(2).replace('.', ',') + '</p><span class="meta">m³</span></div>';
  }
  if (kpis) {
    kpis.innerHTML = '';
    setDashboardPanelVisible(kpis, false);
  }
  if (alerta) { alerta.innerHTML = ''; }
  if (resumo) {
    resumo.innerHTML = '';
    setDashboardPanelVisible(resumo, false);
  }
  if (graficoMl) {
    graficoMl.innerHTML = '';
    setDashboardPanelVisible(graficoMl, false);
  }

  renderTabela([e]);
}

function updateDashboardModeUI() {
  'use strict';
  const title = document.getElementById('dashboardTitle');
  const indicator = document.getElementById('modeIndicator');
  const btnGlobal = document.getElementById('modeGlobalBtn');
  const btnTag = document.getElementById('modeTagBtn');
  const filtro = document.getElementById('filtroPavimento');
  const backToTagBtn = document.getElementById('backToTagBtn');
  const backToGlobalBtn = document.getElementById('backToGlobalBtn');
  const mode = getDashboardMode();
  renderDashboardBreadcrumb();

  if (btnGlobal) { btnGlobal.classList.toggle('active', mode === 'global'); }
  if (btnTag) { btnTag.classList.toggle('active', mode === 'tag'); }

  if (mode === 'element') {
    const e = findElementByKey(currentElement);
    if (title) { title.textContent = 'ELEMENTO: ' + (e ? getElementLabel(e) : currentElement); }
    if (indicator) { indicator.textContent = 'Modo: ELEMENTO'; }
    if (filtro) { filtro.disabled = true; }
    if (backToTagBtn) { backToTagBtn.style.display = currentTag ? '' : 'none'; }
    if (backToGlobalBtn) { backToGlobalBtn.style.display = ''; }
    return;
  }

  if (mode === 'tag' && currentTag) {
    if (title) { title.textContent = 'TAG: ' + currentTag; }
    if (indicator) { indicator.textContent = 'Modo: TAG -> ' + currentTag; }
    if (filtro) { filtro.disabled = false; }
    if (backToTagBtn) { backToTagBtn.style.display = 'none'; }
    if (backToGlobalBtn) { backToGlobalBtn.style.display = ''; }
  } else {
    if (title) { title.textContent = 'Relatorio BIM'; }
    if (indicator) { indicator.textContent = 'Modo: GLOBAL'; }
    if (filtro) { filtro.disabled = true; }
    if (backToTagBtn) { backToTagBtn.style.display = 'none'; }
    if (backToGlobalBtn) { backToGlobalBtn.style.display = 'none'; }
  }
}

function bindDashboardModeEvents() {
  'use strict';
  if (dashboardModeEventsBound) { return; }

  const btnGlobal = document.getElementById('modeGlobalBtn');
  const btnTag = document.getElementById('modeTagBtn');
  const backToTagBtn = document.getElementById('backToTagBtn');
  const backToGlobalBtn = document.getElementById('backToGlobalBtn');

  if (btnGlobal) {
    btnGlobal.addEventListener('click', function () {
      backToGlobalMode();
    });
  }

  if (btnTag) {
    btnTag.addEventListener('click', function () {
      if (!currentTag && window.tagModel) {
        const sortedTags = Object.keys(window.tagModel).sort();
        currentTag = sortedTags.length > 0 ? sortedTags[0] : null;
      }
      if (currentTag) {
        currentElement = null;
        currentMode = 'tag';
        carregarPavimentos(currentTag);
      }
      updateDashboardModeUI();
      renderMenu();
      renderDashboard();
    });
  }

  if (backToTagBtn) {
    backToTagBtn.addEventListener('click', function () {
      backToTagMode();
    });
  }

  if (backToGlobalBtn) {
    backToGlobalBtn.addEventListener('click', function () {
      backToGlobalMode();
    });
  }

  dashboardModeEventsBound = true;
}

function renderDashboard() {
  'use strict';
  const mode = getDashboardMode();
  updateDashboardModeUI();

  if (mode === 'element' && currentElement) {
    renderElementModeDetails(currentElement);
    return;
  }

  if (mode === 'tag' && currentTag && window.tagModel && window.tagModel[currentTag]) {
    renderTag(currentTag);
  } else {
    renderGlobalModeDetails();
  }
}

function filtrarPavimento() {
  'use strict';
  const select = document.getElementById('filtroPavimento');
  const storey = select ? String(select.value || '') : '';

  // ✅ NOVO: Usar AppState em vez de mutar global
  AppState.setStoreyFilter(storey);

  const mode = getDashboardMode();
  if (mode === 'element') {
    AppState.setCurrentElement(null);
  }
  if (mode !== 'tag') {
    AppState.setStoreyFilter('');
    if (select) { select.value = ''; }
    return;
  }

  // ✅ NOVO: Emitir evento
  EventBus.emit(EventBus.Events.STOREY_FILTER_CHANGED, { storey: storey });

  if (typeof RenderManager === 'undefined') {
    renderDashboard();
  }
}

function selectTag(tag, element) {
  'use strict';
  if (!window.tagModel || !window.tagModel[tag]) { return; }

  // ✅ NOVO: Usar AppState + EventBus em vez de mutar globals
  AppState.setCurrentTag(tag);
  AppState.setCurrentElement(null);
  AppState.setSearchTerm('');
  const inputEl = document.getElementById('dashboardSearchInput');
  if (inputEl) { inputEl.value = ''; }
  carregarPavimentos(tag);

  // ✅ NOVO: Emitir evento para listeners (renderManager, etc)
  EventBus.emit(EventBus.Events.TAG_SELECTED, { tag: tag });

  // Remove classe active de todos os items
  const items = document.querySelectorAll('.menu-item');
  items.forEach(function (item) {
    item.classList.remove('active');
  });

  // Adiciona active ao selecionado
  if (element) {
    element.classList.add('active');
  }

  // ✅ NOVO: RenderManager é chamado via EventBus listener, não direto aqui
  // Mas mantemos renderDashboard() como fallback para compatibilidade
  if (typeof RenderManager === 'undefined') {
    renderDashboard();
  }
}

function renderTag(tag) {
  'use strict';
  if (!window.tagModel || !window.tagModel[tag]) { return; }

  const grupo = window.tagModel[tag];
  const elementosBase = resolveTagElementsForRender(tag, grupo);
  let elementosFiltrados = !currentStoreyFilter ? elementosBase : elementosBase.filter(function (e) {
    return String((e && (e.storey || e.pavimento)) || '') === currentStoreyFilter;
  });
  if (elementosFiltrados.length === 0 && elementosBase.length > 0) {
    elementosFiltrados = elementosBase;
  }
  const resumoFiltrado = currentStoreyFilter ? summarizeElements(elementosFiltrados) : null;
  const totalElementos = currentStoreyFilter ? resumoFiltrado.totalElementos : Number(grupo.total_elementos || (grupo.elementos || []).length || 0);
  const totalMetroLinear = currentStoreyFilter ? resumoFiltrado.metroLinear : Number(grupo.metro_linear || 0);
  const totalArea = currentStoreyFilter ? resumoFiltrado.area : Number(grupo.area || 0);
  const totalVolume = currentStoreyFilter ? resumoFiltrado.volume : Number(grupo.volume || 0);
  const globalSummary = document.getElementById('globalSummary');
  const kpis = document.getElementById('kpis');
  const alerta = document.getElementById('alerta');
  const resumo = document.getElementById('resumo');
  const graficoMl = document.getElementById('graficoMl');

  let metricLabel = 'VOLUME';
  let metricUnit = 'm³';
  let metricValue = totalVolume;
  if (metricValue <= 0 && totalArea > 0) {
    metricLabel = 'AREA';
    metricUnit = 'm²';
    metricValue = totalArea;
  } else if (metricValue <= 0 && totalMetroLinear > 0) {
    metricLabel = 'METRO LINEAR';
    metricUnit = 'm';
    metricValue = totalMetroLinear;
  }

  if (globalSummary) {
    globalSummary.innerHTML =
      '<div class="summary-card"><h4>ELEMENTOS</h4><p>' + totalElementos + '</p><span class="meta">unidades</span></div>' +
      '<div class="summary-card"><h4>' + metricLabel + '</h4><p>' + metricValue.toFixed(2).replace('.', ',') + '</p><span class="meta">' + metricUnit + '</span></div>';
  }

  if (kpis) {
    kpis.innerHTML = '';
    setDashboardPanelVisible(kpis, false);
  }
  if (alerta) { alerta.innerHTML = ''; }
  if (resumo) {
    resumo.innerHTML = '';
    setDashboardPanelVisible(resumo, false);
  }
  if (graficoMl) {
    graficoMl.innerHTML = '';
    setDashboardPanelVisible(graficoMl, false);
  }

  renderTabela(elementosFiltrados);
}

function focusEntity(id) {
  'use strict';
  // ✅ HARDENING: Use Bridge instead of direct window.sketchup calls
  if (typeof Bridge !== 'undefined' && Bridge.focusEntity) {
    Bridge.focusEntity(id);
  }
}

function renderFirst() {
  'use strict';
  if (window.tagModel) {
    // ✅ HARDENING: Use AppState instead of direct mutations
    AppState.backToGlobal();
    AppState.setSearchTerm('');
    const inputEl = document.getElementById('dashboardSearchInput');
    if (inputEl) { inputEl.value = ''; }
    if (typeof RenderManager !== 'undefined') {
      RenderManager.renderAll();
    } else {
      renderDashboard();
    }
  }
}

window.buildSimpleTagModel = buildSimpleTagModel;
window.renderMenu = renderMenu;
window.renderGlobalSummary = renderGlobalSummary;
window.renderGraficoML = renderGraficoML;
window.carregarPavimentos = carregarPavimentos;
window.renderTabela = renderTabela;
window.filtrarPavimento = filtrarPavimento;
window.selectTag = selectTag;
window.selectElementByKey = selectElementByKey;
window.backToTagMode = backToTagMode;
window.backToGlobalMode = backToGlobalMode;
window.renderTag = renderTag;
window.focusEntity = focusEntity;
window.renderFirst = renderFirst;
window.setDashboardSearchTerm = setDashboardSearchTerm;
window.clearDashboardSearch = clearDashboardSearch;