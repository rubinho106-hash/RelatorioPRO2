// emptyWorkspaceView.js
// View fallback para estados vazios ou desconhecidos

export const emptyWorkspaceView = {
    /**
     * Renderiza view vazia ou fallback
     * @param {Object} renderContext
     * @returns {string} HTML
     */
    render(renderContext) {
        return `<div class="empty-view">Nenhum conteúdo disponível para este contexto.</div>`;
    }
};
