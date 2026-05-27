// inspectorState.js — State domain do Semantic Inspector
// Centraliza collapse, search, pinning, density, presets, etc. Não depende de RenderManager, renderer ou tableState.

(function (global) {
    const DEFAULTS = {
        collapsedGroups: new Set(),
        searchQuery: '',
        pinnedFields: [],
        density: 'comfortable',
        compactMode: false,
        showMeta: true,
        showChips: true,
        activeField: null,
        selectedGroup: null,
        preset: null,
        source: 'runtime'
    };

    let state = {
        ...DEFAULTS,
        collapsedGroups: new Set()
    };

    function setCollapsedGroups(groups) {
        state.collapsedGroups = new Set(groups);
    }

    function toggleGroup(groupKey) {
        if (state.collapsedGroups.has(groupKey)) {
            state.collapsedGroups.delete(groupKey);
        } else {
            state.collapsedGroups.add(groupKey);
        }
    }

    function setSearchQuery(query) {
        state.searchQuery = String(query || '');
    }

    function setDensity(density) {
        state.density = density;
    }

    function setCompactMode(compact) {
        state.compactMode = !!compact;
    }

    function pinField(fieldKey) {
        if (!state.pinnedFields.includes(fieldKey)) {
            state.pinnedFields.push(fieldKey);
        }
    }

    function unpinField(fieldKey) {
        state.pinnedFields = state.pinnedFields.filter(k => k !== fieldKey);
    }

    function setPreset(preset) {
        state.preset = preset;
    }

    function setActiveField(fieldKey) {
        state.activeField = fieldKey;
    }

    function setShowMeta(show) {
        state.showMeta = !!show;
    }

    function setShowChips(show) {
        state.showChips = !!show;
    }

    function setSelectedGroup(groupKey) {
        state.selectedGroup = groupKey;
    }

    function getSnapshot() {
        // Serializa collapsedGroups para array
        return {
            ...state,
            collapsedGroups: Array.from(state.collapsedGroups)
        };
    }

    function restoreSnapshot(snapshot) {
        if (!snapshot) return;
        state = {
            ...DEFAULTS,
            ...snapshot,
            collapsedGroups: new Set(snapshot.collapsedGroups || [])
        };
    }

    function reset() {
        state = {
            ...DEFAULTS,
            collapsedGroups: new Set()
        };
    }

    global.inspectorState = {
        setCollapsedGroups,
        toggleGroup,
        setSearchQuery,
        setDensity,
        setCompactMode,
        pinField,
        unpinField,
        setPreset,
        setActiveField,
        setShowMeta,
        setShowChips,
        setSelectedGroup,
        getSnapshot,
        restoreSnapshot,
        reset
    };
})(window);
