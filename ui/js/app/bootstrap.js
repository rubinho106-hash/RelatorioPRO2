// bootstrap.js
// Responsável por inicializar a aplicação, carregar estados iniciais e orquestrar o ciclo de vida principal.


// Inicialização principal da aplicação RelatorioPRO
export async function initializeApp() {
    initializeDesignSystem();
    initializeState();
    initializeBridge();
    initializeRuntime();
    initializeLifecycle();
    initializeRenderPipeline();
    initializeUI();
    initializeLegacyCompatibility();
}

function initializeDesignSystem() {
    // TODO: Carregar tokens, CSS, temas, etc.
}


import { SelectionState } from '../state/selectionState.js';
import { layoutState } from '../state/layoutState.js';
import { queryState } from '../state/queryState.js';

function initializeState() {
    // Serviço unificado de snapshots de estado
    Runtime.services.stateSnapshots = {
        version: '1.0.0',
        saveWorkspace() {
            return {
                selection: Runtime.state.selection?.getSnapshot ? Runtime.state.selection.getSnapshot() : {},
                layout: Runtime.state.layout?.getSnapshot ? Runtime.state.layout.getSnapshot() : {},
                query: Runtime.state.query?.getSnapshot ? Runtime.state.query.getSnapshot() : {},
                table: Runtime.state.table?.getSnapshot ? Runtime.state.table.getSnapshot() : {},
                timestamp: Date.now(),
                version: '1.0.0'
            };
        },
        restoreWorkspace(snapshot) {
            if (!snapshot || typeof snapshot !== 'object') return;
            if (snapshot.selection && Runtime.state.selection?.restoreSnapshot) {
                Runtime.state.selection.restoreSnapshot(snapshot.selection);
            }
            if (snapshot.layout && Runtime.state.layout?.restoreSnapshot) {
                Runtime.state.layout.restoreSnapshot(snapshot.layout);
            }
            if (snapshot.query && Runtime.state.query?.restoreSnapshot) {
                Runtime.state.query.restoreSnapshot(snapshot.query);
            }
            if (snapshot.table && Runtime.state.table?.restoreSnapshot) {
                Runtime.state.table.restoreSnapshot(snapshot.table);
            }
        },
        clearWorkspace() {
            if (Runtime.state.selection?.clear) Runtime.state.selection.clear();
            if (Runtime.state.layout?.restoreSnapshot) Runtime.state.layout.restoreSnapshot({});
            if (Runtime.state.query?.clearQuery) Runtime.state.query.clearQuery();
            if (Runtime.state.table?.restoreSnapshot) Runtime.state.table.restoreSnapshot({});
        },
        exportWorkspace() {
            const snapshot = this.saveWorkspace();
            return JSON.stringify(snapshot, null, 2);
        },
        importWorkspace(data) {
            let snapshot = null;
            if (typeof data === 'string') {
                try { snapshot = JSON.parse(data); } catch (e) { return; }
            } else if (typeof data === 'object') {
                snapshot = data;
            }
            if (snapshot) this.restoreWorkspace(snapshot);
        }
    };
    const { Runtime } = window;
    if (!Runtime) {
        console.error('[Bootstrap] Runtime não encontrado para state!');
        return;
    }

    // Registrar selectionState como núcleo oficial
    Runtime.register('state.selection', SelectionState);
    if (!Runtime.state) Runtime.state = {};
    Runtime.state.selection = SelectionState;

    // Serviço de snapshots de seleção
    if (!Runtime.services) Runtime.services = {};
    Runtime.services.selectionSnapshots = [];

    // Listener oficial para eventos de seleção
    if (Runtime.eventBus?.on) {
        Runtime.eventBus.on('selection:changed', (payload) => {
            Runtime.diagnostics?.trace?.('selection:changed', payload);
            // Salva snapshot
            Runtime.services.selectionSnapshots.push({
                ...payload,
                snapshot: SelectionState.getSnapshot(),
                timestamp: Date.now()
            });
            // Sincronização híbrida temporária (garante globals para wrappers antigos)
            window.currentTag = SelectionState.getState().currentTag;
            window.currentElement = SelectionState.getState().currentElement;
            window.currentSelection = [...SelectionState.getState().currentSelection];
        });
    }

    // Registrar layoutState como núcleo oficial
    Runtime.register('state.layout', layoutState);
    Runtime.state.layout = layoutState;

    // Serviço de snapshots de layout
    if (!Runtime.services.layoutSnapshots) Runtime.services.layoutSnapshots = [];

    // Listener oficial para eventos de layout
    if (Runtime.eventBus?.on) {
        Runtime.eventBus.on('layout:changed', (payload) => {
            Runtime.diagnostics?.trace?.('layout:changed', payload);
            // Salva snapshot
            Runtime.services.layoutSnapshots.push({
                ...payload,
                snapshot: layoutState.getSnapshot(),
                timestamp: Date.now()
            });
        });
    }

    // Registrar queryState como núcleo oficial
    Runtime.register('state.query', queryState);
    Runtime.state.query = queryState;

    // Serviço de snapshots de query
    if (!Runtime.services.querySnapshots) Runtime.services.querySnapshots = [];

    // Listener oficial para eventos de query
    if (Runtime.eventBus?.on) {
        Runtime.eventBus.on('query:changed', (payload) => {
            Runtime.diagnostics?.trace?.('query:changed', payload);
            // Salva snapshot
            Runtime.services.querySnapshots.push({
                ...payload,
                snapshot: queryState.getSnapshot(),
                timestamp: Date.now()
            });
        });
    }

    // Registrar tableState como núcleo oficial
    Runtime.register('state.table', tableState);
    Runtime.state.table = tableState;

    // Serviço de snapshots de tabela
    if (!Runtime.services.tableSnapshots) Runtime.services.tableSnapshots = [];

    // Listener oficial para eventos de tabela
    if (Runtime.eventBus?.on) {
        Runtime.eventBus.on('table:changed', (payload) => {
            Runtime.diagnostics?.trace?.('table:changed', payload);
            // Salva snapshot
            Runtime.services.tableSnapshots.push({
                ...payload,
                snapshot: tableState.getSnapshot(),
                timestamp: Date.now()
            });
        });
    }
}

function initializeBridge() {
    // TODO: Inicializar Bridge e bridges auxiliares
}

function initializeRuntime() {
    // Referências explícitas dos módulos globais/legados
    const { Runtime } = window;
    if (!Runtime) {
        console.error('[Bootstrap] Runtime não encontrado!');
        return;
    }

    // EventBus
    Runtime.eventBus = window.EventBus || null;
    Runtime.register('eventBus', Runtime.eventBus);
    Runtime.diagnostics.trace('runtime:init', { module: 'eventBus', value: !!Runtime.eventBus });

    // SchemaRegistry
    Runtime.schema = window.BIMSchemaRegistry || null;
    Runtime.register('schema', Runtime.schema);
    Runtime.diagnostics.trace('runtime:init', { module: 'schema', value: !!Runtime.schema });

    // Bridge
    Runtime.bridge = window.Bridge || null;
    Runtime.register('bridge', Runtime.bridge);
    Runtime.diagnostics.trace('runtime:init', { module: 'bridge', value: !!Runtime.bridge });

    // State
    Runtime.state = window.AppState || {};
    Runtime.register('state', Runtime.state);
    Runtime.diagnostics.trace('runtime:init', { module: 'state', value: !!Runtime.state });

    // Layout
    Runtime.layout = window.LayoutState || {};
    Runtime.register('layout', Runtime.layout);
    Runtime.diagnostics.trace('runtime:init', { module: 'layout', value: !!Runtime.layout });

    // Render (apenas referência, sem lógica ainda)
    Runtime.render = window.RenderManager || {};
    Runtime.register('render', Runtime.render);
    Runtime.diagnostics.trace('runtime:init', { module: 'render', value: !!Runtime.render });

    // Services (placeholder)
    Runtime.services = {};
    Runtime.register('services', Runtime.services);
    Runtime.diagnostics.trace('runtime:init', { module: 'services' });

    // Lifecycle (placeholder)
    Runtime.lifecycle = {};
    Runtime.register('lifecycle', Runtime.lifecycle);
    Runtime.diagnostics.trace('runtime:init', { module: 'lifecycle' });

    // Diagnostics já existe
    Runtime.register('diagnostics', Runtime.diagnostics);

    // Modo de operação
    Runtime.mode = 'legacy-hybrid';
    Runtime.diagnostics.trace('runtime:init', { mode: Runtime.mode });
}

function initializeLifecycle() {
    // TODO: Inicializar ciclo de vida (onInit, onDataLoaded, etc)
}

function initializeRenderPipeline() {
    // TODO: Inicializar RenderManager e renderizadores
}

function initializeUI() {
    // TODO: Inicializar componentes de UI, listeners globais, etc.
}

function initializeLegacyCompatibility() {
    if (!window.Runtime) {
        console.warn('[Legacy→Runtime] Runtime ainda não inicializado. Delegação adiada.');
        return;
    }

    // Salva implementações legadas para fallback/debug
    window.RelatorioPROLegacy = {
        renderDashboard: window.renderDashboard,
        renderTag: window.renderTag,
        renderElement: window.renderElement,
        renderTabela: window.renderTabela,
        updateDashboard: window.updateDashboard,
        refreshUI: window.refreshUI,
        selectEntity: window.selectEntity
        // Adicione outros handlers legados conforme necessário
    };

    // Delegação de renderizadores
    window.renderDashboard = (...args) => {
        console.debug('[Legacy→Runtime]', 'renderDashboard');
        return window.Runtime?.render?.dashboard?.(...args);
    };
    window.renderTag = (...args) => {
        console.debug('[Legacy→Runtime]', 'renderTag');
        return window.Runtime?.render?.tag?.(...args);
    };
    window.renderElement = (...args) => {
        console.debug('[Legacy→Runtime]', 'renderElement');
        return window.Runtime?.render?.element?.(...args);
    };
    window.renderTabela = (...args) => {
        console.debug('[Legacy→Runtime]', 'renderTabela');
        return window.Runtime?.render?.table?.(...args);
    };
    window.updateDashboard = (...args) => {
        console.debug('[Legacy→Runtime]', 'updateDashboard');
        return window.Runtime?.render?.updateDashboard?.(...args);
    };
    window.refreshUI = (...args) => {
        console.debug('[Legacy→Runtime]', 'refreshUI');
        return window.Runtime?.render?.refreshUI?.(...args);
    };

    // Delegação de state (exemplo: currentTag, currentMode, currentElement)
    Object.defineProperty(window, 'currentTag', {
        get: () => window.Runtime?.state?.currentTag,
        set: (v) => window.Runtime?.state?.setCurrentTag?.(v)
    });
    Object.defineProperty(window, 'currentMode', {
        get: () => window.Runtime?.state?.currentMode,
        set: (v) => window.Runtime?.state?.setCurrentMode?.(v)
    });
    Object.defineProperty(window, 'currentElement', {
        get: () => window.Runtime?.state?.currentElement,
        set: (v) => window.Runtime?.state?.setCurrentElement?.(v)
    });

    // Delegação de bridge
    window.selectEntity = (...args) => {
        console.debug('[Legacy→Runtime]', 'selectEntity');
        return window.Runtime?.bridge?.selectEntity?.(...args);
    };
    // Adicione outras delegações de bridge conforme necessário

    // Delegação de seleção
    window.selectTag = (...args) => {
        console.debug('[Legacy→Runtime]', 'selectTag');
        return window.Runtime?.bridge?.selectTag?.(...args);
    };
}
