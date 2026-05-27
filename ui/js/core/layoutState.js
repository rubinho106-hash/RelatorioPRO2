// =============================================================================
// LayoutState — UI Shell Layout Mode Management
// =============================================================================
// Isola estado visual de layout (dashboard/table) do estado BIM de navegação.

'use strict';

const LayoutState = (() => {
    let view = 'dashboard'; // dashboard | table

    const _bodyClasses = ['layout-dashboard', 'layout-tag', 'layout-element', 'layout-table'];

    const setView = (nextView) => {
        const normalized = String(nextView || '').toLowerCase();
        view = normalized === 'table' ? 'table' : 'dashboard';
        return view;
    };

    const getView = () => view;

    const _classFromNavigation = (mode) => {
        if (view === 'table') { return 'layout-table'; }

        if (mode === 'ELEMENT') { return 'layout-element'; }
        if (mode === 'TAG') { return 'layout-tag'; }
        return 'layout-dashboard';
    };

    const applyBodyClass = (navigationMode) => {
        const body = document.body;
        if (!body) { return; }

        body.classList.remove.apply(body.classList, _bodyClasses);
        body.classList.add(_classFromNavigation(navigationMode));
    };

    return {
        setView,
        getView,
        applyBodyClass
    };
})();

window.LayoutState = LayoutState;
