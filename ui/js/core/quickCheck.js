// =============================================================================
// QuickCheck — Event-Driven Integration Verification
// =============================================================================
// Verificação rápida de que o fluxo event-driven está funcionando

const QuickCheck = {
  /**
   * Teste rápido do fluxo de TAG CLICK
   */
  testTagClickFlow: function() {
    console.log('%c🧪 Testing TAG CLICK FLOW', 'color: #2563eb; font-weight: bold');
    
    // 1. Clique na tag PILAR
    console.log('1. Simulating tag click (PILAR)...');
    if (window.tagModel && window.tagModel['PILAR']) {
      AppState.setCurrentTag('PILAR');
      EventBus.emit('tag:selected', { tag: 'PILAR' });
      console.log('   ✓ AppState updated:', AppState.getCurrentTag());
      console.log('   ✓ Event emitted');
    } else {
      console.log('   ⚠ PILAR tag not found in tagModel');
    }

    // 2. Verificar se RenderManager foi chamado
    setTimeout(() => {
      console.log('2. Checking render state...');
      if (typeof RenderManager !== 'undefined') {
        console.log('   ✓ RenderManager is available');
      } else {
        console.log('   ✗ RenderManager not found!');
      }
    }, 100);
  },

  /**
   * Teste rápido do fluxo de VOLTA GLOBAL
   */
  testBackToGlobalFlow: function() {
    console.log('%c🧪 Testing BACK TO GLOBAL FLOW', 'color: #2563eb; font-weight: bold');
    
    console.log('1. Calling AppState.backToGlobal()...');
    AppState.backToGlobal();
    console.log('   ✓ Mode:', AppState.getMode());
    console.log('   ✓ Current tag:', AppState.getCurrentTag());
    console.log('   ✓ Current element:', AppState.getCurrentElement());
  },

  /**
   * Teste rápido do STOREY FILTER
   */
  testStoreyFilter: function() {
    console.log('%c🧪 Testing STOREY FILTER', 'color: #2563eb; font-weight: bold');
    
    console.log('1. Setting storey filter...');
    AppState.setStoreyFilter('pavimento 1');
    console.log('   ✓ Current filter:', AppState.getFilters().storey);
    
    EventBus.emit('storey:changed', { storey: 'pavimento 1' });
    console.log('   ✓ Event emitted');
  },

  /**
   * Teste rápido do BREADCRUMB
   */
  testBreadcrumb: function() {
    console.log('%c🧪 Testing BREADCRUMB', 'color: #2563eb; font-weight: bold');
    
    const breadcrumbEl = document.getElementById('dashboardBreadcrumb');
    if (breadcrumbEl) {
      console.log('   ✓ Breadcrumb element found');
      console.log('   Current breadcrumb HTML:', breadcrumbEl.innerHTML.substring(0, 100) + '...');
    } else {
      console.log('   ✗ Breadcrumb element not found!');
    }
  },

  /**
   * Teste rápido do KPIEngine
   */
  testKPIEngine: function() {
    console.log('%c🧪 Testing KPIEngine', 'color: #2563eb; font-weight: bold');
    
    if (typeof KPIEngine === 'undefined') {
      console.log('   ✗ KPIEngine not found!');
      return;
    }

    const testContext = {
      tag: 'PILAR',
      elements: [
        { comprimento: 5, area: 10, volume: 50 },
        { comprimento: 3, area: 8, volume: 40 }
      ],
      grupo: { metro_linear: 8, area: 18, volume: 90 }
    };

    const kpis = KPIEngine.calculate(testContext);
    console.log('   ✓ KPI Calculation result:');
    console.log('   Grupos:', kpis.grupos);
    console.log('   Instâncias:', kpis.instancias);
    console.log('   Métrica:', kpis.metric + ' ' + kpis.metricUnit);
  },

  /**
   * Teste rápido do RenderManager
   */
  testRenderManager: function() {
    console.log('%c🧪 Testing RenderManager', 'color: #2563eb; font-weight: bold');
    
    if (typeof RenderManager === 'undefined') {
      console.log('   ✗ RenderManager not found!');
      return;
    }

    console.log('   ✓ RenderManager is available');
    const debug = RenderManager.debug();
    console.log('   Debug info:', debug);
  },

  /**
   * Teste rápido do LegacyAdapter
   */
  testLegacyAdapter: function() {
    console.log('%c🧪 Testing LegacyAdapter', 'color: #2563eb; font-weight: bold');
    
    if (typeof LegacyAdapter === 'undefined') {
      console.log('   ✗ LegacyAdapter not found!');
      return;
    }

    console.log('   ✓ LegacyAdapter is available');
    
    // Testar proxy
    window.currentTag = 'TEST_TAG';
    if (AppState.getCurrentTag() === 'TEST_TAG') {
      console.log('   ✓ Global variable proxy working');
    } else {
      console.log('   ✗ Global variable proxy NOT working');
    }

    // Reset
    AppState.setCurrentTag(null);
  },

  /**
   * Executar TODOS os testes
   */
  runAll: function() {
    console.clear();
    console.log('%c═══════════════════════════════════════════════════════', 'color: #3b82f6; font-weight: bold');
    console.log('%c   RELATORIÓPRO — Event-Driven Integration Tests', 'color: #3b82f6; font-weight: bold; font-size: 14px');
    console.log('%c═══════════════════════════════════════════════════════', 'color: #3b82f6; font-weight: bold');
    console.log();

    this.testTagClickFlow();
    console.log();

    this.testBackToGlobalFlow();
    console.log();

    this.testStoreyFilter();
    console.log();

    this.testBreadcrumb();
    console.log();

    this.testKPIEngine();
    console.log();

    this.testRenderManager();
    console.log();

    this.testLegacyAdapter();
    console.log();

    console.log('%c═══════════════════════════════════════════════════════', 'color: #3b82f6; font-weight: bold');
    console.log('%c✅ All quick checks completed! Open DevTools console to see details.', 'color: #059669; font-weight: bold');
    console.log('%c💡 Run QuickCheck.runAll() anytime to re-run these tests', 'color: #6366f1; font-size: 12px; font-style: italic');
    console.log('%c═══════════════════════════════════════════════════════', 'color: #3b82f6; font-weight: bold');
  }
};

// Export para global
window.QuickCheck = QuickCheck;
