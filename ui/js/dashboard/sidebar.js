// =============================================================================
// Sidebar Module — Navigation Sidebar Component
// =============================================================================
// Responsabilidade: Renderizar sidebar com menu de tags
// Entrada: Estado (AppState)
// Saída: DOM atualizado com menu de navegação
// Dependências: AppState (read-only), TagModel

'use strict';

const SidebarModule = (() => {
  // =========================================================================
  // RENDER SIDEBAR
  // =========================================================================

  /**
   * Renderiza menu da sidebar baseado no estado
   * @param {Object} state - Estado atual do AppState
   * @returns {void}
   */
  const render = (state) => {
    const menu = document.getElementById('menu');
    if (!menu || !window.tagModel) { return; }

    menu.innerHTML = '';
    menu.appendChild(_buildGlobalSection(state));
    menu.appendChild(_buildTagsSection(state));
  };

  // =========================================================================
  // GLOBAL SECTION
  // =========================================================================

  const _buildGlobalSection = (state) => {
    const container = document.createElement('div');
    container.className = 'menu-section';

    // Seção title
    const title = document.createElement('div');
    title.className = 'menu-section-title';
    title.textContent = 'Visão Geral';
    container.appendChild(title);

    // Global item
    const globalTotal = _getGlobalTotal();
    const globalItem = document.createElement('div');
    const isGlobalActive = state.mode === 'GLOBAL';
    globalItem.className = 'menu-item' + (isGlobalActive ? ' active' : '');
    globalItem.innerHTML =
      '<div class="menu-item-main">' +
        '<span class="menu-item-icon">🌐</span>' +
        '<span class="menu-item-text">' +
          '<strong>GLOBAL</strong>' +
          '<small>' + globalTotal + ' elementos</small>' +
        '</span>' +
      '</div>' +
      '<span class="menu-item-badge">' + globalTotal + '</span>';
    globalItem.style.cursor = 'pointer';
    globalItem.addEventListener('click', function () {
      _handleGlobalClick();
    });
    container.appendChild(globalItem);

    return container;
  };

  // =========================================================================
  // TAGS SECTION
  // =========================================================================

  const _buildTagsSection = (state) => {
    const container = document.createElement('div');
    container.className = 'menu-section';

    // Section title
    const title = document.createElement('div');
    title.className = 'menu-section-title';
    title.textContent = 'Etiquetas (Tags)';
    container.appendChild(title);

    // Tags
    const sortedTags = Object.keys(window.tagModel).sort();
    sortedTags.forEach(function (tag) {
      const item = _buildTagItem(tag, state);
      container.appendChild(item);
    });

    return container;
  };

  const _buildTagItem = (tag, state) => {
    const tagModel = window.tagModel || {};
    const tagData = tagModel[tag] || {};
    const totalElementos = Number(tagData.total_elementos || (tagData.elementos || []).length || 0);
    const grupos = Array.isArray(tagData.elementos) ? tagData.elementos.length : 0;
    const countLabel = grupos > 1 && grupos !== totalElementos ? grupos + 'g • ' + totalElementos + 'i' : totalElementos + ' el';
    const icon = _getTagIcon(tag);

    const div = document.createElement('div');
    const isActive = state.currentTag === tag && state.mode !== 'GLOBAL';
    div.className = 'menu-item' + (isActive ? ' active' : '');
    div.innerHTML =
      '<div class="menu-item-main">' +
        '<span class="menu-item-icon">' + icon + '</span>' +
        '<span class="menu-item-text">' +
          '<strong>' + _escapeHtml(tag) + '</strong>' +
          '<small>' + countLabel + '</small>' +
        '</span>' +
      '</div>' +
      '<span class="menu-item-badge">' + totalElementos + '</span>';
    div.style.cursor = 'pointer';
    div.addEventListener('click', function () {
      _handleTagClick(tag, div);
    });

    return div;
  };

  // =========================================================================
  // CLICK HANDLERS
  // =========================================================================

  const _handleGlobalClick = () => {
    AppState.backToGlobal();
    EventBus.emit(EventBus.Events.BACK_TO_GLOBAL);
  };

  const _handleTagClick = (tag, element) => {
    if (typeof selectTag === 'function') {
      selectTag(tag, element);
    }
  };

  // =========================================================================
  // HELPERS
  // =========================================================================

  const _getGlobalTotal = () => {
    const tagModel = window.tagModel || {};
    return Object.keys(tagModel).reduce(function (acc, tag) {
      const tagData = tagModel[tag] || {};
      return acc + Number(tagData.total_elementos || (tagData.elementos || []).length || 0);
    }, 0);
  };

  const _getTagIcon = (tag) => {
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

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    render: render,

    debug() {
      return { module: 'SidebarModule', version: '1.0' };
    }
  };
})();

// Exportar para global
window.SidebarModule = SidebarModule;
