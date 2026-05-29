'use strict';

// =============================================================================
// KPIConfig — Configuração de campos visíveis no dashboard RelatorioPRO
// =============================================================================
// Controla quais campos aparecem nos KPI cards e na tabela.
// Estado persistido em localStorage por sessão de modelo.
// =============================================================================

const KPIConfig = (() => {
  const STORAGE_KEY = 'relatorio_pro_kpi_config_v2';

  // ── Schema completo de campos, agrupado por categoria ─────────────────────
  const GROUPS = [
    {
      id: 'coordenacao',
      label: 'Identificação e Coordenação',
      fields: [
        { key: 'ordinal',    label: '#',               default: true,  kpi: false },
        { key: 'image',      label: 'Imagem',           default: false, kpi: false },
        { key: 'entity',     label: 'Entidade',         default: true,  kpi: false },
        { key: 'definition', label: 'Definição',        default: true,  kpi: false },
        { key: 'instance',   label: 'Instância',        default: true,  kpi: true  },
        { key: 'description',label: 'Descrição',        default: false, kpi: false },
        { key: 'ifc',        label: 'Classe IFC',       default: true,  kpi: true  },
        { key: 'tag',        label: 'Etiqueta',         default: true,  kpi: true  },
        { key: 'storey',     label: 'Pavimento',        default: true,  kpi: true  },
        { key: 'status',     label: 'Estado',           default: false, kpi: false },
        { key: 'owner',      label: 'Proprietário',     default: false, kpi: false },
        { key: 'url',        label: 'Link',             default: false, kpi: false },
      ]
    },
    {
      id: 'geometria',
      label: 'Geometria e Dimensões',
      fields: [
        { key: 'len_x',              label: 'Comprimento (X)',     default: false, kpi: false },
        { key: 'len_y',              label: 'Comprimento (Y)',     default: false, kpi: false },
        { key: 'len_z',              label: 'Comprimento (Z)',     default: false, kpi: false },
        { key: 'len_xz',             label: '(X) x (Z)',          default: false, kpi: false },
        { key: 'len_xy',             label: '(X) x (Y)',          default: false, kpi: false },
        { key: 'len_xyz',            label: '(X) x (Y) x (Z)',   default: false, kpi: false },
        { key: 'area_xz',            label: 'Área (X*Z)',         default: false, kpi: false },
        { key: 'area_xy',            label: 'Área (X*Y)',         default: false, kpi: false },
        { key: 'area',               label: 'Área da face',       default: true,  kpi: true  },
        { key: 'area_projetada',     label: 'Área projetada',     default: false, kpi: false },
        { key: 'comprimento',        label: 'Comprimento',        default: true,  kpi: true  },
        { key: 'volume',             label: 'Volume',             default: true,  kpi: true  },
        { key: 'size',               label: 'Tamanho Unitário',   default: false, kpi: false },
      ]
    },
    {
      id: 'comercial',
      label: 'Orçamento e Gestão',
      fields: [
        { key: 'material',   label: 'Material',          default: false, kpi: false },
        { key: 'dynamic',    label: 'Atributo DC',       default: false, kpi: false },
        { key: 'price',      label: 'Preço Unitário',    default: false, kpi: false },
        { key: 'quantity',   label: 'Quantidade',        default: true,  kpi: false },
        { key: 'total',      label: 'Total',             default: false, kpi: false },
        { key: 'custo',      label: 'Custo',             default: true,  kpi: true  },
        { key: 'peso',       label: 'Peso',              default: true,  kpi: true  },
      ]
    }
  ];

  // Todos os campos em lista plana
  const ALL_FIELDS = GROUPS.flatMap(g => g.fields);

  // Campos que controlam os KPI cards de elemento
  const KPI_FIELDS = ALL_FIELDS.filter(f => f.kpi);

  let _state = null;

  const _load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { _state = JSON.parse(raw); return; }
    } catch (_) {}
    _state = {};
    ALL_FIELDS.forEach(f => { _state[f.key] = f.default; });
  };

  const _save = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_state)); } catch (_) {}
  };

  const _ensure = () => { if (!_state) _load(); };

  // ── API pública ────────────────────────────────────────────────────────────

  const isVisible = (key) => {
    _ensure();
    return _state[key] !== false;
  };

  // Verifica qualquer chave num array de aliases
  const isAnyVisible = (keys) => {
    _ensure();
    return (Array.isArray(keys) ? keys : [keys]).some(k => _state[k] !== false);
  };

  const toggle = (key, value) => {
    _ensure();
    _state[key] = value;
    _save();
    if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
      RenderManager.renderAll();
    }
  };

  const getGroups = () => {
    _ensure();
    return GROUPS.map(g => ({
      ...g,
      fields: g.fields.map(f => ({ ...f, visible: _state[f.key] !== false }))
    }));
  };

  // Retorna chaves de campos visíveis (para tabela e KPI)
  const getVisibleKeys = () => {
    _ensure();
    return ALL_FIELDS.filter(f => _state[f.key] !== false).map(f => f.key);
  };

  // ── Render do painel ───────────────────────────────────────────────────────

  const renderPanel = () => {
    const container = document.getElementById('kpiConfigPanel');
    if (!container) return;
    _ensure();

    const groupsHtml = GROUPS.map(g => {
      const fieldsHtml = g.fields.map(f => {
        const checked = _state[f.key] !== false ? 'checked' : '';
        const kpiBadge = f.kpi ? '<span class="kpi-cfg-badge">KPI</span>' : '';
        return `
          <label class="kpi-cfg-item">
            <input type="checkbox" data-kpi-key="${f.key}" ${checked}>
            <span class="kpi-cfg-label">${f.label}</span>
            ${kpiBadge}
          </label>`;
      }).join('');

      return `
        <div class="kpi-cfg-group">
          <div class="kpi-cfg-group-title">${g.label}</div>
          ${fieldsHtml}
        </div>`;
    }).join('');

    const selectAll = `
      <div class="kpi-cfg-actions">
        <button class="kpi-cfg-action-btn" id="kpiCfgSelectAll">Marcar todos</button>
        <button class="kpi-cfg-action-btn" id="kpiCfgClearAll">Limpar todos</button>
      </div>`;

    container.innerHTML = `
      <div class="kpi-cfg-header">
        <span>Campos</span>
        <button class="kpi-cfg-close" id="kpiConfigClose">&#10005;</button>
      </div>
      ${selectAll}
      <div class="kpi-cfg-list">${groupsHtml}</div>`;

    // Eventos checkboxes
    container.querySelectorAll('input[data-kpi-key]').forEach(input => {
      input.addEventListener('change', (e) => {
        toggle(e.target.dataset.kpiKey, e.target.checked);
      });
    });

    // Fechar
    document.getElementById('kpiConfigClose').addEventListener('click', () => {
      container.classList.remove('kpi-cfg-open');
    });

    // Marcar/limpar todos
    document.getElementById('kpiCfgSelectAll').addEventListener('click', () => {
      ALL_FIELDS.forEach(f => { _state[f.key] = true; });
      _save();
      renderPanel();
      if (typeof RenderManager !== 'undefined') RenderManager.renderAll();
    });
    document.getElementById('kpiCfgClearAll').addEventListener('click', () => {
      ALL_FIELDS.forEach(f => { _state[f.key] = false; });
      _save();
      renderPanel();
      if (typeof RenderManager !== 'undefined') RenderManager.renderAll();
    });
  };

  const openPanel = () => {
    const panel = document.getElementById('kpiConfigPanel');
    if (!panel) return;
    renderPanel();
    panel.classList.add('kpi-cfg-open');
  };

  // Implementa window.BIMDataView para KPICardsModule e DetailsModule
  const installBIMDataView = () => {
    window.BIMDataView = {
      getVisibleColumns: () => getVisibleKeys(),
      isFieldVisible: (keys) => isAnyVisible(Array.isArray(keys) ? keys : [keys]),
      notifyChanged: () => {
        if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
          RenderManager.renderAll();
        }
      }
    };
  };

  return { isVisible, isAnyVisible, toggle, getGroups, getVisibleKeys, openPanel, renderPanel, installBIMDataView };
})();

window.KPIConfig = KPIConfig;

// Instala imediatamente
KPIConfig.installBIMDataView();

// info.js sobrescreve BIMDataView no script load (linha 424). Reinstala depois
// do DOMContentLoaded para garantir que KPIConfig vence a corrida.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    KPIConfig.installBIMDataView();
    if (typeof RenderManager !== 'undefined' && RenderManager.renderAll) {
      RenderManager.renderAll();
    }
  });
} else {
  KPIConfig.installBIMDataView();
}
