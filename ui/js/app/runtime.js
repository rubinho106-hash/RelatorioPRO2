
// runtime.js
// Núcleo de orquestração do RelatorioPRO: centraliza módulos, serviços e ciclo de vida.

export const Runtime = {
    version: '1.0.0',
    build: process?.env?.RELATORIOPRO_BUILD || 'dev',
    mode: 'legacy-hybrid',
    state: {},
    layout: {},
    render: {},
    bridge: {},
    schema: {},
    services: {},
    lifecycle: {},
    diagnostics: {
        trace: (...args) => console.debug('[Runtime:trace]', ...args)
    },
    eventBus: null,
    _registry: {},
    register(name, module) {
        this._registry[name] = module;
        this.diagnostics.trace('register', name, module);
    },
    resolve(name) {
        return this._registry[name];
    }
};

// Expor globalmente para compatibilidade temporária
if (typeof window !== 'undefined') {
    window.Runtime = Runtime;
}
