// workspaceHeaderRenderer.js — Semantic Workspace Header System
// Cria header hierárquico, contextual e semantic-driven para o centro do workspace BIM
// Consome apenas viewModel derivado de renderContext

function renderWorkspaceHeader(viewModel) {
    // viewModel: { mode, global, currentTag, currentElement, chips, icon, metrics, hierarchy }
    if (!viewModel) return '';

    // Hierarchy: GLOBAL > TAG > ELEMENT
    const hierarchy = viewModel.hierarchy || [];
    const chips = (viewModel.chips || []).map(renderHeaderChip).join('');
    const metrics = (viewModel.metrics || []).map(renderHeaderMetric).join('');

    return `
    <div class="workspace-header">
      <nav class="workspace-breadcrumb">
        ${hierarchy.map(renderHeaderCrumb).join('<span class="breadcrumb-sep">/</span>')}
      </nav>
      <div class="workspace-header-chips">
        ${chips}
      </div>
      <div class="workspace-header-metrics">
        ${metrics}
      </div>
    </div>
  `;
}

function renderHeaderCrumb(crumb, idx, arr) {
    // crumb: { label, icon, emphasis, type }
    const icon = crumb.icon ? `<span class="crumb-icon">${crumb.icon}</span>` : '';
    let cls = 'crumb';
    if (crumb.type) cls += ' crumb-' + crumb.type;
    if (crumb.emphasis) cls += ' crumb-' + crumb.emphasis;
    return `<span class="${cls}">${icon}<span class="crumb-label">${crumb.label}</span></span>`;
}

function renderHeaderChip(chip) {
    // chip: { label, type, icon }
    const icon = chip.icon ? `<span class="chip-icon">${chip.icon}</span>` : '';
    let cls = 'header-chip';
    if (chip.type) cls += ' chip-' + chip.type;
    return `<span class="${cls}">${icon}${chip.label}</span>`;
}

function renderHeaderMetric(metric) {
    // metric: { label, value, unit, icon }
    const icon = metric.icon ? `<span class="metric-icon">${metric.icon}</span>` : '';
    return `<span class="header-metric">${icon}<span class="metric-label">${metric.label}</span><span class="metric-value">${metric.value}</span>${metric.unit ? `<span class="metric-unit">${metric.unit}</span>` : ''}</span>`;
}

// Export principal
window.workspaceHeaderRenderer = {
    renderWorkspaceHeader,
    renderHeaderCrumb,
    renderHeaderChip,
    renderHeaderMetric
};
