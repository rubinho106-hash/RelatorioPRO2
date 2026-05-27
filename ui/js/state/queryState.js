// ui/js/state/queryState.js
// Formal semantic query state — puro, imutável, event-driven, sem parser
import { EventBus } from '../core/eventBus.js';

let _state = {
    query: '',
    filters: [],
    operators: [],
    sorting: null,
    grouping: null,
    aggregations: [],
    parsedQuery: null, // apenas armazenado, nunca processado aqui
    source: null
};

function setQuery(query, source = 'runtime') {
    _state = {
        ..._state,
        query,
        source
    };
    EventBus.emit('query:changed', {
        query,
        filters: _state.filters,
        source,
        timestamp: Date.now()
    });
}

function setFilters(filters = [], source = 'runtime') {
    _state = {
        ..._state,
        filters,
        source
    };
    EventBus.emit('query:changed', {
        query: _state.query,
        filters,
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
}

function setGrouping(grouping = null, source = 'runtime') {
    _state = {
        ..._state,
        grouping,
        source
    };
}

function setAggregations(aggregations = [], source = 'runtime') {
    _state = {
        ..._state,
        aggregations,
        source
    };
}

function setParsedQuery(parsedQuery = null) {
    _state = {
        ..._state,
        parsedQuery
    };
}

function clearQuery(source = 'runtime') {
    _state = {
        ..._state,
        query: '',
        filters: [],
        operators: [],
        sorting: null,
        grouping: null,
        aggregations: [],
        parsedQuery: null,
        source
    };
    EventBus.emit('query:changed', {
        query: '',
        filters: [],
        source,
        timestamp: Date.now()
    });
}

function getSnapshot() {
    return { ..._state };
}

function restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    _state = { ...snapshot };
    EventBus.emit('query:changed', {
        query: _state.query,
        filters: _state.filters,
        source: _state.source || 'restore',
        timestamp: Date.now()
    });
}

export const queryState = {
    setQuery,
    setFilters,
    setSorting,
    setGrouping,
    setAggregations,
    setParsedQuery,
    clearQuery,
    getSnapshot,
    restoreSnapshot,
    get query() { return _state.query; },
    get filters() { return [..._state.filters]; },
    get operators() { return [..._state.operators]; },
    get sorting() { return _state.sorting; },
    get grouping() { return _state.grouping; },
    get aggregations() { return [..._state.aggregations]; },
    get parsedQuery() { return _state.parsedQuery; },
    get source() { return _state.source; }
};
