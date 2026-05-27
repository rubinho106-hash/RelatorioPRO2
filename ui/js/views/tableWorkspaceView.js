// tableWorkspaceView.js
// View do workspace para modo tabela (grid, grouping, inspector)

// tableWorkspaceView.js — Orchestrator da view central do modo tabela
// Responsável por organizar header, semantic table, inspector e toolbar

export const tableWorkspaceView = {
    /**
     * Renderiza a view do workspace em modo tabela
     * @param {Object} renderContext
     * @returns {string} HTML
     */
    render(renderContext) {
        // Header semântico
        let headerHTML = '';
        if (window.buildWorkspaceHeaderViewModel && window.workspaceHeaderRenderer) {
            const headerVM = window.buildWorkspaceHeaderViewModel(renderContext);
            headerHTML = window.workspaceHeaderRenderer.renderWorkspaceHeader(headerVM);
        }

        // Toolbar contextual (placeholder, pode evoluir para renderer próprio)
        const toolbarHTML = `<div class="workspace-toolbar">[Toolbar contextual aqui]</div>`;

        // Semantic Table (placeholder: usar renderer futuro)
        let tableHTML = '';
        if (window.semanticTableRenderer) {
            tableHTML = window.semanticTableRenderer.renderSemanticTable(renderContext);
        } else {
            tableHTML = `<div class="semantic-table">[Tabela semântica aqui]</div>`;
        }

        // Inspector contextual (placeholder: usar renderer futuro)
        let inspectorHTML = '';
        if (window.semanticInspectorRenderer) {
            inspectorHTML = window.semanticInspectorRenderer.renderSemanticInspector(
                renderContext.schema,
                renderContext.inspector || {}
            );
        } else {
            inspectorHTML = `<div class="inspector-panel">[Inspector integrado aqui]</div>`;
        }

        // Layout semanticamente separado
        return `
      <div class="table-workspace-view">
        <div class="workspace-header-row">${headerHTML}</div>
        ${toolbarHTML}
        <div class="workspace-main-row">
          <div class="workspace-table-area">${tableHTML}</div>
          <div class="workspace-inspector-area">${inspectorHTML}</div>
        </div>
      </div>
    `;
    }
};
