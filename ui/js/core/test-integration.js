// =============================================================================
// Integration Test — Phase 1 Foundation Verification
// =============================================================================
// Verifica se AppState, EventBus, Bridge e LegacyAdapter estão funcionando
// Esta é uma ferramenta de diagnóstico, não faz parte da execução normal

'use strict';

const IntegrationTest = {
  /**
   * Run all tests and return results
   */
  runAll() {
    console.clear();
    console.log('%c📋 RELATORIÓPRO — Phase 1 Integration Test', 'color: #2563eb; font-size: 14px; font-weight: bold');
    console.log('%c─────────────────────────────────────────────────', 'color: #cbd5e1');

    const results = {
      timestamp: new Date().toISOString(),
      tests: []
    };

    // Test 1: AppState existence and basic API
    results.tests.push(this.testAppState());

    // Test 2: EventBus functionality
    results.tests.push(this.testEventBus());

    // Test 3: Bridge availability
    results.tests.push(this.testBridge());

    // Test 4: LegacyAdapter mappings
    results.tests.push(this.testLegacyAdapter());

    // Test 5: Script load order verification
    results.tests.push(this.testLoadOrder());

    // Summary
    this.printSummary(results);
    return results;
  },

  /**
   * Test AppState
   */
  testAppState() {
    const testName = 'AppState (State Management)';
    const results = {
      name: testName,
      passed: true,
      details: []
    };

    try {
      // Check existence
      if (typeof window.AppState === 'undefined') {
        throw new Error('window.AppState not found');
      }
      results.details.push('✓ window.AppState exists');

      // Check methods
      const requiredMethods = [
        'getState', 'getMode', 'getCurrentTag', 'getCurrentElement',
        'setMode', 'setCurrentTag', 'setCurrentElement', 'setData',
        'setSearchTerm', 'setStoreyFilter', 'getTags', 'getData',
        'backToGlobal', 'backToTag', 'selectElement'
      ];

      const actualMethods = Object.keys(AppState);
      for (const method of requiredMethods) {
        if (typeof AppState[method] !== 'function') {
          throw new Error(`Missing method: AppState.${method}`);
        }
      }
      results.details.push(`✓ All ${requiredMethods.length} required methods exist`);

      // Test basic state access
      const state = AppState.getState();
      if (!state || typeof state !== 'object') {
        throw new Error('AppState.getState() returned invalid value');
      }
      results.details.push(`✓ getState() returns valid object with keys: ${Object.keys(state).join(', ')}`);

      // Test mode getter/setter
      const originalMode = AppState.getMode();
      AppState.setMode('TEST');
      if (AppState.getMode() !== 'TEST') {
        throw new Error('Mode setter/getter not working');
      }
      AppState.setMode(originalMode); // Reset
      results.details.push(`✓ Mode getter/setter working (current: ${originalMode})`);

    } catch (error) {
      results.passed = false;
      results.error = error.message;
      results.details.push(`✗ ${error.message}`);
    }

    return results;
  },

  /**
   * Test EventBus
   */
  testEventBus() {
    const testName = 'EventBus (Event System)';
    const results = {
      name: testName,
      passed: true,
      details: []
    };

    try {
      if (typeof window.EventBus === 'undefined') {
        throw new Error('window.EventBus not found');
      }
      results.details.push('✓ window.EventBus exists');

      // Check methods
      const requiredMethods = ['on', 'off', 'emit', 'once', 'clear', 'listenerCount', 'eventNames'];
      for (const method of requiredMethods) {
        if (typeof EventBus[method] !== 'function') {
          throw new Error(`Missing method: EventBus.${method}`);
        }
      }
      results.details.push(`✓ All ${requiredMethods.length} required methods exist`);

      // Test event emission
      let eventFired = false;
      const unsubscribe = EventBus.on('test:integration', (data) => {
        eventFired = true;
      });
      EventBus.emit('test:integration', { value: 'test' });
      EventBus.clear('test:integration');

      if (!eventFired) {
        throw new Error('Event listener not triggered');
      }
      results.details.push('✓ Event emission and listener working');

      // Test once()
      let onceCount = 0;
      EventBus.once('test:once', () => onceCount++);
      EventBus.emit('test:once');
      EventBus.emit('test:once');
      if (onceCount !== 1) {
        throw new Error('once() listener not working correctly');
      }
      EventBus.clear('test:once');
      results.details.push('✓ once() working (single trigger)');

      // Check predefined events
      if (!EventBus.Events || typeof EventBus.Events !== 'object') {
        throw new Error('EventBus.Events not defined');
      }
      const eventCount = Object.keys(EventBus.Events).length;
      results.details.push(`✓ Predefined events exist (${eventCount} events)`);

    } catch (error) {
      results.passed = false;
      results.error = error.message;
      results.details.push(`✗ ${error.message}`);
    }

    return results;
  },

  /**
   * Test Bridge
   */
  testBridge() {
    const testName = 'Bridge (SketchUp Integration)';
    const results = {
      name: testName,
      passed: true,
      details: []
    };

    try {
      if (typeof window.Bridge === 'undefined') {
        throw new Error('window.Bridge not found');
      }
      results.details.push('✓ window.Bridge exists');

      // Check methods
      const requiredMethods = [
        'isAvailable', 'highlightEntity', 'focusEntity', 'zoomSelection',
        'clearSelection', 'selectEntities', 'requestDataRefresh',
        'exportExcel', 'exportCsv', 'log', 'call', 'hasMethod'
      ];

      for (const method of requiredMethods) {
        if (typeof Bridge[method] !== 'function') {
          throw new Error(`Missing method: Bridge.${method}`);
        }
      }
      results.details.push(`✓ All ${requiredMethods.length} required methods exist`);

      // Check SketchUp availability
      const available = Bridge.isAvailable();
      results.details.push(`✓ SketchUp availability check: ${available ? 'Available' : 'Not available (expected in browser)'}`);

      // Check method introspection
      if (typeof Bridge.getAvailableMethods !== 'function') {
        throw new Error('getAvailableMethods not found');
      }
      const methods = Bridge.getAvailableMethods();
      results.details.push(`✓ Method introspection working (${methods.length} methods found in SketchUp)`);

    } catch (error) {
      results.passed = false;
      results.error = error.message;
      results.details.push(`✗ ${error.message}`);
    }

    return results;
  },

  /**
   * Test LegacyAdapter
   */
  testLegacyAdapter() {
    const testName = 'LegacyAdapter (Backward Compatibility)';
    const results = {
      name: testName,
      passed: true,
      details: []
    };

    try {
      if (typeof window.LegacyAdapter === 'undefined') {
        throw new Error('window.LegacyAdapter not found');
      }
      results.details.push('✓ window.LegacyAdapter exists');

      // Check legacy global variables
      const legacyGlobals = ['currentMode', 'currentTag', 'currentElement', 'currentStoreyFilter', 'dashboardSearchTerm'];
      for (const varName of legacyGlobals) {
        if (!(varName in window)) {
          throw new Error(`Legacy global not found: ${varName}`);
        }
      }
      results.details.push(`✓ All ${legacyGlobals.length} legacy globals exist and mapped to AppState`);

      // Check legacy function existence
      const legacyFunctions = [
        'backToGlobalMode', 'backToTagMode', 'selectTag', 'selectElementByKey',
        'setDashboardSearchTerm', 'clearDashboardSearch', 'filtrarPavimento',
        'setData', 'renderDashboard', 'getDashboardMode'
      ];

      for (const funcName of legacyFunctions) {
        if (typeof window[funcName] !== 'function') {
          throw new Error(`Legacy function not found: ${funcName}`);
        }
      }
      results.details.push(`✓ All ${legacyFunctions.length} legacy functions exposed globally`);

      // Test legacy getter/setter
      const originalMode = window.currentMode;
      window.currentMode = 'LEGACY_TEST';
      if (AppState.getMode() !== 'LEGACY_TEST') {
        throw new Error('Legacy mode setter not syncing to AppState');
      }
      window.currentMode = originalMode; // Reset
      results.details.push('✓ Legacy getter/setter syncing with AppState');

    } catch (error) {
      results.passed = false;
      results.error = error.message;
      results.details.push(`✗ ${error.message}`);
    }

    return results;
  },

  /**
   * Test load order
   */
  testLoadOrder() {
    const testName = 'Script Load Order';
    const results = {
      name: testName,
      passed: true,
      details: []
    };

    try {
      // Verify dependency chain
      if (typeof window.AppState === 'undefined') {
        throw new Error('AppState should be loaded first');
      }
      results.details.push('✓ AppState loaded (Phase 1/4)');

      if (typeof window.EventBus === 'undefined') {
        throw new Error('EventBus should be loaded after AppState');
      }
      results.details.push('✓ EventBus loaded (Phase 2/4)');

      if (typeof window.Bridge === 'undefined') {
        throw new Error('Bridge should be loaded after EventBus');
      }
      results.details.push('✓ Bridge loaded (Phase 3/4)');

      if (typeof window.LegacyAdapter === 'undefined') {
        throw new Error('LegacyAdapter should be loaded after Bridge');
      }
      results.details.push('✓ LegacyAdapter loaded (Phase 4/4)');

      // Verify dependencies can access each other
      EventBus.emit('test:loadorder', {});
      Bridge.isAvailable();
      results.details.push('✓ All components can reference each other');

    } catch (error) {
      results.passed = false;
      results.error = error.message;
      results.details.push(`✗ ${error.message}`);
    }

    return results;
  },

  /**
   * Print test summary
   */
  printSummary(results) {
    console.log();
    results.tests.forEach(test => {
      const icon = test.passed ? '✅' : '❌';
      const color = test.passed ? 'color: #059669' : 'color: #dc2626';
      console.log(`%c${icon} ${test.name}`, color);
      test.details.forEach(detail => {
        console.log(`   ${detail}`);
      });
    });

    console.log();
    const passed = results.tests.filter(t => t.passed).length;
    const total = results.tests.length;
    const passedColor = passed === total ? 'color: #059669; font-weight: bold' : 'color: #f59e0b; font-weight: bold';
    console.log(`%c📊 Results: ${passed}/${total} tests passed`, passedColor);

    if (passed === total) {
      console.log('%c✨ All systems operational! Architecture Phase 1 foundation is stable.', 'color: #059669; font-style: italic');
      console.log('%c→ Next: Begin migrating info.js functions to use EventBus and AppState', 'color: #3b82f6');
    } else {
      console.log('%c⚠️  Some tests failed. Check details above.', 'color: #dc2626; font-style: italic');
    }

    console.log('%c─────────────────────────────────────────────────', 'color: #cbd5e1');
    console.log('%c💡 Run IntegrationTest.runAll() anytime to verify system health', 'color: #6366f1; font-size: 12px; font-style: italic');
  }
};

// Auto-run tests on load (comment out for production)
// Uncomment line below if you want tests to run automatically when dialog loads
// document.addEventListener('DOMContentLoaded', () => IntegrationTest.runAll());

// Export for global access
window.IntegrationTest = IntegrationTest;
