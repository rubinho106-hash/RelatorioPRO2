// =============================================================================
// ViewRegistry — Multi-view registration and activation
// =============================================================================
// Registra views da aplicação e mantém classe de view ativa no body.

'use strict';

const ViewRegistry = (() => {
    const views = new Map(); // name -> { rootId, onActivate }
    let active = null;

    const _bodyViewClasses = () => {
        const body = document.body;
        if (!body) { return []; }
        return Array.from(body.classList).filter((cls) => cls.indexOf('view-') === 0);
    };

    const register = (name, config = {}) => {
        const key = String(name || '').trim().toLowerCase();
        if (!key) { return false; }

        views.set(key, {
            rootId: config.rootId ? String(config.rootId) : null,
            onActivate: typeof config.onActivate === 'function' ? config.onActivate : null
        });

        return true;
    };

    const setActive = (name) => {
        const key = String(name || '').trim().toLowerCase();
        if (!key) { return null; }

        const body = document.body;
        if (!body) { return null; }

        _bodyViewClasses().forEach((cls) => body.classList.remove(cls));
        body.classList.add('view-' + key);
        body.setAttribute('data-active-view', key);

        active = key;

        const entry = views.get(key);
        if (entry && entry.onActivate) {
            try {
                entry.onActivate({ name: key, rootId: entry.rootId });
            } catch (_e) {
                // View callback should never break runtime.
            }
        }

        return active;
    };

    const getActive = () => active;

    const has = (name) => views.has(String(name || '').trim().toLowerCase());

    const getRegistered = () => Array.from(views.keys());

    return {
        register,
        setActive,
        getActive,
        has,
        getRegistered
    };
})();

window.ViewRegistry = ViewRegistry;
