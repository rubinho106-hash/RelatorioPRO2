// semanticInspectorRenderer.js — Renderer declarativo do painel "CAMPOS BIM"
// Consome apenas SchemaRegistry + renderContext. Não depende de EventBus, DOM ou runtime procedural.

function isFieldVisible(field, context) {
    // Centraliza lógica de visibilidade (futuro: permissions, presets, etc)
    return context.visibleFields.includes(field.key);
}

function renderEmptyState(context) {
    // i18n: use context.i18n ou fallback
    const msg = (context.i18n && context.i18n.t) ? context.i18n.t('emptyInspector') : 'Selecione campos BIM para montar sua visualização.';
    return `
    <div class="empty-state">
      <div class="empty-icon">📐</div>
      ${msg}
    </div>
  `;
}

function renderFieldChip(chip) {
    return `<div class="field-chip">${chip}</div>`;
}

function renderFieldChips(field, context) {
    // Suporte a múltiplos chips por campo (unit, type, meta, etc)
    const chips = [];
    if (field.chip && context.showChips !== false) chips.push(renderFieldChip(field.chip));
    if (field.unit && context.showChips !== false) chips.push(renderFieldChip(field.unit));
    if (field.type && context.showChips !== false) chips.push(renderFieldChip(field.type));
    // Adicione outros chips semânticos conforme necessário
    return chips.join('');
}

function renderFieldRow(field, context) {
    const checked = context.checkedFields && context.checkedFields.includes(field.key);
    const active = context.activeField && context.activeField === field.key;
    return `
    <div class="field-row${active ? ' active' : ''}">
      <input type="checkbox" class="field-checkbox" ${checked ? 'checked' : ''} />
      <div class="field-content">
        <div class="field-label">${field.label}</div>
        ${(context.showMeta !== false && field.description) ? `<div class="field-meta">${field.description}</div>` : ''}
      </div>
      <div class="field-chips">
        ${renderFieldChips(field, context)}
      </div>
    </div>
  `;
}

function renderFieldHeader(group, context) {
    return `
    <div class="field-group-header">
      <div class="field-group-title">${group.title}</div>
      <div class="field-group-count">${group.fields.length}</div>
    </div>
  `;
}

function renderFieldGroup(group, context) {
    const rows = group.fields
        .filter(field => isFieldVisible(field, context))
        .map(field => renderFieldRow(field, context))
        .join('');
    if (!rows) return '';
    return `
    <div class="field-group ${group.class}">
      ${renderFieldHeader(group, context)}
      <div class="field-group-body">
        ${rows}
      </div>
    </div>
  `;
}

function renderSemanticInspector(schemaGroups, context) {
    const groupsHtml = schemaGroups
        .map(group => renderFieldGroup(group, context))
        .join('');
    return groupsHtml || renderEmptyState(context);
}

// Export principal
window.semanticInspectorRenderer = {
    renderSemanticInspector,
    renderFieldGroup,
    renderFieldRow,
    renderFieldChip,
    renderEmptyState,
    isFieldVisible
};
