// ui/js/state/tableState.js
// Formal table domain state — puro, imutável, event-driven, sem render
import { EventBus } from '../core/eventBus.js';

let _state = {
    columns: [],
    visibleColumns: [],
    sorting: null,
    pagination: {
        page: 1,
        pageSize: 100
    },
    selection: [], // linhas selecionadas (não BIM)
    density: 'comfortable',
    grouping: null,
    source: null
};

function setColumns(columns = [], source = 'runtime') {
    _state = {
        ..._state,
        columns,
        source
    };
}

function setVisibleColumns(visibleColumns = [], source = 'runtime') {
    _state = {
        ..._state,
        visibleColumns,
        source
    };
    EventBus.emit('table:changed', {
        visibleColumns,
        sorting: _state.sorting,
        pagination: _state.pagination,
        source,
        timestamp: Date.now()
    });
}

function setSorting(sorting = null, source = 'runtime') {
    _state = {
        ..._state,
        sorting,
        source
    };
    EventBus.emit('table:changed', {
        visibleColumns: _state.visibleColumns,
        sorting,
        pagination: _state.pagination,
        source,
        timestamp: Date.now()
    });
}

function setPagination(pagination = { page: 1, pageSize: 100 }, source = 'runtime') {
    _state = {
        ..._state,
        pagination,
        source
    };
    EventBus.emit('table:changed', {
        visibleColumns: _state.visibleColumns,
        sorting: _state.sorting,
        pagination,
        source,
        timestamp: Date.now()
    });
}

function setSelection(selection = [], source = 'runtime') {
    _state = {
        ..._state,
        selection,
        source
    };
}

function setDensity(density = 'comfortable', source = 'runtime') {
    _state = {
        ..._state,
        density,
        source
    };
}

function setGrouping(grouping = null, source = 'runtime') {
    _state = {
        ..._state,
        grouping,
        source
    };
}

function getSnapshot() {
    return { ..._state };
}

function restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    _state = { ...snapshot };
    EventBus.emit('table:changed', {
        visibleColumns: _state.visibleColumns,
        sorting: _state.sorting,
        pagination: _state.pagination,
        source: _state.source || 'restore',
        timestamp: Date.now()
    });
}

export const tableState = {
    setColumns,
    setVisibleColumns,
    setSorting,
    setPagination,
    setSelection,
    setDensity,
    setGrouping,
    getSnapshot,
    restoreSnapshot,
    get columns() { return [..._state.columns]; },
    get visibleColumns() { return [..._state.visibleColumns]; },
    get sorting() { return _state.sorting; },
    get pagination() { return { ..._state.pagination }; },
    get selection() { return [..._state.selection]; },
    get density() { return _state.density; },
    get grouping() { return _state.grouping; },
    get source() { return _state.source; }
};
