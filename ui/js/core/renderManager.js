// Inicializa feature flags centralizadas
if (!window.Runtime) window.Runtime = {};
if (!window.Runtime.flags) window.Runtime.flags = { semanticInspector: true };

// =============================================================================
// RenderManager — Centralized Render Pipeline Orchestration
// =============================================================================
// Centraliza todo rendering do dashboard
// Impede renders duplicados e mantém UI sincronizada com AppState
// Listener único para mudanças de estado

'use strict';

const RenderManager = (() => {
  // ✅ HARDENING: Render instrumentation
  let renderCount = 0;
  let lastRenderTime = 0;
  let renderMetrics = {
    totalRenders: 0,
    lastRenderDuration: 0,
    lastRenderMode: '',
    renderHistory: [] // Last 20 renders
  };

  // Controle de rendering em andamento
  let isRendering = false;
  let pendingRender = false;
  let renderTimeout = null;
  const DEBOUNCE_MS = 16; // ~60fps

  // =========================================================================
  // QUEUE RENDERING - Debounce para evitar múltiplos renders
  // =========================================================================

  const _queueRender = (renderFn) => {
    if (renderTimeout) clearTimeout(renderTimeout);

    if (!isRendering) {
      isRendering = true;
      renderFn();
      isRendering = false;
      pendingRender = false;
    } else {
      pendingRender = true;
      renderTimeout = setTimeout(() => {
        if (pendingRender) {
          isRendering = true;
          renderFn();
          isRendering = false;
          pendingRender = false;
        }
      }, DEBOUNCE_MS);
    }
  };

  // =========================================================================
  // STATE SNAPSHOT
  // =========================================================================

  const _getCachedState = () => {
    const state = AppState.getState();
    return {
      mode: state.navigation.mode,
      currentTag: state.navigation.currentTag,
      currentElement: state.navigation.currentElement,
      breadcrumb: state.navigation.breadcrumb,
      storey: state.filters.storey,
      search: state.filters.search
    };
  };

  // =========================================================================
  // MAIN RENDER ORCHESTRATOR
  // =========================================================================

  const _renderAll = () => {
    // ✅ HARDENING: Instrument render calls
    const startTime = performance.now();
    renderCount++;
    renderMetrics.totalRenders++;

    // 1. Obter estados e runtime
    const state = _getCachedState();
    const runtime = window.Runtime || {};
    const schema = window.FIELD_GROUPS || null;
    // Exemplo de métrica global (pode ser expandido)
    const metrics = {
      count: window.tagModel ? Object.values(window.tagModel).reduce((acc, t) => acc + Number(t.total_elementos || (t.elementos || []).length || 0), 0) : 0
    };

    // 2. Construir renderContext formal
    let renderContext = null;
    if (window.buildRenderContext) {
      renderContext = window.buildRenderContext({ runtime, states: state, schema, metrics });
    } else {
      // Fallback mínimo
      renderContext = { navigation: {}, selection: {}, schema, metrics };
    }

    const currentTime = performance.now();

    // Detectar loops: 2+ renders em <50ms é suspeito
    if (lastRenderTime && (currentTime - lastRenderTime) < 50) {
      console.warn('[RenderManager] ⚠️ RENDER LOOP DETECTED:', {
        renders: renderMetrics.renderHistory.slice(-3),
        interval: currentTime - lastRenderTime,
        state: renderContext?.workspace?.mode || state.mode
      });
    }

    lastRenderTime = currentTime;

    // Log de render
    const renderLog = {
      count: renderCount,
      mode: String(renderContext?.workspace?.mode || state.mode || '').toLowerCase(),
      tag: renderContext?.workspace?.activeTag || state.currentTag || null,
      timestamp: new Date().toISOString().substr(11, 8)
    };

    // Manter histórico das últimas 20 renderizações
    renderMetrics.renderHistory.push(renderLog);
    if (renderMetrics.renderHistory.length > 20) {
      renderMetrics.renderHistory.shift();
    }

    // Debug log em desenvolvimento
    if (typeof customLog === 'function') {
      customLog('[Render #' + renderCount + '] ' + renderLog.mode + (renderLog.tag ? ' (TAG: ' + renderLog.tag + ')' : ''));
    }

    // 3. Atualizar UI de modo/layout
    _updateModeUI(state);

    // 4. Render sidebar (menu)
    if (typeof SidebarModule !== 'undefined' && SidebarModule.render) {
      SidebarModule.render(state);
    } else {
      _renderMenu(state);
    }

    // 5. Render semantic workspace header (PHASE 4: Orchestration → Presentation)
    if (window.workspaceHeaderRenderer && window.buildWorkspaceHeaderViewModel) {
      const viewModel = window.buildWorkspaceHeaderViewModel(renderContext);
      const container = document.getElementById('dashboardBreadcrumb');
      if (container) {
        container.innerHTML = window.workspaceHeaderRenderer.renderWorkspaceHeader(viewModel);
      }
    } else {
      // Fallback: Render breadcrumb procedural
      if (typeof BreadcrumbModule !== 'undefined' && BreadcrumbModule.render) {
        BreadcrumbModule.render(state);
      } else {
        _renderBreadcrumb(state);
      }
    }

    // 6. Renderizar conteúdo principal baseado no modo (TAG é contexto principal).
    // Fallback para AppState quando buildRenderContext não está disponível.
    const wsMode = (renderContext?.workspace?.mode || state.mode || '').toLowerCase();
    const activeTag = renderContext?.workspace?.activeTag || state.currentTag;
    const activeElement = renderContext?.workspace?.activeElement || state.currentElement;

    if (wsMode === 'element' && activeElement && !activeTag) {
      _renderElementMode(state);
    } else if (wsMode === 'tag' || activeTag) {
      _renderTagMode(state);
    } else {
      _renderGlobalMode(state);
    }

    // 7. Calcular duração do render e registrar diagnóstico
    const endTime = performance.now();
    renderMetrics.lastRenderDuration = endTime - startTime;
    renderMetrics.lastRenderMode = renderLog.mode;
    if (renderContext && renderContext.diagnostics) {
      renderContext.diagnostics.duration = renderMetrics.lastRenderDuration;
    }
  };

  // =========================================================================
  // MODO GLOBAL
  // =========================================================================

  const _renderGlobalMode = (state) => {
    const globalSummary = document.getElementById('globalSummary');
    const tabela = document.getElementById('tabela');

    // ✅ PHASE 3: Use KPICardsModule for global KPI rendering
    if (typeof KPICardsModule !== 'undefined' && KPICardsModule.render) {
      KPICardsModule.render(state);
    } else {
      // Fallback: Calcular totais globais
      const allElements = _getAllTagElements();
      const totals = _summarizeElements(allElements);

      // Atualizar cards de resumo
      if (globalSummary) {
        globalSummary.innerHTML =
          '<div class="summary-card"><h4>ELEMENTOS</h4><p>' + totals.totalElementos + '</p><span class="meta">unidades</span></div>' +
          '<div class="summary-card"><h4>AREA</h4><p>' + totals.area.toFixed(2).replace('.', ',') + '</p><span class="meta">m²</span></div>' +
          '<div class="summary-card"><h4>VOLUME</h4><p>' + totals.volume.toFixed(2).replace('.', ',') + '</p><span class="meta">m³</span></div>' +
          '<div class="summary-card"><h4>METRO LINEAR</h4><p>' + totals.metroLinear.toFixed(2).replace('.', ',') + '</p><span class="meta">m</span></div>';
      }
    }

    // Esconder KPIs, alertas, resumos
    _setDashboardPanelVisible(document.getElementById('kpis'), false);
    _setDashboardPanelVisible(document.getElementById('graficoMl'), false);
    const alerta = document.getElementById('alerta');
    const resumo = document.getElementById('resumo');
    if (alerta) alerta.innerHTML = '';
    if (resumo) {
      resumo.innerHTML = '';
      _setDashboardPanelVisible(resumo, false);
    }

    // Resumo de etiquetas removido — informação ja disponivel na sidebar esquerda
    // Tabela de tags duplicada removida — selecione uma TAG na sidebar para
    // ver os elementos individuais

    const tabelaWrapper = document.getElementById('tabelaWrapper');
    if (tabelaWrapper) {
      _setDashboardPanelVisible(tabelaWrapper, false);
    }

    EventBus.emit('render:completed', { mode: 'global' });
  };

  // =========================================================================
  // MODO TAG
  // =========================================================================

  const _renderTagMode = (state) => {
    if (!window.tagModel || !window.tagModel[state.currentTag]) {
      _renderGlobalMode(state);
      return;
    }

    const grupo = window.tagModel[state.currentTag];
    const elementosBase = _resolveTagElementsForRender(state.currentTag, grupo);

    // Aplicar filtro de pavimento
    let elementosFiltrados = !state.storey ? elementosBase : elementosBase.filter((e) => {
      return String((e && (e.storey || e.pavimento)) || '') === state.storey;
    });

    if (elementosFiltrados.length === 0 && elementosBase.length > 0) {
      elementosFiltrados = elementosBase;
    }

    // ✅ PHASE 3: Use KPICardsModule for TAG KPI rendering
    if (typeof KPICardsModule !== 'undefined' && KPICardsModule.render) {
      KPICardsModule.render(state);
    } else {
      // Fallback: Calcular KPIs
      const kpiData = KPIEngine.calculate({
        tag: state.currentTag,
        elements: elementosFiltrados,
        grupo: grupo
      });

      // Renderizar global summary cards
      const globalSummary = document.getElementById('globalSummary');
      if (globalSummary) {
        globalSummary.innerHTML =
          '<div class="summary-card"><h4>GRUPOS</h4><p>' + kpiData.grupos + '</p><span class="meta">grupos</span></div>' +
          '<div class="summary-card"><h4>INSTÂNCIAS</h4><p>' + kpiData.instancias + '</p><span class="meta">instâncias</span></div>' +
          '<div class="summary-card"><h4>' + kpiData.metricLabel + '</h4><p>' + kpiData.metric.toFixed(2).replace('.', ',') + '</p><span class="meta">' + kpiData.metricUnit + '</span></div>';
      }
    }

    // Esconder/mostrar panels
    _setDashboardPanelVisible(document.getElementById('resumo'), false);
    _setDashboardPanelVisible(document.getElementById('graficoMl'), false);


    // Renderizar painel CAMPOS BIM (semantic inspector)
    const selectColumns = document.getElementById('selectColumns');
    if (selectColumns) {
      if (window.Runtime.flags.semanticInspector && window.semanticInspectorRenderer) {
        // Exemplo de contexto mínimo; pode ser expandido conforme necessário
        const renderContext = {
          visibleFields: window.tableState?.visibleFields || [],
          checkedFields: window.tableState?.checkedFields || [],
          activeField: window.tableState?.activeField || null,
          showMeta: true,
          showChips: true,
          i18n: window.i18n || null
        };
        selectColumns.innerHTML = window.semanticInspectorRenderer.renderSemanticInspector(
          window.FIELD_GROUPS || [],
          renderContext
        );
      } else if (typeof renderLegacyColumns === 'function') {
        renderLegacyColumns(window.tableState);
      }
    }

    // Renderizar tabela (mantém procedural)
    if (typeof renderTabela === 'function') {
      renderTabela(elementosFiltrados);
    }

    // Em modo TAG, elemento selecionado vira foco contextual (sem trocar layout).
    const detailsContainer = document.getElementById('elementDetails');
    if (detailsContainer) {
      const selected = state.currentElement ? _findElementByKey(state.currentElement) : null;
      if (selected) {
        _setDashboardPanelVisible(detailsContainer, true);
        const safeName = String(_getElementLabel(selected) || 'Elemento')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const safeIfc = String(selected.ifc || '-')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const safeStorey = String((selected.storey || selected.pavimento) || '-')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        const metricRaw = selected.volume || selected.volume_total || selected.area || selected.area_total || selected.comprimento || selected.metro_linear_total || 0;
        const metric = Number(metricRaw || 0);

        detailsContainer.innerHTML =
          '<div class="summary-card" style="border-color: rgba(56,189,248,.6);">' +
          '<h4>Elemento em Foco (TAG)</h4>' +
          '<p>' + safeName + '</p>' +
          '<span class="meta">IFC: ' + safeIfc + ' | Pavimento: ' + safeStorey + '</span>' +
          '<div style="margin-top:8px;font-size:12px;color:#9fb3d1;">ID: ' + String(state.currentElement) + '</div>' +
          '<div style="margin-top:6px;font-size:12px;color:#9fb3d1;">Métrica: ' + metric.toFixed(2).replace('.', ',') + '</div>' +
          '</div>';
      } else {
        detailsContainer.innerHTML = '';
        _setDashboardPanelVisible(detailsContainer, false);
      }
    }

    EventBus.emit('render:completed', { mode: 'tag', tag: state.currentTag });
  };

  // =========================================================================
  // MODO ELEMENTO
  // =========================================================================

  const _renderElementMode = (state) => {
    const globalSummary = document.getElementById('globalSummary');
    const e = _findElementByKey(state.currentElement);

    if (!e) {
      AppState.setCurrentElement(null);
      _renderAll();
      return;
    }

    // ✅ PHASE 3: Use KPICardsModule for ELEMENT KPI rendering
    if (typeof KPICardsModule !== 'undefined' && KPICardsModule.render) {
      KPICardsModule.render(state);
    } else {
      // Fallback: Calcular métricas do elemento
      const len = Number(_parseLocalizedNumberDisplay(e.comprimento || e.metro_linear_total || 0));
      const area = Number(_parseLocalizedNumberDisplay(e.area || e.area_total || 0));
      const vol = Number(_parseLocalizedNumberDisplay(e.volume || e.volume_total || 0));

      if (globalSummary) {
        globalSummary.innerHTML =
          '<div class="summary-card"><h4>ELEMENTO</h4><p>' + _getElementLabel(e) + '</p><span class="meta">' + String(e.ifc || '-') + '</span></div>' +
          '<div class="summary-card"><h4>COMPRIMENTO</h4><p>' + len.toFixed(2).replace('.', ',') + '</p><span class="meta">m</span></div>' +
          '<div class="summary-card"><h4>AREA</h4><p>' + area.toFixed(2).replace('.', ',') + '</p><span class="meta">m²</span></div>' +
          '<div class="summary-card"><h4>VOLUME</h4><p>' + vol.toFixed(2).replace('.', ',') + '</p><span class="meta">m³</span></div>';
      }
    }

    // ✅ PHASE 3: Use DetailsModule for element details panel
    const detailsContainer = document.getElementById('elementDetails');
    if (detailsContainer) {
      if (typeof DetailsModule !== 'undefined' && DetailsModule.render) {
        DetailsModule.render(detailsContainer, state);
      } else {
        detailsContainer.innerHTML = '<div style="padding: 15px; color: #666;">Detalhes do elemento</div>';
      }
    }

    // Esconder panels
    _setDashboardPanelVisible(document.getElementById('kpis'), false);
    _setDashboardPanelVisible(document.getElementById('alerta'), false);
    _setDashboardPanelVisible(document.getElementById('resumo'), false);
    _setDashboardPanelVisible(document.getElementById('graficoMl'), false);

    // Renderizar tabela com elemento único
    if (typeof renderTabela === 'function') {
      renderTabela([e]);
    }

    EventBus.emit('render:completed', { mode: 'element', elementKey: state.currentElement });
  };

  // =========================================================================
  // UI UPDATES
  // =========================================================================

  const _updateModeUI = (state) => {
    const indicator = document.getElementById('modeIndicator');
    const title = document.getElementById('dashboardTitle');
    const filtro = document.getElementById('filtroPavimento');
    const btnGlobal = document.getElementById('modeGlobalBtn');
    const btnTag = document.getElementById('modeTagBtn');

    if (indicator) {
      let modeText = 'GLOBAL';
      if (state.mode === 'ELEMENT' && state.currentElement) {
        modeText = 'ELEMENTO: ' + _getElementLabel(_findElementByKey(state.currentElement));
      } else if (state.currentTag) {
        modeText = state.currentElement
          ? ('TAG: ' + state.currentTag + ' | Foco: ' + _getElementLabel(_findElementByKey(state.currentElement)))
          : ('TAG: ' + state.currentTag);
      }
      indicator.textContent = modeText;
    }

    if (title) {
      title.textContent = state.currentTag ? 'Elementos por Tag' : 'Relatório Geral';
    }

    if (filtro) {
      filtro.style.display = state.currentTag ? '' : 'none';
      if (!state.currentTag) filtro.value = '';
    }

    if (btnGlobal) {
      btnGlobal.className = state.mode === 'GLOBAL' ? 'dashboard-nav-btn active' : 'dashboard-nav-btn';
    }

    if (btnTag) {
      btnTag.className = state.mode === 'TAG' ? 'dashboard-nav-btn active' : 'dashboard-nav-btn';
    }

    _syncLayoutModeClass(state);

    // Atualizar menu (sidebar)
    _renderMenu(state);
  };

  const _syncLayoutModeClass = (state) => {
    const body = document.body;
    if (!body || !state) return;

    if (typeof LayoutState !== 'undefined' && typeof LayoutState.applyBodyClass === 'function') {
      LayoutState.applyBodyClass(state.mode);
      return;
    }

    body.classList.remove('layout-dashboard', 'layout-tag', 'layout-element', 'layout-table');

    if (state.mode === 'ELEMENT') {
      body.classList.add('layout-element');
      return;
    }

    if (state.mode === 'TAG') {
      body.classList.add('layout-tag');
      return;
    }

    body.classList.add('layout-dashboard');
  };

  // =========================================================================
  // BREADCRUMB - Sempre derivado do estado
  // =========================================================================

  const _renderBreadcrumb = (state) => {
    const container = document.getElementById('dashboardBreadcrumb');
    if (!container) return;

    const nodes = [{ label: 'GLOBAL', cls: 'global', icon: '🌐' }];

    if (state.currentTag) {
      nodes.push({
        label: state.currentTag,
        cls: 'tag',
        icon: '📋',
        onclick: 'AppState.setCurrentElement(null); RenderManager.renderAll();'
      });
    }

    if (state.currentElement) {
      const el = _findElementByKey(state.currentElement);
      nodes.push({
        label: _getElementLabel(el),
        cls: 'element',
        icon: '📦',
        onclick: ''
      });
    }

    let html = '<nav class="breadcrumb">';
    nodes.forEach((node, i) => {
      const isLast = i === nodes.length - 1;
      const clickAttr = node.onclick ? ` onclick="${node.onclick}"` : '';
      const clickClass = node.onclick ? ' clickable' : '';

      if (i > 0) {
        html += '<span class="breadcrumb-sep"> / </span>';
      }

      if (isLast) {
        html += `<span class="breadcrumb-item current ${node.cls}">${node.icon} ${node.label}</span>`;
      } else {
        html += `<span class="breadcrumb-item link ${node.cls}${clickClass}"${clickAttr}>${node.icon} ${node.label}</span>`;
      }
    });

    html += '</nav>';
    container.innerHTML = html;
  };

  // =========================================================================
  // KPI RENDERING
  // =========================================================================

  const _renderKPICards = (kpiData) => {
    const kpis = document.getElementById('kpis');
    if (!kpis) return;

    _setDashboardPanelVisible(kpis, true);

    let html = '';
    const kpiEntries = [
      { label: 'GRUPOS', value: kpiData.grupos, unit: '' },
      { label: 'INSTÂNCIAS', value: kpiData.instancias, unit: '' },
      { label: kpiData.metricLabel, value: kpiData.metric.toFixed(2), unit: kpiData.metricUnit }
    ];

    kpiEntries.forEach((kpi) => {
      const displayValue = String(kpi.value).replace('.', ',');
      html += `<div class="kpi-card"><span class="kpi-label">${kpi.label}</span><span class="kpi-value">${displayValue}</span><span class="kpi-unit">${kpi.unit}</span></div>`;
    });

    kpis.innerHTML = html;
  };

  // =========================================================================
  // MENU RENDERING
  // =========================================================================

  const _renderMenu = (state) => {
    const menu = document.getElementById('menu');
    if (!menu || !window.tagModel) return;

    menu.innerHTML = '<div class="menu-section-title">Visao Geral</div>';

    const globalTotal = Object.keys(window.tagModel).reduce((acc, tag) => {
      const tagData = window.tagModel[tag] || {};
      return acc + Number(tagData.total_elementos || (tagData.elementos || []).length || 0);
    }, 0);

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
    globalItem.onclick = function () {
      AppState.backToGlobal();
    };
    menu.appendChild(globalItem);

    const tagsTitle = document.createElement('div');
    tagsTitle.className = 'menu-section-title';
    tagsTitle.textContent = 'Etiquetas (Tags)';
    menu.appendChild(tagsTitle);

    const sortedTags = Object.keys(window.tagModel).sort();
    sortedTags.forEach((tag) => {
      const tagData = window.tagModel[tag] || {};
      const totalElementos = Number(tagData.total_elementos || (tagData.elementos || []).length || 0);
      const grupos = Array.isArray(tagData.elementos) ? tagData.elementos.length : 0;
      const countLabel = grupos > 1 && grupos !== totalElementos ? grupos + 'g • ' + totalElementos + 'i' : totalElementos + ' el';
      const icon = _getTagIcon(tag);
      const div = document.createElement('div');
      const isActive = !!state.currentTag && state.currentTag === tag && state.mode !== 'GLOBAL';
      div.className = 'menu-item' + (isActive ? ' active' : '');
      div.innerHTML =
        '<div class="menu-item-main">' +
        '<span class="menu-item-icon">' + icon + '</span>' +
        '<span class="menu-item-text">' +
        '<strong>' + tag + '</strong>' +
        '<small>' + countLabel + '</small>' +
        '</span>' +
        '</div>' +
        '<span class="menu-item-badge">' + totalElementos + '</span>';
      div.onclick = function () {
        AppState.setCurrentTag(tag);
      };
      menu.appendChild(div);
    });
  };

  // =========================================================================
  // RESUMO ETIQUETAS
  // =========================================================================

  const _renderResumoEtiquetas = () => {
    const resumo = document.getElementById('resumo');
    if (!resumo || !window.tagModel) return;

    _setDashboardPanelVisible(resumo, true);

    let html = '';
    const sortedTags = Object.keys(window.tagModel).sort();

    sortedTags.forEach((tag) => {
      const tagData = window.tagModel[tag] || {};
      const totalElementos = Number(tagData.total_elementos || (tagData.elementos || []).length || 0);
      const metroLinear = Number(tagData.metro_linear || 0);
      const area = Number(tagData.area || 0);
      const volume = Number(tagData.volume || 0);
      const icon = _getTagIcon(tag);

      const canShowMl = !window.BIMDataView || !window.BIMDataView.isFieldVisible ||
        window.BIMDataView.isFieldVisible(['comprimento', 'metro_linear_total', 'metro_linear', 'len_x', 'len_y', 'len_z', 'len_xy', 'len_xz', 'len_xyz']);
      const canShowArea = !window.BIMDataView || !window.BIMDataView.isFieldVisible ||
        window.BIMDataView.isFieldVisible(['area', 'area_total', 'area_xy', 'area_xz']);
      const canShowVolume = !window.BIMDataView || !window.BIMDataView.isFieldVisible ||
        window.BIMDataView.isFieldVisible(['volume', 'volume_total']);

      const metrics = [];
      if (canShowMl) { metrics.push('<strong>' + metroLinear.toFixed(2) + '</strong> m'); }
      if (canShowArea) { metrics.push('<strong>' + area.toFixed(2) + '</strong> m²'); }
      if (canShowVolume) { metrics.push('<strong>' + volume.toFixed(2) + '</strong> m³'); }

      html +=
        '<div class="summary-card" style="cursor: pointer;" onclick="AppState.setCurrentTag(\'' + tag.replace(/'/g, "\\'") + '\');RenderManager.renderAll();">' +
        '<h4 style="display: flex; align-items: center; gap: 8px;">' +
        '<span>' + icon + '</span>' +
        '<span>' + tag + '</span>' +
        '</h4>' +
        '<p><strong>' + totalElementos + '</strong> elementos</p>' +
        '<p style="font-size: 11px; color: #666;">' + (metrics.length > 0 ? metrics.join(' | ') : 'Sem métricas visíveis') + '</p>' +
        '</div>';
    });

    resumo.innerHTML = html;
  };

  // =========================================================================
  // UTILITY FUNCTIONS (Mirror from info.js)
  // =========================================================================

  const _getTagIcon = (tagName) => {
    const key = String(tagName || '').toUpperCase();
    if (key.indexOf('LAJE') !== -1) return '🏢';
    if (key.indexOf('FUNDA') !== -1) return '🏗';
    if (key.indexOf('ALVEN') !== -1) return '🧱';
    if (key.indexOf('VIGA') !== -1) return '🪵';
    if (key.indexOf('PILAR') !== -1) return '🏛';
    if (key.indexOf('GLOBAL') !== -1 || key.indexOf('TODOS') !== -1) return '🌐';
    return '📦';
  };

  const _getElementLabel = (e) => {
    if (!e) return 'Elemento';
    return String(e.instance || e.nome || e.entity || e.id || 'Elemento');
  };

  const _normalizeTagLookupKey = (tagName) => {
    return String(tagName || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/S$/, '');
  };

  const _resolveTagElementsForRender = (tagName, grupo) => {
    const base = Array.isArray(grupo && grupo.elementos) ? grupo.elementos : [];
    if (base.length > 0) return base;

    const fromDashboard = _resolveFallbackTagElements(tagName);
    if (fromDashboard.length > 0) return fromDashboard;

    const wanted = _normalizeTagLookupKey(tagName);
    const source = Array.isArray(objects) ? objects : [];
    return source.filter((row) => {
      const rowTag = String((row && (row.tag || row.ifc)) || '').trim();
      if (!rowTag) return false;
      const key = _normalizeTagLookupKey(rowTag);
      return key === wanted || key.indexOf(wanted) >= 0 || wanted.indexOf(key) >= 0;
    });
  };

  const _resolveFallbackTagElements = (tagName) => {
    const dashboard = window.relatorioTagDashboard;
    const tags = dashboard && Array.isArray(dashboard.tags) ? dashboard.tags : [];
    if (!tagName || tags.length === 0) return [];

    const wanted = _normalizeTagLookupKey(tagName);
    let matched = tags.find((t) => _normalizeTagLookupKey(t && t.tag) === wanted);

    if (!matched) {
      matched = tags.find((t) => {
        const key = _normalizeTagLookupKey(t && t.tag);
        return key.indexOf(wanted) >= 0 || wanted.indexOf(key) >= 0;
      });
    }

    if (!matched || !Array.isArray(matched.elements)) return [];

    return matched.elements.map((el) => ({
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
    }));
  };

  const _findElementByKey = (key) => {
    if (!key) return null;
    const wanted = String(key || '').trim();
    if (!wanted) return null;

    const source = Array.isArray(objects) ? objects : [];
    for (let i = 0; i < source.length; i++) {
      const e = source[i];
      const eKey = String(e.persistent_id || e.highlight_id || e.id || '').trim();
      if (eKey === wanted) return e;
    }
    return null;
  };

  const _getAllTagElements = () => {
    const tags = window.tagModel || {};
    const allElements = [];
    Object.keys(tags).forEach((tag) => {
      const tagData = tags[tag] || {};
      if (Array.isArray(tagData.elementos)) {
        allElements.push(...tagData.elementos);
      }
    });
    return allElements;
  };

  const _summarizeElements = (elements) => {
    let totalElementos = 0;
    let metroLinear = 0;
    let area = 0;
    let volume = 0;

    (elements || []).forEach((e) => {
      if (e) {
        totalElementos += 1;
        metroLinear += Number(e.comprimento || e.metro_linear || 0);
        area += Number(e.area || 0);
        volume += Number(e.volume || 0);
      }
    });

    return { totalElementos, metroLinear, area, volume };
  };

  const _parseLocalizedNumberDisplay = (value) => {
    const str = String(value || '0');
    return parseFloat(str.replace(',', '.'));
  };

  const _setDashboardPanelVisible = (element, visible) => {
    if (!element) return;
    if (visible) {
      element.style.display = '';
    } else {
      element.style.display = 'none';
    }
  };

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    /**
     * Render tudo - entry point principal
     */
    renderAll() {
      _queueRender(_renderAll);
    },

    /**
     * Forçar render imediato (sem debounce)
     */
    renderImmediate() {
      isRendering = true;
      _renderAll();
      isRendering = false;
    },

    /**
     * Debug info
     */
    debug() {
      return {
        isRendering,
        pendingRender,
        state: _getCachedState(),
        metrics: renderMetrics,
        renderCount: renderCount
      };
    },

    // ✅ HARDENING: Get render metrics
    getMetrics() {
      return {
        totalRenders: renderMetrics.totalRenders,
        lastRenderDuration: renderMetrics.lastRenderDuration.toFixed(2) + 'ms',
        lastRenderMode: renderMetrics.lastRenderMode,
        renderHistory: renderMetrics.renderHistory
      };
    },

    // ✅ HARDENING: Check for potential render loops
    checkRenderHealth() {
      const history = renderMetrics.renderHistory;
      if (history.length < 2) return { ok: true };

      const last3 = history.slice(-3);
      const intervals = [];

      for (let i = 1; i < last3.length; i++) {
        intervals.push(last3[i].timestamp);
      }

      const hasLoop = renderMetrics.renderHistory.filter(r => r.mode === renderMetrics.lastRenderMode).length > 5;

      return {
        ok: !hasLoop,
        totalRenders: renderMetrics.totalRenders,
        lastMode: renderMetrics.lastRenderMode,
        warningCount: hasLoop ? 'High render frequency detected' : null,
        history: history.slice(-10)
      };
    }
  };
})();

// Exportar para global
window.RenderManager = RenderManager;
