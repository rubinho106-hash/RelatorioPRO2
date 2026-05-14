/**
 * Diagnostics System
 * 
 * Purpose: Verify all modules, contracts, and profiler are loaded correctly
 * Runs AFTER all other scripts are loaded
 */

const Diagnostics = (() => {
  'use strict';

  const status = {
    timestamp: new Date().toISOString(),
    modules: {},
    contracts: {},
    profiler: {},
    state: {},
    eventBus: {},
    bridge: {},
    kpiEngine: {},
    renderManager: {}
  };

  /**
   * Check if object exists and has required methods
   * @private
   */
  const _checkModule = (name, requiredMethods = []) => {
    const obj = window[name];
    const exists = typeof obj !== 'undefined' && obj !== null;
    const methods = requiredMethods.map(m => typeof obj?.[m] === 'function');
    
    return {
      exists: exists,
      type: typeof obj,
      hasAllMethods: requiredMethods.length === 0 || methods.every(m => m),
      methods: requiredMethods.map(m => ({
        name: m,
        exists: typeof obj?.[m] === 'function'
      }))
    };
  };

  /**
   * Run all diagnostics
   */
  const run = () => {
    console.clear();
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #00ff00; font-weight: bold');
    console.log('%c  RELATÓRIO DE DIAGNÓSTICO - RelatorioPRO', 'color: #00ff00; font-weight: bold; font-size: 14px');
    console.log('%c═══════════════════════════════════════════════════════════', 'color: #00ff00; font-weight: bold');
    console.log('');

    // Check Core Layer
    console.log('%c─── LAYER 1: CORE FOUNDATION ───', 'color: #0f9; font-weight: bold');
    
    status.state = _checkModule('AppState', ['getState', 'setCurrentTag', 'setCurrentElement']);
    console.log(`${_statusIcon(status.state.exists)} AppState:`, status.state.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.state.exists) console.table(status.state.methods);

    status.eventBus = _checkModule('EventBus', ['on', 'emit', 'off']);
    console.log(`${_statusIcon(status.eventBus.exists)} EventBus:`, status.eventBus.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.eventBus.exists) console.table(status.eventBus.methods);

    status.bridge = _checkModule('Bridge', ['isAvailable', 'highlightEntity', 'selectEntities']);
    console.log(`${_statusIcon(status.bridge.exists)} Bridge:`, status.bridge.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.bridge.exists) console.table(status.bridge.methods);

    status.kpiEngine = _checkModule('KPIEngine', ['calculate', 'calculateGlobalTotals']);
    console.log(`${_statusIcon(status.kpiEngine.exists)} KPIEngine:`, status.kpiEngine.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.kpiEngine.exists) console.table(status.kpiEngine.methods);

    status.renderManager = _checkModule('RenderManager', ['renderAll', 'renderImmediate', 'getMetrics']);
    console.log(`${_statusIcon(status.renderManager.exists)} RenderManager:`, status.renderManager.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.renderManager.exists) console.table(status.renderManager.methods);
    console.log('');

    // Check UI Modules
    console.log('%c─── LAYER 2: UI MODULES ───', 'color: #0f9; font-weight: bold');
    
    status.modules.kpiCards = _checkModule('KPICardsModule', ['render', 'debug']);
    console.log(`${_statusIcon(status.modules.kpiCards.exists)} KPICardsModule:`, status.modules.kpiCards.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.modules.kpiCards.exists) console.table(status.modules.kpiCards.methods);

    status.modules.breadcrumb = _checkModule('BreadcrumbModule', ['render', 'debug']);
    console.log(`${_statusIcon(status.modules.breadcrumb.exists)} BreadcrumbModule:`, status.modules.breadcrumb.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.modules.breadcrumb.exists) console.table(status.modules.breadcrumb.methods);

    status.modules.sidebar = _checkModule('SidebarModule', ['render', 'debug']);
    console.log(`${_statusIcon(status.modules.sidebar.exists)} SidebarModule:`, status.modules.sidebar.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.modules.sidebar.exists) console.table(status.modules.sidebar.methods);

    status.modules.details = _checkModule('DetailsModule', ['render', 'debug']);
    console.log(`${_statusIcon(status.modules.details.exists)} DetailsModule:`, status.modules.details.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.modules.details.exists) console.table(status.modules.details.methods);
    console.log('');

    // Check Contracts & Profiler
    console.log('%c─── LAYER 3: CONTRACTS & PROFILER ───', 'color: #0f9; font-weight: bold');
    
    status.contracts = _checkModule('DashboardContracts', ['validate', 'validateAll', 'getContract']);
    console.log(`${_statusIcon(status.contracts.exists)} DashboardContracts:`, status.contracts.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.contracts.exists) {
      console.table(status.contracts.methods);
      try {
        const contracts = window.DashboardContracts.listContracts();
        console.log(`  📋 Contracts registered: ${contracts.length}`);
        contracts.forEach(c => console.log(`    - ${c.name}`));
      } catch (e) {
        console.error('  ❌ Error listing contracts:', e.message);
      }
    }
    console.log('');

    status.profiler = _checkModule('Profiler', ['startTimer', 'endTimer', 'report', 'textReport']);
    console.log(`${_statusIcon(status.profiler.exists)} Profiler:`, status.profiler.exists ? '✅ LOADED' : '❌ MISSING');
    if (status.profiler.exists) {
      console.table(status.profiler.methods);
      try {
        const debug = window.Profiler.debug();
        console.log(`  📊 Profiler Status:`, debug);
      } catch (e) {
        console.error('  ❌ Error getting profiler status:', e.message);
      }
    }
    console.log('');

    // Overall Status
    console.log('%c─── RESUMO GERAL ───', 'color: #0f9; font-weight: bold');
    
    const coreOk = status.state.exists && status.eventBus.exists && status.bridge.exists && 
                    status.kpiEngine.exists && status.renderManager.exists;
    
    const modulesOk = status.modules.kpiCards.exists && status.modules.breadcrumb.exists &&
                      status.modules.sidebar.exists && status.modules.details.exists;
    
    const contractsOk = status.contracts.exists;
    const profilerOk = status.profiler.exists;

    console.log(`${_statusIcon(coreOk)} Core Foundation: ${coreOk ? '✅ OK' : '❌ PROBLEMAS'}`);
    console.log(`${_statusIcon(modulesOk)} UI Modules: ${modulesOk ? '✅ OK' : '❌ PROBLEMAS'}`);
    console.log(`${_statusIcon(contractsOk)} Contracts: ${contractsOk ? '✅ OK' : '❌ MISSING'}`);
    console.log(`${_statusIcon(profilerOk)} Profiler: ${profilerOk ? '✅ OK' : '❌ MISSING'}`);
    console.log('');

    const allOk = coreOk && modulesOk && contractsOk && profilerOk;
    console.log(`%c${'═══════════════════════════════════════════════════════════'}`, 'color: #00ff00');
    console.log(`%c  STATUS: ${allOk ? '✅ SISTEMA PRONTO' : '❌ ERROS ENCONTRADOS'}`, 
               `color: ${allOk ? '#00ff00' : '#ff0000'}; font-weight: bold; font-size: 14px`);
    console.log(`%c${'═══════════════════════════════════════════════════════════'}`, 'color: #00ff00');
    console.log('');

    if (!allOk) {
      console.log('%c⚠️  PROBLEMAS ENCONTRADOS:', 'color: #ff9900; font-weight: bold');
      if (!coreOk) console.log('  ❌ Verificar LAYER 1 (Core Foundation)');
      if (!modulesOk) console.log('  ❌ Verificar LAYER 2 (UI Modules)');
      if (!contractsOk) console.log('  ❌ Verificar LAYER 3 (DashboardContracts)');
      if (!profilerOk) console.log('  ❌ Verificar LAYER 3 (Profiler)');
    }

    return {
      allOk: allOk,
      coreOk: coreOk,
      modulesOk: modulesOk,
      contractsOk: contractsOk,
      profilerOk: profilerOk,
      status: status,
      timestamp: new Date().toISOString()
    };
  };

  /**
   * Get status icon
   * @private
   */
  const _statusIcon = (ok) => ok ? '✅' : '❌';

  /**
   * Test contract validation
   */
  const testContracts = () => {
    if (!window.DashboardContracts) {
      console.error('❌ DashboardContracts não está definido');
      return;
    }

    console.log('%c─── TESTE DE CONTRATOS ───', 'color: #0f9; font-weight: bold');

    const testData = {
      KPICardsModule: {
        navigation: { mode: 'GLOBAL' },
        data: { tags: [], rows: [] },
        filters: {}
      },
      BreadcrumbModule: {
        navigation: { mode: 'GLOBAL' }
      },
      SidebarModule: {
        navigation: { mode: 'GLOBAL' },
        data: { tags: [] }
      },
      DetailsModule: {
        navigation: { mode: 'ELEMENT', currentTag: 'TEST', currentElement: 'test-001' },
        data: { tags: [] }
      }
    };

    for (const [moduleName, testPayload] of Object.entries(testData)) {
      try {
        const result = window.DashboardContracts.validate(moduleName, testPayload);
        console.log(`✅ ${moduleName}:`, result.valid ? 'VÁLIDO' : 'INVÁLIDO');
        if (!result.valid) {
          console.error(`  Erros: ${result.errors.join(', ')}`);
        }
      } catch (e) {
        console.error(`❌ ${moduleName}: ${e.message}`);
      }
    }
  };

  /**
   * Test profiler
   */
  const testProfiler = () => {
    if (!window.Profiler) {
      console.error('❌ Profiler não está definido');
      return;
    }

    console.log('%c─── TESTE DE PROFILER ───', 'color: #0f9; font-weight: bold');

    try {
      // Simulate some operations
      const t1 = window.Profiler.startTimer('test-operation');
      for (let i = 0; i < 1000000; i++) {
        Math.sqrt(i);
      }
      const result = window.Profiler.endTimer(t1);
      
      console.log(`✅ Profiler funcionando`);
      console.log(`  Tempo medido: ${result.duration.toFixed(2)}ms`);
      
      // Record a test render
      window.Profiler.recordRender('GLOBAL', 5.2, { test: true });
      console.log(`✅ Render gravado`);
      
      // Get metrics
      const metrics = window.Profiler.getMetrics();
      console.log(`✅ Métricas coletadas:`, metrics);
    } catch (e) {
      console.error(`❌ Erro no profiler: ${e.message}`);
    }
  };

  // Export API
  return {
    run: run,
    testContracts: testContracts,
    testProfiler: testProfiler
  };
})();

// Export to global
window.Diagnostics = Diagnostics;

// Auto-run on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => Diagnostics.run(), 500);
  });
} else {
  setTimeout(() => Diagnostics.run(), 500);
}
