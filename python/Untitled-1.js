// Exemplo de integração progressiva no runtime do painel

function renderInspectorPanel({ schemaGroups, tableState, runtimeFlags }) {
    const useSemantic = runtimeFlags && runtimeFlags.semanticInspector;
    const selectColumns = document.getElementById('selectColumns');
    if (!selectColumns) return;

    if (useSemantic) {
        // Novo renderer declarativo
        selectColumns.innerHTML = renderSemanticInspector(
            schemaGroups,
            tableState.visibleFields,
            tableState.checkedFields
        );
    } else {
        // Renderer procedural legado (mantém fallback)
        renderLegacyColumns(tableState);
    }
}

// Exemplo de uso:
const runtimeFlags = { semanticInspector: true }; // Ative/desative aqui!
renderInspectorPanel({
    schemaGroups: FIELD_GROUPS,
    tableState: {
        visibleFields: ['len_x', 'area', 'volume', 'ifc', 'price', 'quantity', 'total'],
        checkedFields: ['area', 'volume']
    },
    runtimeFlags
});