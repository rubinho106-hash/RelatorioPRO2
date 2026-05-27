/**
 * DetailsModule
 * 
 * Purpose: Render detailed element information in ELEMENT navigation mode
 * 
 * Pattern: State-driven, pure render function, zero side effects except DOM
 * 
 * Input: render(container, state) where state contains element + context
 * Output: DOM elements in provided container
 * 
 * Responsibility: Element details panel with:
 * - Identification (name, tag, ID)
 * - Metrics (area, volume, length, weight)
 * - Properties (thickness, material, cost, EPS)
 * - IFC Information (type, GUID, quality)
 * - Custom Attributes
 * - SketchUp Actions (highlight, zoom, select)
 */

const DetailsModule = (() => {
  'use strict';

  const _isVisible = (keys) => {
    if (!keys || (Array.isArray(keys) && keys.length === 0)) {
      return true;
    }
    if (!window.BIMDataView || typeof window.BIMDataView.isFieldVisible !== 'function') {
      return true;
    }
    return window.BIMDataView.isFieldVisible(keys);
  };

  /**
   * Format a metric value with unit and proper precision
   * @private
   */
  const _formatMetric = (value, unit, precision = 2) => {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    const num = parseFloat(value);
    if (isNaN(num)) {
      return String(value);
    }

    const formatted = num.toLocaleString('pt-BR', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    });

    return unit ? `${formatted} ${unit}` : formatted;
  };

  /**
   * Find element in data by key
   * @private
   */
  const _findElementByKey = (key, tagElements) => {
    if (!Array.isArray(tagElements)) {
      return null;
    }

    return tagElements.find(el => _getElementKey(el) === key);
  };

  /**
   * Generate element key (ID or index)
   * @private
   */
  const _getElementKey = (element) => {
    return element.id || element.key || `elem-${element.name}`;
  };

  /**
   * Get all elements in current tag
   * @private
   */
  const _getAllTagElements = (tag, state) => {
    if (!tag) return [];

    const tagData = state.data.tags.find(t => t.tag === tag);
    if (!tagData) return [];

    // Try multiple sources for element array
    return tagData.elementos || tagData.elements || tagData.rows || [];
  };

  /**
   * Escape HTML to prevent injection
   * @private
   */
  const _escapeHtml = (text) => {
    if (!text) return '';

    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };

    return String(text).replace(/[&<>"']/g, m => map[m]);
  };

  /**
   * Build details section for identification
   * @private
   */
  const _buildIdentificationSection = (element, tag) => {
    const html = `
      <div class="details-section">
        <h4 class="details-section-title">Identificação</h4>
        <div class="details-field">
          <span class="details-label">Nome:</span>
          <span class="details-value">${_escapeHtml(element.name || 'N/A')}</span>
        </div>
        <div class="details-field">
          <span class="details-label">Tag:</span>
          <span class="details-value">${_escapeHtml(tag || 'N/A')}</span>
        </div>
        <div class="details-field">
          <span class="details-label">ID:</span>
          <span class="details-value details-id">${_escapeHtml(_getElementKey(element))}</span>
        </div>
      </div>
    `;

    return html;
  };

  /**
   * Build details section for metrics
   * @private
   */
  const _buildMetricsSection = (element) => {
    const metrics = [];

    // Linear metric (metro linear)
    if (_isVisible(['comprimento', 'metro_linear_total', 'metro_linear', 'len_x', 'len_y', 'len_z', 'len_xy', 'len_xz', 'len_xyz']) &&
      element.metroLinear !== null && element.metroLinear !== undefined) {
      metrics.push({
        label: 'Comprimento',
        value: _formatMetric(element.metroLinear, 'm', 2),
        icon: '📏'
      });
    }

    // Area
    if (_isVisible(['area', 'area_total', 'area_xy', 'area_xz']) &&
      element.area !== null && element.area !== undefined && element.area > 0) {
      metrics.push({
        label: 'Área',
        value: _formatMetric(element.area, 'm²', 2),
        icon: '📐'
      });
    }

    // Volume
    if (_isVisible(['volume', 'volume_total']) &&
      element.volume !== null && element.volume !== undefined && element.volume > 0) {
      metrics.push({
        label: 'Volume',
        value: _formatMetric(element.volume, 'm³', 3),
        icon: '📦'
      });
    }

    // Thickness (espessura)
    if (element.espessura !== null && element.espessura !== undefined) {
      metrics.push({
        label: 'Espessura',
        value: _formatMetric(element.espessura, 'cm', 1),
        icon: '⏱️'
      });
    }

    // Weight (peso)
    if (_isVisible(['peso', 'slab_weight_kg', 'slab_weight_total_kg', 'size']) &&
      element.peso !== null && element.peso !== undefined && element.peso > 0) {
      metrics.push({
        label: 'Peso',
        value: _formatMetric(element.peso, 'kg', 2),
        icon: '⚖️'
      });
    }

    if (metrics.length === 0) {
      return '';
    }

    const metricsHtml = metrics
      .map(m => `
        <div class="details-field">
          <span class="details-label">${m.icon} ${m.label}:</span>
          <span class="details-value">${m.value}</span>
        </div>
      `)
      .join('');

    return `
      <div class="details-section">
        <h4 class="details-section-title">Métricas</h4>
        ${metricsHtml}
      </div>
    `;
  };

  /**
   * Build details section for properties
   * @private
   */
  const _buildPropertiesSection = (element) => {
    const properties = [];

    // Cost
    if (_isVisible(['price', 'total', 'custo']) &&
      element.custo !== null && element.custo !== undefined && element.custo > 0) {
      properties.push({
        label: 'Custo',
        value: _formatMetric(element.custo, 'R$', 2),
        icon: '💰'
      });
    }

    // Material
    if (_isVisible(['material']) && element.material) {
      properties.push({
        label: 'Material',
        value: _escapeHtml(element.material),
        icon: '🏗️'
      });
    }

    // EPS (environmental impact)
    if (element.EPS || element.eps) {
      properties.push({
        label: 'EPS',
        value: _escapeHtml(element.EPS || element.eps),
        icon: '🌱'
      });
    }

    // Category
    if (element.categoria) {
      properties.push({
        label: 'Categoria',
        value: _escapeHtml(element.categoria),
        icon: '🏷️'
      });
    }

    // Status
    if (element.status) {
      properties.push({
        label: 'Status',
        value: _escapeHtml(element.status),
        icon: '📍'
      });
    }

    if (properties.length === 0) {
      return '';
    }

    const propertiesHtml = properties
      .map(p => `
        <div class="details-field">
          <span class="details-label">${p.icon} ${p.label}:</span>
          <span class="details-value">${p.value}</span>
        </div>
      `)
      .join('');

    return `
      <div class="details-section">
        <h4 class="details-section-title">Propriedades</h4>
        ${propertiesHtml}
      </div>
    `;
  };

  /**
   * Build details section for IFC information
   * @private
   */
  const _buildIFCSection = (element) => {
    const ifcFields = [];

    // IFC Type
    if (_isVisible(['ifc']) && (element.IFC || element.ifc)) {
      ifcFields.push({
        label: 'Tipo IFC',
        value: _escapeHtml(element.IFC || element.ifc),
        icon: '📋'
      });
    }

    // IFC GUID
    if (_isVisible(['ifc']) && (element.IFC_GUID || element.ifcGuid || element.guid)) {
      ifcFields.push({
        label: 'GUID',
        value: _escapeHtml(element.IFC_GUID || element.ifcGuid || element.guid),
        icon: '🔑',
        monospace: true
      });
    }

    // IFC Quality/Status
    if (element.ifcQuality || element.ifc_quality) {
      ifcFields.push({
        label: 'Qualidade IFC',
        value: _escapeHtml(element.ifcQuality || element.ifc_quality),
        icon: '✓'
      });
    }

    if (ifcFields.length === 0) {
      return '';
    }

    const ifcHtml = ifcFields
      .map(f => `
        <div class="details-field">
          <span class="details-label">${f.icon} ${f.label}:</span>
          <span class="details-value ${f.monospace ? 'details-monospace' : ''}">${f.value}</span>
        </div>
      `)
      .join('');

    return `
      <div class="details-section">
        <h4 class="details-section-title">Informações IFC</h4>
        ${ifcHtml}
      </div>
    `;
  };

  /**
   * Build details section for custom attributes
   * @private
   */
  const _buildAttributesSection = (element) => {
    const customAttrs = [];

    // Common attribute fields to skip
    const skipFields = [
      'id', 'key', 'name', 'tag', 'metroLinear', 'area', 'volume',
      'espessura', 'peso', 'custo', 'material', 'EPS', 'eps',
      'categoria', 'status', 'IFC', 'ifc', 'ifcGuid', 'IFC_GUID',
      'guid', 'ifcQuality', 'ifc_quality', 'elementos', 'elements'
    ];

    // Collect custom attributes
    for (const [key, value] of Object.entries(element)) {
      if (skipFields.includes(key)) continue;
      if (value === null || value === undefined) continue;
      if (typeof value === 'object' || typeof value === 'function') continue;
      if (!_isVisible([key])) continue;

      customAttrs.push({
        key: _escapeHtml(key),
        value: _escapeHtml(String(value))
      });
    }

    if (customAttrs.length === 0) {
      return '';
    }

    const attrsHtml = customAttrs
      .map(a => `
        <div class="details-field">
          <span class="details-label">${a.key}:</span>
          <span class="details-value">${a.value}</span>
        </div>
      `)
      .join('');

    return `
      <div class="details-section">
        <h4 class="details-section-title">Atributos Customizados</h4>
        ${attrsHtml}
      </div>
    `;
  };

  /**
   * Build details section for SketchUp actions
   * @private
   */
  const _buildActionsSection = (elementKey) => {
    const html = `
      <div class="details-section details-actions">
        <h4 class="details-section-title">Ações</h4>
        <div class="details-actions-buttons">
          <button 
            class="details-action-btn details-action-highlight"
            data-action="highlight"
            data-element="${_escapeHtml(elementKey)}"
            title="Destacar elemento no modelo"
          >
            ✨ Destacar
          </button>
          <button 
            class="details-action-btn details-action-zoom"
            data-action="zoom"
            data-element="${_escapeHtml(elementKey)}"
            title="Zoom no elemento"
          >
            🔍 Zoom
          </button>
          <button 
            class="details-action-btn details-action-select"
            data-action="select"
            data-element="${_escapeHtml(elementKey)}"
            title="Selecionar no modelo"
          >
            ☑️ Selecionar
          </button>
        </div>
      </div>
    `;

    return html;
  };

  /**
   * Handle action button click
   * @private
   */
  const _handleActionClick = (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const elementKey = button.dataset.element;

    switch (action) {
      case 'highlight':
        if (typeof Bridge !== 'undefined' && Bridge.highlightEntity) {
          Bridge.highlightEntity(elementKey);
        }
        break;

      case 'zoom':
        if (typeof Bridge !== 'undefined' && Bridge.zoomEntity) {
          Bridge.zoomEntity(elementKey);
        } else if (typeof Bridge !== 'undefined' && Bridge.zoomSelection) {
          Bridge.zoomSelection();
        }
        break;

      case 'select':
        if (typeof Bridge !== 'undefined' && Bridge.selectEntities) {
          Bridge.selectEntities([elementKey]);
        }
        break;
    }
  };

  /**
   * Main render function
   * 
   * @param {HTMLElement} container - DOM container to render into
   * @param {Object} state - AppState object with navigation and data
   * 
   * @example
   * DetailsModule.render(document.getElementById('elementDetails'), appState.getState())
   */
  const render = (container, state) => {
    if (!container) return;
    if (!state) return;

    // Clear container
    container.innerHTML = '';

    // Exit early if not in ELEMENT mode
    if (state.navigation.mode !== 'ELEMENT') {
      return;
    }

    const currentElement = state.navigation.currentElement;
    const currentTag = state.navigation.currentTag;

    if (!currentElement || !currentTag) {
      container.innerHTML = `
        <div class="details-empty">
          <p>Selecione um elemento para ver detalhes</p>
        </div>
      `;
      return;
    }

    // Find element in state data
    const tagElements = _getAllTagElements(currentTag, state);
    const element = _findElementByKey(currentElement, tagElements);

    if (!element) {
      container.innerHTML = `
        <div class="details-empty">
          <p>Elemento não encontrado</p>
        </div>
      `;
      return;
    }

    // Build HTML sections
    const sections = [
      _buildIdentificationSection(element, currentTag),
      _buildMetricsSection(element),
      _buildPropertiesSection(element),
      _buildIFCSection(element),
      _buildAttributesSection(element),
      _buildActionsSection(currentElement)
    ];

    const html = `
      <div class="details-panel">
        <div class="details-header">
          <h3 class="details-title">${_escapeHtml(element.name || 'Detalhes')}</h3>
        </div>
        <div class="details-content">
          ${sections.filter(s => s).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Attach event listeners
    const buttons = container.querySelectorAll('button[data-action]');
    buttons.forEach(btn => {
      btn.addEventListener('click', _handleActionClick);
    });
  };

  /**
   * Debug method for testing
   */
  const debug = () => {
    return {
      module: 'DetailsModule',
      version: '1.0',
      methods: ['render(container, state)', 'debug()'],
      description: 'Element details panel rendering'
    };
  };

  // Public API
  return {
    render: render,
    debug: debug
  };
})();

// Export to global namespace
window.DetailsModule = DetailsModule;
