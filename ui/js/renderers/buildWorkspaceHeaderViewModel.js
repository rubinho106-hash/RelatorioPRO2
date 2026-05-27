// ui/js/renderers/buildWorkspaceHeaderViewModel.js
// Header ViewModel Builder para workspaceHeaderRenderer.js
// Transforma renderContext em viewModel semântico, pronto para apresentação

/**
 * Constrói o viewModel do header a partir do renderContext orquestrado.
 * @param {Object} renderContext - Contexto orquestrado da UI (navigation, selection, layout, inspector, table, schema, metrics)
 * @returns {Object} viewModel - Estrutura semântica para o header
 */
export function buildWorkspaceHeaderViewModel(renderContext) {
    const { navigation, selection, schema, metrics } = renderContext;

    // Deriva o modo atual (ex: 'global', 'tag', 'element')
    const mode = deriveMode(navigation, selection);

    // Hierarquia semântica (breadcrumbs)
    const hierarchy = buildWorkspaceHierarchy(navigation, selection, schema);

    // Chips contextuais
    const chips = buildWorkspaceChips({ mode, navigation, selection, schema, metrics });

    // Métricas principais
    const headerMetrics = buildWorkspaceMetrics({ mode, selection, metrics });

    return {
        mode,
        hierarchy,
        chips,
        metrics: headerMetrics
    };
}

// Factory: Deriva o modo do header
function deriveMode(navigation, selection) {
    if (selection?.element) return 'element';
    if (navigation?.tag) return 'tag';
    return 'global';
}

// Factory: Hierarquia semântica (breadcrumbs)
function buildWorkspaceHierarchy(navigation, selection, schema) {
    const hierarchy = [];
    // Global
    hierarchy.push({ type: 'global', label: 'GLOBAL', icon: 'grid' });
    // Tag
    if (navigation?.tag) {
        hierarchy.push({ type: 'tag', label: navigation.tag.label || navigation.tag.name, icon: 'layers' });
    }
    // Elemento
    if (selection?.element) {
        const el = selection.element;
        hierarchy.push({ type: 'element', label: el.label || el.name, icon: 'cube' });
    }
    return hierarchy;
}

// Factory: Chips contextuais
function buildWorkspaceChips({ mode, navigation, selection, schema, metrics }) {
    const chips = [];
    if (mode === 'global') {
        chips.push({ type: 'model', label: 'Modelo' });
        if (metrics?.count) chips.push({ type: 'count', label: `${metrics.count} elementos` });
    } else if (mode === 'tag') {
        chips.push({ type: 'ifc', label: 'IFC' });
        if (selection?.count) chips.push({ type: 'count', label: `${selection.count} ${navigation.tag?.label || 'itens'}` });
        if (navigation.tag?.material) chips.push({ type: 'material', label: navigation.tag.material });
    } else if (mode === 'element') {
        if (selection?.element?.type) chips.push({ type: 'ifc', label: selection.element.type });
        if (selection?.element?.length) chips.push({ type: 'length', label: `${selection.element.length}m` });
        if (selection?.element?.category) chips.push({ type: 'category', label: selection.element.category });
    }
    return chips;
}

// Factory: Métricas principais
function buildWorkspaceMetrics({ mode, selection, metrics }) {
    if (mode === 'element' && selection?.element) {
        return {
            count: 1,
            volume: selection.element.volume || null
        };
    }
    return {
        count: metrics?.count || 0,
        volume: metrics?.volume || null
    };
}
