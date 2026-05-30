// =============================================================================
// KPI Cards Module — Dynamic Schema-driven Widgets
// =============================================================================

'use strict';

const KPICardsModule = (() => {
  const _normalize = (raw) => String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .trim();

  const _renderCards = (container, cards, emptyMessage) => {
    const html = (cards || [])
      .map((card) => {
        const meta = card.meta ? '<span class="meta">' + card.meta + '</span>' : '';
        return '<div class="summary-card"><h4>' + card.title + '</h4><p>' + card.value + '</p>' + meta + '</div>';
      })
      .join('');

    container.innerHTML = html || '<div class="rp-empty-state">' + (emptyMessage || 'Nenhum campo selecionado no Data View.') + '</div>';
  };

  const _fieldMeta = (fieldKey) => {
    if (!window.BIMSchemaRegistry || typeof window.BIMSchemaRegistry.getField !== 'function') {
      return null;
    }
    const resolved = typeof window.BIMSchemaRegistry.resolveFieldKey === 'function'
      ? window.BIMSchemaRegistry.resolveFieldKey(fieldKey)
      : fieldKey;
    return window.BIMSchemaRegistry.getField(resolved || fieldKey);
  };

  const _schemaLabel = (fieldKey) => {
    const meta = _fieldMeta(fieldKey);
    if (meta && meta.label) { return String(meta.label); }
    if (typeof window.getColumnDisplayLabel === 'function') {
      return String(window.getColumnDisplayLabel(fieldKey) || fieldKey);
    }
    return String(fieldKey || 'Campo');
  };

  const _visibleFields = () => {
    if (!window.BIMDataView || typeof window.BIMDataView.getVisibleColumns !== 'function') {
      return [];
    }

    // Apenas campos sem qualquer valor visual (id interno) sao ocultos
    const blocked = new Set(['id', 'selection', 'in_model']);

    return window.BIMDataView.getVisibleColumns()
      .map((key) => String(key || '').trim())
      .filter((key) => key && !blocked.has(_normalize(key)))
      .map((key) => {
        if (window.BIMSchemaRegistry && typeof window.BIMSchemaRegistry.resolveFieldKey === 'function') {
          return window.BIMSchemaRegistry.resolveFieldKey(key) || key;
        }
        return key;
      })
      .filter((key, index, arr) => arr.indexOf(key) === index);
  };

  const _fieldAliases = {
    nome: ['instance', 'nome', 'name', 'entity', 'description'],
    ifc: ['ifc', 'ifc_type', 'ifcclass', 'ifc_class', 'ifc_tipo'],
    tag: ['tag'],
    pavimento: ['storey', 'pavimento'],
    quantidade: ['quantidade', 'quantity'],
    area: ['area_total', 'area', 'area_xy', 'area_xz'],
    volume: ['volume_total', 'volume'],
    comprimento: ['metro_linear_total', 'comprimento', 'metro_linear', 'len_xyz', 'len_x', 'len_y', 'len_z', 'len_xy', 'len_xz'],
    peso: ['peso', 'weight', 'slab_weight_total_kg', 'slab_weight_kg', 'size'],
    custo: ['total', 'price', 'custo', 'concrete_cost_total', 'eps_cost_total', 'concrete_cost', 'eps_cost'],
    fire_rating: ['fire_rating', 'firerating', 'fire_rating_value', 'bim_ifc_fire_rating']
  };

  const _candidateKeys = (fieldKey) => {
    const normalized = _normalize(fieldKey);
    const base = [String(fieldKey || '')].filter(Boolean);

    Object.keys(_fieldAliases).forEach((bucket) => {
      const aliases = _fieldAliases[bucket] || [];
      if (normalized === bucket || aliases.some((alias) => _normalize(alias) === normalized)) {
        base.push(...aliases);
      }
    });

    return Array.from(new Set(base.filter(Boolean)));
  };

  const _getFieldValue = (row, fieldKey) => {
    if (!row || !fieldKey) { return null; }
    const candidates = _candidateKeys(fieldKey);

    for (let i = 0; i < candidates.length; i += 1) {
      const key = candidates[i];
      if (Object.prototype.hasOwnProperty.call(row, key) && row[key] !== null && row[key] !== undefined && row[key] !== '') {
        return row[key];
      }
    }

    const wanted = _normalize(fieldKey);
    const rowKeys = Object.keys(row);
    for (let i = 0; i < rowKeys.length; i += 1) {
      const key = rowKeys[i];
      if (_normalize(key) === wanted && row[key] !== null && row[key] !== undefined && row[key] !== '') {
        return row[key];
      }
    }

    return null;
  };

  const _parseNumber = (value) => {
    if (typeof value === 'number') { return Number.isFinite(value) ? value : NaN; }
    if (typeof value !== 'string') { return Number(value); }

    const trimmed = value.trim();
    if (!trimmed) { return NaN; }

    const normalized = trimmed
      .replace(/\s+/g, '')
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(/,(?=\d{3}(\D|$))/g, '')
      .replace(',', '.');

    return Number(normalized);
  };

  const _unitForField = (fieldKey) => {
    const meta = _fieldMeta(fieldKey);
    if (meta && meta.unit) { return ' ' + String(meta.unit); }

    const key = _normalize(fieldKey);
    if (key.indexOf('area') >= 0) { return ' m²'; }
    if (key.indexOf('volume') >= 0) { return ' m³'; }
    if (key.indexOf('comprimento') >= 0 || key.indexOf('metro_linear') >= 0 || key.indexOf('len_') === 0) { return ' m'; }
    if (key.indexOf('peso') >= 0 || key.indexOf('weight') >= 0) { return ' kg'; }
    if (key.indexOf('price') >= 0 || key.indexOf('custo') >= 0 || key === 'total') { return ' R$'; }
    return '';
  };

  const _formatNumber = (value, precision) => {
    return Number(value || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision
    });
  };

  const _isMostlyNumeric = (values) => {
    if (!values || values.length === 0) { return false; }
    const numericCount = values
      .map((v) => _parseNumber(v))
      .filter((n) => Number.isFinite(n))
      .length;
    return numericCount > 0 && (numericCount / values.length) >= 0.65;
  };

  const _buildNumericCard = (title, fieldKey, values) => {
    const numeric = values
      .map((v) => _parseNumber(v))
      .filter((n) => Number.isFinite(n));
    if (numeric.length === 0) { return null; }

    const meta = _fieldMeta(fieldKey);
    const canAggregate = meta ? meta.aggregatable !== false : true;
    const sum = numeric.reduce((acc, n) => acc + n, 0);
    const avg = sum / numeric.length;
    const unit = _unitForField(fieldKey);
    const isCurrency = unit.trim().toUpperCase() === 'R$';

    const displayValue = canAggregate
      ? (isCurrency ? ('R$ ' + _formatNumber(sum, 2)) : (_formatNumber(sum, Math.abs(sum) >= 1000 ? 0 : 2) + unit))
      : (isCurrency ? ('R$ ' + _formatNumber(avg, 2)) : (_formatNumber(avg, 2) + unit));

    return {
      title: title,
      value: displayValue,
      meta: (canAggregate ? 'soma' : 'media') + ': ' + (isCurrency ? ('R$ ' + _formatNumber(avg, 2)) : (_formatNumber(avg, 2) + unit)) + ' • n=' + numeric.length
    };
  };

  const _buildCategoricalCard = (title, values) => {
    if (!values || values.length === 0) { return null; }

    const freq = new Map();
    values.forEach((v) => {
      const label = String(v || '').trim() || '-';
      freq.set(label, (freq.get(label) || 0) + 1);
    });

    let topValue = '-';
    let topCount = 0;
    freq.forEach((count, label) => {
      if (count > topCount) {
        topValue = label;
        topCount = count;
      }
    });

    return {
      title: title,
      value: topValue,
      meta: topCount + ' de ' + values.length + ' ocorrência(s)'
    };
  };

  const _buildEmptyCard = (title) => {
    return {
      title: title,
      value: '—',
      meta: 'sem dados disponiveis'
    };
  };

  const _buildFieldCard = (fieldKey, rows) => {
    const values = (rows || [])
      .map((row) => _getFieldValue(row, fieldKey))
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '');

    const title = _schemaLabel(fieldKey);
    if (values.length === 0) { return _buildEmptyCard(title); }

    if (_isMostlyNumeric(values)) {
      return _buildNumericCard(title, fieldKey, values);
    }

    return _buildCategoricalCard(title, values);
  };

  const _buildContextCard = (mode, rows, state) => {
    const modeLabel = mode === 'element' ? 'ELEMENTO' : (mode === 'tag' ? 'TAG' : 'GLOBAL');
    const contextLabel = mode === 'tag'
      ? ('Contexto: ' + String(state.currentTag || '-'))
      : (mode === 'element' ? 'Contexto: Elemento' : 'Contexto: Projeto');

    return {
      title: contextLabel,
      value: rows.length + ' registro(s)',
      meta: 'modo ' + modeLabel
    };
  };

  const _getElementKey = (row) => {
    if (!row) { return ''; }
    return String(row.persistent_id || row.highlight_id || row.id || '').trim();
  };

  const _getAllTagElements = () => {
    if (!window.tagModel) { return []; }
    return Object.keys(window.tagModel).reduce(function (acc, tag) {
      const group = window.tagModel[tag] || {};
      const elements = Array.isArray(group.elementos) ? group.elementos : [];
      return acc.concat(elements);
    }, []);
  };

  const _findElementByKey = (key) => {
    const wanted = String(key || '').trim();
    if (!wanted) { return null; }

    const all = _getAllTagElements();
    for (let i = 0; i < all.length; i += 1) {
      if (_getElementKey(all[i]) === wanted) {
        return all[i];
      }
    }
    return null;
  };

  const _getTagElementsByFilter = (group, storeyFilter) => {
    const elements = Array.isArray(group && group.elementos) ? group.elementos : [];
    if (!storeyFilter) { return elements; }
    return elements.filter((row) => String((row && (row.storey || row.pavimento)) || '') === storeyFilter);
  };

  const _rowsForMode = (state, mode) => {
    if (mode === 'element') {
      const element = _findElementByKey(state.currentElement);
      return element ? [element] : [];
    }

    if (mode === 'tag') {
      const group = (window.tagModel || {})[state.currentTag] || null;
      if (!group) { return []; }
      const storeyFilter = state && state.filters ? state.filters.storey : state.storey;
      return _getTagElementsByFilter(group, storeyFilter);
    }

    return _getAllTagElements();
  };

  const _renderDynamicBySchema = (state, container) => {
    const mode = state.currentElement ? 'element' : (state.currentTag ? 'tag' : 'global');
    const rows = _rowsForMode(state, mode);

    if (rows.length === 0) {
      _renderCards(container, [], 'Sem dados para o contexto selecionado.');
      return;
    }

    const fields = _visibleFields();
    if (fields.length === 0) {
      _renderCards(container, [], 'Nenhum campo visível no Data View.');
      return;
    }

    const cards = [_buildContextCard(mode, rows, state)];

    fields.forEach((fieldKey) => {
      const card = _buildFieldCard(fieldKey, rows);
      if (card) {
        cards.push(card);
      }
    });

    _renderCards(container, cards, 'Nenhum widget disponível para os campos selecionados.');
  };

  const render = (state) => {
    const container = document.getElementById('globalSummary');
    if (!container) { return; }
    _renderDynamicBySchema(state || {}, container);
  };

  return {
    render: render,
    debug() {
      return { module: 'KPICardsModule', version: '2.0' };
    }
  };
})();

window.KPICardsModule = KPICardsModule;
