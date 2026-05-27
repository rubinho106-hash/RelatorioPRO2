// queryWorkspaceView.js
// View do workspace para modo busca/consulta (search, aggregations, results)

export const queryWorkspaceView = {
    /**
     * Renderiza a view de busca/consulta
     * @param {Object} renderContext
     * @returns {string} HTML
     */
    render(renderContext) {
        // Exemplo: busca e resultados (placeholder)
        return `
      <div class="query-view">
        <div class="search-panel">[Busca semântica aqui]</div>
        <div class="results-panel">[Resultados e agregações aqui]</div>
      </div>
    `;
    }
};
