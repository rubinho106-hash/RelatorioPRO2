// workspaceViewResolver.js
// Roteador semântico de views do workspace central
// Recebe renderContext e retorna o módulo de view correto

import { dashboardWorkspaceView } from './dashboardWorkspaceView.js';
import { tableWorkspaceView } from './tableWorkspaceView.js';
import { detailWorkspaceView } from './detailWorkspaceView.js';
import { queryWorkspaceView } from './queryWorkspaceView.js';
import { emptyWorkspaceView } from './emptyWorkspaceView.js';

/**
 * Resolve a view do workspace central a partir do contexto semântico
 * @param {Object} renderContext
 * @returns {Object} workspaceView (módulo com método render(renderContext))
 */
export function resolveWorkspaceView(renderContext) {
    const mode = renderContext?.workspace?.mode || renderContext?.layout?.mode || 'dashboard';
    if (mode === 'dashboard') return dashboardWorkspaceView;
    if (mode === 'table') return tableWorkspaceView;
    if (mode === 'detail' || mode === 'element') return detailWorkspaceView;
    if (mode === 'query') return queryWorkspaceView;
    return emptyWorkspaceView;
}
