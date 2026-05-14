// =============================================================================
// KPIEngine — Pure KPI Calculation Engine
// =============================================================================
// Calcula KPIs sem side effects
// Totalmente desacoplado de rendering e DOM

'use strict';

const KPIEngine = (() => {
  return {
    /**
     * Calcular KPIs para um contexto (tag, elementos, etc)
     * @param {object} context - { tag, elements, grupo }
     * @returns {object} KPI data pronto para render
     */
    calculate(context) {
      const { tag, elements = [], grupo = {} } = context;

      // Contar grupos (documentos únicos no grupo.elementos)
      const grupos = Array.isArray(grupo.elementos) ? grupo.elementos.length : 0;

      // Contar instâncias (total de elementos filtrados ou do grupo)
      const instancias = Array.isArray(elements) ? elements.length : Number(grupo.total_elementos || 0);

      // Calcular métrica principal (volume ou metro linear)
      let metricLabel = 'VOLUME';
      let metricUnit = 'm³';
      let metric = this._sumProperty(elements, 'volume', grupo.volume);

      if (metric === 0 && grupo.metro_linear && grupo.metro_linear > 0) {
        metricLabel = 'METRO LINEAR';
        metricUnit = 'm';
        metric = Number(grupo.metro_linear || 0);
      }

      if (metric === 0) {
        metricLabel = 'AREA';
        metricUnit = 'm²';
        metric = this._sumProperty(elements, 'area', grupo.area);
      }

      return {
        tag,
        grupos,
        instancias,
        metricLabel,
        metricUnit,
        metric,
        // Valores adicionais para relatórios
        metroLinear: this._sumProperty(elements, 'comprimento', grupo.metro_linear),
        area: this._sumProperty(elements, 'area', grupo.area),
        volume: this._sumProperty(elements, 'volume', grupo.volume)
      };
    },

    /**
     * Calcular totais para múltiplas tags
     * @param {Array} tags - Array de nomes de tags
     * @returns {object} Totais consolidados
     */
    calculateGlobalTotals(tags = []) {
      let totalGrupos = 0;
      let totalInstancias = 0;
      let totalMetroLinear = 0;
      let totalArea = 0;
      let totalVolume = 0;

      const tagModel = window.tagModel || {};
      tags.forEach((tag) => {
        const grupo = tagModel[tag] || {};
        const elementos = Array.isArray(grupo.elementos) ? grupo.elementos : [];

        totalGrupos += elementos.length;
        totalInstancias += Number(grupo.total_elementos || elementos.length || 0);
        totalMetroLinear += Number(grupo.metro_linear || 0);
        totalArea += Number(grupo.area || 0);
        totalVolume += Number(grupo.volume || 0);
      });

      return {
        totalGrupos,
        totalInstancias,
        totalMetroLinear,
        totalArea,
        totalVolume,
        count: tags.length
      };
    },

    /**
     * Calcular resumo para elementos filtrados (por pavimento, etc)
     * @param {Array} elements - Elementos para resumir
     * @returns {object} Resumo de elementos
     */
    summarizeElements(elements = []) {
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

      return {
        totalElementos,
        metroLinear,
        area,
        volume
      };
    },

    /**
     * Calcular por grupo (grupo = conjunto de instâncias)
     * Útil para estatísticas por grupo
     */
    calculateByGroup(groupKey, elements) {
      const filtered = (elements || []).filter((e) => {
        return e && String(e.group_key || '') === groupKey;
      });

      return this.summarizeElements(filtered);
    },

    /**
     * Achar elemento com maior valor de propriedade
     */
    findMaxByProperty(elements, property) {
      let max = null;
      let maxValue = -Infinity;

      (elements || []).forEach((e) => {
        const val = Number(e[property] || 0);
        if (val > maxValue) {
          maxValue = val;
          max = e;
        }
      });

      return max;
    },

    /**
     * Achar elemento com menor valor de propriedade
     */
    findMinByProperty(elements, property) {
      let min = null;
      let minValue = Infinity;

      (elements || []).forEach((e) => {
        const val = Number(e[property] || 0);
        if (val < minValue) {
          minValue = val;
          min = e;
        }
      });

      return min;
    },

    /**
     * Agrupar elementos por propriedade
     */
    groupBy(elements, property) {
      const groups = {};

      (elements || []).forEach((e) => {
        const key = String(e[property] || 'undefined');
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(e);
      });

      return groups;
    },

    /**
     * Distribuição por pavimento
     */
    distributionByStorey(elements) {
      const distribution = {};

      (elements || []).forEach((e) => {
        const storey = String(e.storey || e.pavimento || 'Sem pavimento');
        if (!distribution[storey]) {
          distribution[storey] = {
            count: 0,
            metroLinear: 0,
            area: 0,
            volume: 0
          };
        }
        distribution[storey].count += 1;
        distribution[storey].metroLinear += Number(e.comprimento || e.metro_linear || 0);
        distribution[storey].area += Number(e.area || 0);
        distribution[storey].volume += Number(e.volume || 0);
      });

      return distribution;
    },

    // =========================================================================
    // UTILITY FUNCTIONS
    // =========================================================================

    /**
     * Somar propriedade em array, com fallback para valor do grupo
     */
    _sumProperty(elements, property, fallback = 0) {
      if (!Array.isArray(elements) || elements.length === 0) {
        return Number(fallback || 0);
      }

      let sum = 0;
      elements.forEach((e) => {
        if (e) {
          const val = Number(e[property] || 0);
          sum += val;
        }
      });

      return sum > 0 ? sum : Number(fallback || 0);
    },

    /**
     * Calcular média
     */
    _average(values) {
      if (!Array.isArray(values) || values.length === 0) return 0;
      const sum = values.reduce((a, b) => a + Number(b || 0), 0);
      return sum / values.length;
    },

    /**
     * Calcular percentual
     */
    _percentage(value, total) {
      if (total === 0) return 0;
      return (value / total) * 100;
    },

    /**
     * Formatar número para exibição
     */
    _formatNumber(value, decimals = 2) {
      return Number(value || 0).toFixed(decimals).replace('.', ',');
    },

    /**
     * Debug: retornar estado
     */
    debug() {
      return {
        name: 'KPIEngine',
        methods: [
          'calculate',
          'calculateGlobalTotals',
          'summarizeElements',
          'calculateByGroup',
          'findMaxByProperty',
          'findMinByProperty',
          'groupBy',
          'distributionByStorey'
        ]
      };
    }
  };
})();

// Exportar para global
window.KPIEngine = KPIEngine;
