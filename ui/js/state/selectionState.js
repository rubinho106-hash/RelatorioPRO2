
// selectionState.js
// Estado puro e imutável de seleção do RelatorioPRO

import { Runtime } from '../app/runtime.js';

const initialState = {
    currentSelection: [], // [{id, type, ...}] ou apenas IDs normalizados
    currentTag: null,
    currentElement: null,
    selectedIds: [], // [Number]
    focusedId: null, // Number
    source: null // 'dashboard' | 'sketchup' | 'table' | 'query' | 'runtime' | ...
};

let state = { ...initialState };

function normalizeIds(ids) {
    return (ids || []).map(id => Number(id)).filter(id => !isNaN(id));
}

function emitSelectionChanged(payload) {
    if (Runtime?.eventBus?.emit) {
        Runtime.eventBus.emit('selection:changed', payload);
    }
    Runtime?.diagnostics?.trace?.('selection:changed', payload);
}

export const SelectionState = {
    getState() {
        return { ...state };
    },
    setSelection({ selection = [], source = null, tag = null, element = null, focusedId = null } = {}) {
        const oldSelection = state.currentSelection;
        const normalizedIds = normalizeIds(selection);
        state = {
            ...state,
            currentSelection: [...normalizedIds],
            selectedIds: [...normalizedIds],
            currentTag: tag ?? state.currentTag,
            currentElement: element ?? state.currentElement,
            focusedId: focusedId ?? state.focusedId,
            source: source || null
        };
        emitSelectionChanged({
            selection: [...state.currentSelection],
            source: state.source,
            timestamp: Date.now(),
            diff: getSelectionDiff(oldSelection, state.currentSelection)
        });
        Runtime?.diagnostics?.trace?.('selection:set', { source, ids: normalizedIds });
    },
    clearSelection({ source = null } = {}) {
        const oldSelection = state.currentSelection;
        state = {
            ...state,
            currentSelection: [],
            selectedIds: [],
            focusedId: null,
            source: source || null
        };
        emitSelectionChanged({
            selection: [],
            source: state.source,
            timestamp: Date.now(),
            diff: getSelectionDiff(oldSelection, [])
        });
        Runtime?.diagnostics?.trace?.('selection:clear', { source });
    },
    setFocusedId(focusedId, source = null) {
        state = {
            ...state,
            focusedId: Number(focusedId),
            source: source || state.source
        };
        Runtime?.diagnostics?.trace?.('selection:focus', { focusedId, source });
    },
    setCurrentTag(tag, source = null) {
        state = {
            ...state,
            currentTag: tag,
            source: source || state.source
        };
        Runtime?.diagnostics?.trace?.('selection:tag', { tag, source });
    },
    setCurrentElement(element, source = null) {
        state = {
            ...state,
            currentElement: element,
            source: source || state.source
        };
        Runtime?.diagnostics?.trace?.('selection:element', { element, source });
    },
    getSnapshot() {
        return { ...state };
    },
    restoreSnapshot(snapshot) {
        if (!snapshot) return;
        const oldSelection = state.currentSelection;
        state = { ...snapshot };
        emitSelectionChanged({
            selection: [...state.currentSelection],
            source: state.source,
            timestamp: Date.now(),
            diff: getSelectionDiff(oldSelection, state.currentSelection)
        });
        Runtime?.diagnostics?.trace?.('selection:restore', { snapshot });
    },
    getSelectionDiff(oldSelection, newSelection) {
        return getSelectionDiff(oldSelection, newSelection);
    }
};

function getSelectionDiff(oldSelection, newSelection) {
    const oldSet = new Set(normalizeIds(oldSelection));
    const newSet = new Set(normalizeIds(newSelection));
    return {
        added: [...newSet].filter(x => !oldSet.has(x)),
        removed: [...oldSet].filter(x => !newSet.has(x))
    };
}
