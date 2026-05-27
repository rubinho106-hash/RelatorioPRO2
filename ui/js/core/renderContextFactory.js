// ui/js/core/renderContextFactory.js
// Núcleo de orquestração semântica: fonte única de contexto para toda a UI
// Não renderiza, não acessa DOM, não dispara eventos
// Apenas agrega, normaliza e resolve contexto para presentation layer

/**
 * Constrói o renderContext formalizado para toda a UI.
 * @param {Object} params - { runtime, states, schema, metrics }
 * @returns {Object} renderContext - snapshot imutável do contexto de orquestração
 */
export function buildRenderContext({ runtime, states, schema, metrics }) {
    // Resolver modo atual (global, tag, element)
    const workspace = resolveWorkspaceContext(states);

    // Normalizar navigation
    const navigation = {
        tag: workspace.activeTag ? { name: workspace.activeTag, label: workspace.activeTag } : null
    };

    // Normalizar seleção
    const selection = {
        element: workspace.activeElement ? {
            name: workspace.activeElementLabel,
            type: workspace.activeElementType,
            ...workspace.activeElementMeta
        } : null
    };

    // Layout, inspector, table, etc (pode ser expandido)
    const layout = states.layout || {};
    const inspector = states.inspector || {};
    const table = states.table || {};

    // Métricas (já agregadas)
    const contextMetrics = metrics || {};

    // Diagnóstico de renderização
    const diagnostics = {
        renderer: 'workspace',
        mode: workspace.mode,
        timestamp: Date.now()
    };

    // Feature flags
    const flags = runtime?.flags || {};

    // Snapshot imutável
    return Object.freeze({
        workspace,
        navigation,
        selection,
        layout,
        inspector,
        table,
        schema,
        metrics: contextMetrics,
        diagnostics,
        flags,
        timestamp: diagnostics.timestamp
    });
}

/**
 * Resolve o contexto semântico do workspace (modo, hierarquia, ativos, métricas)
 * @param {Object} states - estados agregados (AppState, tableState, etc)
 * @returns {Object} workspaceContext
 */
export function resolveWorkspaceContext(states) {
    // Exemplo: pode ser expandido conforme arquitetura
    const mode = states.mode || (states.currentElement ? 'element' : (states.currentTag ? 'tag' : 'global'));
    const activeTag = states.currentTag || null;
    const activeElement = states.currentElement || null;
    const activeElementLabel = states.currentElementLabel || null;
    const activeElementType = states.currentElementType || null;
    const activeElementMeta = states.currentElementMeta || {};
    // Hierarquia (breadcrumbs)
    const hierarchy = [];
    hierarchy.push({ type: 'global', label: 'GLOBAL', icon: 'grid' });
    if (activeTag) hierarchy.push({ type: 'tag', label: activeTag, icon: 'layers' });
    if (activeElement) hierarchy.push({ type: 'element', label: activeElementLabel, icon: 'cube' });
    // Métricas (pode ser expandido)
    const metrics = states.metrics || {};
    return {
        mode,
        hierarchy,
        activeTag,
        activeElement,
        activeElementLabel,
        activeElementType,
        activeElementMeta,
        metrics
    };
}
