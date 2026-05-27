// ui/js/state/layoutState.js
// Formal layout state module — puro, imutável, event-driven, sem DOM
import { EventBus } from '../core/eventBus.js';

const AVAILABLE_LAYOUTS = [
    'dashboard',
    'table',
    'details',
    'query'
];

let _state = {
    currentLayout: 'dashboard',
    previousLayout: null,
    availableLayouts: [...AVAILABLE_LAYOUTS],
    isTransitioning: false,
    source: null
};

function getLayout() {
    return _state.currentLayout;
}

function setLayout(layout, source = 'runtime') {
    if (!_state.availableLayouts.includes(layout)) return;
    if (_state.currentLayout === layout && !_state.isTransitioning) return;
    const previousLayout = _state.currentLayout;
    _state = {
        ..._state,
        previousLayout,
        currentLayout: layout,
        source,
        isTransitioning: false
    };
    EventBus.emit('layout:changed', {
        currentLayout: layout,
        previousLayout,
        source,
        timestamp: Date.now()
    });
}

function setTransitioning(isTransitioning = true) {
    _state = {
        ..._state,
        isTransitioning
    };
}

function getSnapshot() {
    return { ..._state };
}

function restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    _state = { ...snapshot };
    EventBus.emit('layout:changed', {
        currentLayout: _state.currentLayout,
        previousLayout: _state.previousLayout,
        source: _state.source || 'restore',
        timestamp: Date.now()
    });
}

function isDashboard() {
    return _state.currentLayout === 'dashboard';
}
function isTable() {
    return _state.currentLayout === 'table';
}
function isDetails() {
    return _state.currentLayout === 'details';
}
function isQuery() {
    return _state.currentLayout === 'query';
}

export const layoutState = {
    getLayout,
    setLayout,
    setTransitioning,
    getSnapshot,
    restoreSnapshot,
    isDashboard,
    isTable,
    isDetails,
    isQuery,
    get availableLayouts() { return [..._state.availableLayouts]; },
    get isTransitioning() { return _state.isTransitioning; }
};// layoutState.js
// Estado de layout e visualização (dashboard, tabela, detalhes, etc).

export const LayoutState = {
    // TODO: Definir estrutura de layout state
};
