// =============================================================================
// KPI Cards Module — Isolated KPI Rendering Component
// =============================================================================
// Responsabilidade: Renderizar cards de KPI (métricas principais)
// Entrada: Estado (AppState)
// Saída: DOM atualizado
// Dependências: KPIEngine, AppState (read-only)

'use strict';

const KPICardsModule = (() => {
  // =========================================================================
  // RENDER KPI CARDS
  // =========================================================================

  /**
   * Renderiza cards de KPI baseado no modo atual
   * @param {Object} state - Estado atual do AppState
   * @returns {void}
   */
  const render = (state) => {
    const container = document.getElementById('globalSummary');
    if (!container) { return; }

    // Renderizar baseado no modo
    if (state.currentElement) {
      _renderElementKPI(state, container);
    } else if (state.currentTag) {
      _renderTagKPI(state, container);
    } else {
      _renderGlobalKPI(state, container);
    }
  };

  // =========================================================================
  // ELEMENTO MODE - KPI de um elemento individual
  // =========================================================================

  const _renderElementKPI = (state, container) => {
    const element = _findElementByKey(state.currentElement);
    if (!element) {
      container.innerHTML = '<div style="color:#64748b;padding:16px;font-size:12px;">Elemento não encontrado.</div>';
      return;
    }

    const tag = String(element.tag || state.currentTag || '-');
    const ifc = String(element.ifc || '-');
    const pav = String((element.storey || element.pavimento) || '-');
    const len = _parseNumber(element.comprimento || element.metro_linear_total || 0);
    const area = _parseNumber(element.area || element.area_total || 0);
    const vol = _parseNumber(element.volume || element.volume_total || 0);
    const concCost = _parseNumber(element.concrete_cost || element.concrete_cost_total || 0);
    const epsCost = _parseNumber(element.eps_cost || element.eps_cost_total || 0);
    const totalCost = concCost + epsCost;
    const slabWeight = _parseNumber(element.slab_weight_kg || element.slab_weight_total_kg || 0);

    container.innerHTML =
      '<div class="summary-card"><h4>Elemento Selecionado</h4><p>' + _formatLabel(element) + '</p><span class="meta">Modo: ELEMENTO</span></div>' +
      '<div class="summary-card"><h4>TAG</h4><p>' + tag + '</p></div>' +
      '<div class="summary-card"><h4>IFC</h4><p>' + ifc + '</p></div>' +
      '<div class="summary-card"><h4>Pavimento</h4><p>' + pav + '</p></div>' +
      '<div class="summary-card"><h4>Comprimento</h4><p>' + len.toFixed(2) + ' m</p></div>' +
      '<div class="summary-card"><h4>Área</h4><p>' + area.toFixed(2) + ' m²</p></div>' +
      '<div class="summary-card"><h4>Volume</h4><p>' + vol.toFixed(2) + ' m³</p></div>' +
      '<div class="summary-card"><h4>Custo</h4><p>R$ ' + totalCost.toFixed(2) + '</p></div>' +
      '<div class="summary-card"><h4>Peso</h4><p>' + slabWeight.toFixed(0) + ' kg</p></div>';
  };

  // =========================================================================
  // TAG MODE - KPI de uma tag selecionada
  // =========================================================================

  const _renderTagKPI = (state, container) => {
    const tag = state.currentTag;
    const tagModel = window.tagModel || {};
    const grupo = tagModel[tag];

    if (!grupo) {
      container.innerHTML = '<div style="color:#64748b;padding:16px;font-size:12px;">TAG não encontrada.</div>';
      return;
    }

    const elementos = _getTagElementsByFilter(grupo, state.filters.storey);
    const resumo = _summarizeElements(elementos);

    const totalElementosTag = Number(resumo.totalElementos || 0);
    const totalGruposTag = Number(resumo.totalGrupos || 0);
    const totalMlTag = Number(resumo.metroLinear || 0);
    const totalAreaTag = Number(resumo.area || 0);
    const totalVolumeTag = Number(resumo.volume || 0);

    const eficienciaTag = totalElementosTag > 0
      ? Math.max(0, ((1 - (totalGruposTag / totalElementosTag)) * 100))
      : 0;

    const inconsistenciasTag = elementos.reduce(function (acc, e) {
      const semIfc = !e || !e.ifc || String(e.ifc).trim() === '' || String(e.ifc).trim() === '-';
      if (!semIfc) { return acc; }
      return acc + Math.max(1, Math.round(_parseNumber(e.quantidade || e.quantity || 1)));
    }, 0);

    const qualidadeIfcTag = totalElementosTag > 0
      ? Math.max(0, ((1 - (inconsistenciasTag / totalElementosTag)) * 100))
      : 100;

    const filtroPav = state.filters.storey ? state.filters.storey : 'Todos os pavimentos';

    container.innerHTML =
      '<div class="summary-card"><h4>TAG Selecionada</h4><p>' + tag + '</p><span class="meta">Pavimento: ' + filtroPav + '</span></div>' +
      '<div class="summary-card"><h4>Elementos da TAG</h4><p>' + totalElementosTag + '</p></div>' +
      '<div class="summary-card"><h4>Grupos da TAG</h4><p>' + totalGruposTag + '</p></div>' +
      '<div class="summary-card"><h4>Eficiência da TAG</h4><p>' + eficienciaTag.toFixed(0) + '%</p></div>' +
      '<div class="summary-card"><h4>Metro Linear (TAG)</h4><p>' + totalMlTag.toFixed(2) + ' m</p></div>' +
      '<div class="summary-card"><h4>Área (TAG)</h4><p>' + totalAreaTag.toFixed(2) + ' m²</p></div>' +
      '<div class="summary-card"><h4>Volume (TAG)</h4><p>' + totalVolumeTag.toFixed(2) + ' m³</p></div>' +
      '<div class="summary-card"><h4>IFC sem Classificação</h4><p>' + inconsistenciasTag + '</p></div>' +
      '<div class="summary-card"><h4>Qualidade IFC (TAG)</h4><p>' + qualidadeIfcTag.toFixed(0) + '%</p><span class="meta">Base: TAG selecionada</span></div>';
  };

  // =========================================================================
  // GLOBAL MODE - KPI globais de todo projeto
  // =========================================================================

  const _renderGlobalKPI = (state, container) => {
    const tagModel = window.tagModel || {};

    let topMlTag = null;
    let topAreaTag = null;
    let totalElementos = 0;
    let totalGrupos = 0;
    let totalMetroLinear = 0;
    let totalArea = 0;
    let totalVolume = 0;

    Object.keys(tagModel).forEach(function (tag) {
      const grupo = tagModel[tag] || {};
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

    container.innerHTML =
      '<div class="summary-card"><h4>Elementos do Projeto</h4><p>' + totalElementos + '</p></div>' +
      '<div class="summary-card"><h4>Grupos Técnicos</h4><p>' + totalGrupos + '</p></div>' +
      '<div class="summary-card"><h4>Eficiência de Agrupamento</h4><p>' + eficienciaAgrupamento.toFixed(0) + '%</p></div>' +
      '<div class="summary-card"><h4>Metro Linear Total</h4><p>' + totalMetroLinear.toFixed(2) + ' m</p></div>' +
      '<div class="summary-card"><h4>Área Total</h4><p>' + totalArea.toFixed(2) + ' m²</p></div>' +
      '<div class="summary-card"><h4>Volume Total</h4><p>' + totalVolume.toFixed(2) + ' m³</p></div>' +
      '<div class="summary-card"><h4>Top TAG (ML)</h4><p>' + topMlLabel + '</p><span class="meta">' + topMlValue + '</span></div>' +
      '<div class="summary-card"><h4>Top TAG (Área)</h4><p>' + topAreaLabel + '</p><span class="meta">' + topAreaValue + '</span></div>' +
      '<div class="summary-card"><h4>Qualidade IFC</h4><p>' + qualidadeIfc.toFixed(0) + '%</p><span class="meta">' + totalInconsistencias + ' inconsistência(s) TAG x IFC</span></div>';
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

  const _getTagElementsByFilter = (grupo, storeyFilter) => {
    const elementos = Array.isArray(grupo && grupo.elementos) ? grupo.elementos : [];
    if (!storeyFilter) { return elementos; }
    return elementos.filter(function (e) {
      return String((e && (e.storey || e.pavimento)) || '') === storeyFilter;
    });
  };

  const _summarizeElements = (elements) => {
    return (elements || []).reduce(function (acc, e) {
      const rowElementos = Math.max(1, Math.round(_parseNumber(e && (e.quantidade || e.quantity) ? (e.quantidade || e.quantity) : 1)));
      const rowGrupos = (e && e.is_group) ? 1 : rowElementos;
      acc.totalElementos += rowElementos;
      acc.totalGrupos += rowGrupos;
      var _sml = e && (e.metro_linear_total || e.comprimento);
      acc.metroLinear += Number(_parseNumber(_sml ? _sml : 0));
      var _sarea = e && (e.area_total || e.area);
      acc.area += Number(_parseNumber(_sarea ? _sarea : 0));
      var _svol = e && (e.volume_total || e.volume);
      acc.volume += Number(_parseNumber(_svol ? _svol : 0));
      var _epsVol = e && (e.eps_volume_total || e.eps_volume_m3);
      acc.epsVolume += Number(_parseNumber(_epsVol ? _epsVol : 0));
      var _concCost = e && (e.concrete_cost_total || e.concrete_cost);
      acc.concreteCost += Number(_parseNumber(_concCost ? _concCost : 0));
      var _epsCost = e && (e.eps_cost_total || e.eps_cost);
      acc.epsCost += Number(_parseNumber(_epsCost ? _epsCost : 0));
      var _slabWeight = e && (e.slab_weight_total_kg || e.slab_weight_kg);
      acc.slabWeightKg += Number(_parseNumber(_slabWeight ? _slabWeight : 0));
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
  };

  const _getElementKey = (e) => {
    if (!e) { return ''; }
    return String(e.persistent_id || e.highlight_id || e.id || '').trim();
  };

  const _formatLabel = (e) => {
    if (!e) { return 'Elemento'; }
    return String(e.instance || e.nome || e.entity || _getElementKey(e) || 'Elemento');
  };

  const _parseNumber = (val) => {
    if (typeof val === 'number') { return val; }
    if (typeof val === 'string') {
      return Number(val.replace(',', '.')) || 0;
    }
    return Number(val) || 0;
  };

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  return {
    render: render,
    debug() {
      return { module: 'KPICardsModule', version: '1.0' };
    }
  };
})();

// Exportar para global
window.KPICardsModule = KPICardsModule;
