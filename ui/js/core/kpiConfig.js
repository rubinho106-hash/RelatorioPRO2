'use strict';

// =============================================================================
// KPIConfig — Gerencia quais KPI cards são visíveis no painel de elemento
// =============================================================================

const KPIConfig = (() => {
  const STORAGE_KEY = 'relatorio_pro_kpi_config';

  const CARDS = [
    { key: 'elemento',    label: 'Elemento Selecionado', default: true },
    { key: 'tag',         label: 'TAG',                  default: true },
    { key: 'ifc',         label: 'IFC',                  default: true },
    { key: 'pavimento',   label: 'Pavimento',            default: true },
    { key: 'comprimento', label: 'Comprimento',          default: true },
    { key: 'area',        label: 'Área',                 default: true },
    { key: 'volume',      label: 'Volume',               default: true },
    { key: 'custo',       label: 'Custo',                default: true },
    { key: 'peso',        label: 'Peso',                 default: true },
  ];

  let _state = null;

  const _load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        _state = parsed;
        return;
      }
    } catch (_) {}
    _state = {};
    CARDS.forEach(c => { _state[c.key] = c.default; });
  };

  const _save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); } catch (_) {}
  };

  const _ensure = () => { if (!_state) _load(); };

  const isVisible = (key) => {
    _ensure();
    return _state[key] !== false;
  };

  const toggle = (key, value) => {
    _ensure();
    _state[key] = value;
    _save();
    if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
      RenderManager.renderAll();
    }
  };

  const getAll = () => {
    _ensure();
    return CARDS.map(c => ({ ...c, visible: _state[c.key] !== false }));
  };

  const renderPanel = () => {
    const container = document.getElementById('kpiConfigPanel');
    if (!container) return;
    _ensure();

    const items = CARDS.map(c => {
      const checked = _state[c.key] !== false ? 'checked' : '';
      return `
        <label class="kpi-cfg-item">
          <input type="checkbox" data-kpi-key="${c.key}" ${checked}>
          <span>${c.label}</span>
        </label>`;
    }).join('');

    container.innerHTML = `
      <div class="kpi-cfg-header">
        <span>KPI Cards</span>
        <button class="kpi-cfg-close" id="kpiConfigClose">&#10005;</button>
      </div>
      <div class="kpi-cfg-list">${items}</div>`;

    container.querySelectorAll('input[data-kpi-key]').forEach(input => {
      input.addEventListener('change', (e) => {
        toggle(e.target.dataset.kpiKey, e.target.checked);
      });
    });

    document.getElementById('kpiConfigClose').addEventListener('click', () => {
      container.classList.remove('kpi-cfg-open');
    });
  };

  const openPanel = () => {
    const panel = document.getElementById('kpiConfigPanel');
    if (!panel) return;
    renderPanel();
    panel.classList.add('kpi-cfg-open');
  };

  return { isVisible, toggle, getAll, openPanel, renderPanel };
})();

window.KPIConfig = KPIConfig;
