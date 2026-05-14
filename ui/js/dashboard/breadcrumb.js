// =============================================================================
// Breadcrumb Module — Navigation Breadcrumb Component
// =============================================================================
// Responsabilidade: Renderizar navegação breadcrumb
// Entrada: Estado (AppState)
// Saída: DOM atualizado com breadcrumb navigation
// Dependências: AppState (read-only)

'use strict';

const BreadcrumbModule = (() => {
  // =========================================================================
  // RENDER BREADCRUMB
  // =========================================================================

  /**
   * Renderiza breadcrumb baseado no estado de navegação
   * @param {Object} state - Estado atual do AppState
   * @returns {void}
   */
  const render = (state) => {
    const container = document.getElementById('dashboardBreadcrumb');
    if (!container) { return; }

    const nodes = _getBreadcrumbNodes(state);
    container.innerHTML = _buildBreadcrumbHTML(nodes);
  };

  // =========================================================================
  // BUILD BREADCRUMB NODES
  // =========================================================================

  /**
   * Constrói array de nós de breadcrumb baseado no estado
   * @param {Object} state - Estado de navegação
   * @returns {Array} Nós de breadcrumb
   */
  const _getBreadcrumbNodes = (state) => {
    const nodes = [];

    // Nó raiz (sempre presente)
    nodes.push({
      label: 'GLOBAL',
      cls: 'global',
      icon: '🌐',
      clickable: true
    });

    // Nó de TAG (se aplicável)
    if (state.currentTag) {
      nodes.push({
        label: state.currentTag,
        cls: 'tag',
        icon: _getTagIcon(state.currentTag),
        clickable: true
      });
    }

    // Nó de ELEMENTO (se aplicável)
    if (state.currentElement) {
      const element = _findElementByKey(state.currentElement);
      const label = element ? _formatLabel(element) : state.currentElement;
      nodes.push({
        label: label,
        cls: 'element',
        icon: '📌',
        clickable: false
      });
    }

    return nodes;
  };

  // =========================================================================
  // BUILD HTML
  // =========================================================================

  /**
   * Constrói HTML do breadcrumb a partir dos nós
   * @param {Array} nodes - Nós de breadcrumb
   * @returns {string} HTML do breadcrumb
   */
  const _buildBreadcrumbHTML = (nodes) => {
    let html = '';

    nodes.forEach(function (node, idx) {
      // Separador
      if (idx > 0) {
        html += '<span class="dashboard-crumb-sep">&gt;</span>';
      }

      // Nó
      const attrs = node.clickable ? 'style="cursor:pointer;font-weight:600;"' : '';
      const onclick = node.clickable ? ' onclick="_breadcrumbClick(\'' + _escapeForSingleQuote(node.label) + '\')"' : '';

      html += '<span class="dashboard-crumb ' + node.cls + '" title="' + _escapeHtml(node.label) + '" ' + attrs + onclick + '>' +
              node.icon + ' ' + _escapeHtml(node.label) +
              '</span>';
    });

    return html;
  };

  // =========================================================================
  // CLICK HANDLER
  // =========================================================================

  /**
   * Tratador de clique no breadcrumb
   * Exposto globalmente para ser chamado pelo onclick
   */
  window._breadcrumbClick = function(label) {
    if (label === 'GLOBAL') {
      // Volta para modo global
      AppState.backToGlobal();
      EventBus.emit(EventBus.Events.BACK_TO_GLOBAL);
    } else if (label && typeof selectTag === 'function') {
      // Navega para TAG
      selectTag(label);
    }
  };

  // =========================================================================
  // HELPERS
  // =========================================================================

  const _findElementByKey = (key) => {
    const wanted = String(key || '').trim();
    if (!wanted) { return null; }
    const all = _getAllTagElements();
    for (let i = 0; i < all.length; i += 1) {
      const e = all[i];
      if (_getElementKey(e) === wanted) { return e; }
    }
    return null;
  };

  const _getAllTagElements = () => {
    if (!window.tagModel) { return []; }
    return Object.keys(window.tagModel).reduce(function (acc, tag) {
      const grupo = window.tagModel[tag] || {};
      const elements = Array.isArray(grupo.elementos) ? grupo.elementos : [];
      return acc.concat(elements);
    }, []);
  };

  const _getElementKey = (e) => {
    if (!e) { return ''; }
    return String(e.persistent_id || e.highlight_id || e.id || '').trim();
  };

  const _formatLabel = (e) => {
    if (!e) { return 'Elemento'; }
    return String(e.instance || e.nome || e.entity || _getElementKey(e) || 'Elemento');
  };

  const _getTagIcon = (tag) => {
    // Icons padrão baseado em padrões de TAG
    if (!tag) { return '📦'; }
    const tagUpper = String(tag).toUpperCase();
    if (tagUpper.includes('VIGAS') || tagUpper.includes('VIGA')) { return '➖'; }
    if (tagUpper.includes('PILARES') || tagUpper.includes('PILAR')) { return '📟'; }
    if (tagUpper.includes('LAJES') || tagUpper.includes('LAJE')) { return '📘'; }
    if (tagUpper.includes('PAREDES') || tagUpper.includes('PAREDE')) { return '🟫'; }
    if (tagUpper.includes('ESCADAS') || tagUpper.includes('ESCADA')) { return '🪜'; }
    if (tagUpper.includes('PORTAS') || tagUpper.includes('PORTA')) { return '🚪'; }
    if (tagUpper.includes('JANELAS') || tagUpper.includes('JANELA')) { return '🪟'; }
    return '🏷️';
  };

  const _escapeHtml = (text) => {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const _escapeForSingleQuote = (text) => {
    return String(text == null ? '' : text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  };

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    render: render,

    debug() {
      return { module: 'BreadcrumbModule', version: '1.0' };
    }
  };
})();

// Exportar para global
window.BreadcrumbModule = BreadcrumbModule;
