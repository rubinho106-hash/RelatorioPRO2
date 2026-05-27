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
      '<span class="menu-item-icon">' + _getIconSvg('global') + '</span>' +
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
    if (!tag) { return _getIconSvg('box'); }
    const tagUpper = String(tag).toUpperCase();
    if (tagUpper.includes('VIGAS') || tagUpper.includes('VIGA')) { return _getIconSvg('beam'); }
    if (tagUpper.includes('PILARES') || tagUpper.includes('PILAR')) { return _getIconSvg('column'); }
    if (tagUpper.includes('LAJES') || tagUpper.includes('LAJE')) { return _getIconSvg('slab'); }
    if (tagUpper.includes('PAREDES') || tagUpper.includes('PAREDE')) { return _getIconSvg('wall'); }
    if (tagUpper.includes('ESCADAS') || tagUpper.includes('ESCADA')) { return _getIconSvg('stairs'); }
    if (tagUpper.includes('PORTAS') || tagUpper.includes('PORTA')) { return _getIconSvg('door'); }
    if (tagUpper.includes('JANELAS') || tagUpper.includes('JANELA')) { return _getIconSvg('window'); }
    return _getIconSvg('tag');
  };

  const _getIconSvg = (name) => {
    const baseStart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    const baseEnd = '</svg>';

    const icons = {
      global: '<circle cx="12" cy="12" r="9"></circle><path d="M3.8 9h16.4"></path><path d="M3.8 15h16.4"></path><path d="M12 3c2.8 2.6 2.8 14.4 0 18"></path><path d="M12 3c-2.8 2.6-2.8 14.4 0 18"></path>',
      beam: '<path d="M4 9h16"></path><path d="M5 7v4"></path><path d="M19 7v4"></path><path d="M4 15h16"></path>',
      column: '<rect x="8" y="4" width="8" height="16" rx="1.8"></rect><path d="M6 4h12"></path><path d="M6 20h12"></path>',
      slab: '<path d="M4 8h16v8H4z"></path><path d="M4 10h16"></path><path d="M4 14h16"></path>',
      wall: '<path d="M5 6h14v12H5z"></path><path d="M8 6v12"></path><path d="M12 6v12"></path><path d="M16 6v12"></path>',
      stairs: '<path d="M5 19h14"></path><path d="M5 19v-3h3v-3h3v-3h3V7h2"></path>',
      door: '<path d="M7 4h10v16H7z"></path><path d="M11 12h.01"></path>',
      window: '<rect x="5" y="5" width="14" height="14" rx="1"></rect><path d="M5 12h14"></path><path d="M12 5v14"></path>',
      tag: '<path d="M20 12l-8 8-8-8V5h7z"></path><circle cx="9" cy="9" r="1.4"></circle>',
      box: '<path d="M4 8l8-4 8 4-8 4z"></path><path d="M4 8v8l8 4 8-4V8"></path><path d="M12 12v8"></path>'
    };

    const glyph = icons[name] || icons.tag;
    return baseStart + glyph + baseEnd;
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
