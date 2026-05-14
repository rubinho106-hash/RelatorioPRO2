/**
 * Performance Profiler
 * 
 * Purpose: Comprehensive performance measurement across all dashboard systems
 * 
 * Philosophy:
 * - Measure EVERYTHING before optimizing ANYTHING
 * - Data-driven decisions, not assumptions
 * - Fine-grained metrics for identifying real bottlenecks
 * - Minimal overhead in production
 * 
 * Metrics Collected:
 * - RenderManager: total time, module breakdown, rerenders, frame cost
 * - KPIEngine: aggregation, grouping, filtering, sorting
 * - Table Render: data prep, sorting, filtering, row building, DOM append
 * - Module Rendering: KPI cards, breadcrumb, sidebar, details
 * - Event System: event emission, listener count
 */

const Profiler = (() => {
  'use strict';

  // Configuration
  const CONFIG = {
    enabled: true,
    maxHistorySize: 100, // Keep last N measurements
    slowThreshold: 16.67 // 60fps = 16.67ms per frame
  };

  // Measurement storage
  const metrics = {
    renders: [],
    kpiCalculations: [],
    tableOperations: [],
    moduleRenders: {},
    events: [],
    custom: {}
  };

  // Active measurements
  const activeTimers = new Map();

  // =========================================================================
  // TIMER UTILITIES
  // =========================================================================

  /**
   * Start measuring operation
   * @param {string} label - Operation label
   * @returns {string} Timer ID
   */
  const startTimer = (label) => {
    if (!CONFIG.enabled) return null;

    const timerId = `${label}-${Date.now()}-${Math.random()}`;
    activeTimers.set(timerId, {
      label: label,
      startTime: performance.now(),
      startMark: `profiler-${label}-start-${Date.now()}`
    });

    // Mark for browser DevTools
    if (typeof performance.mark === 'function') {
      try {
        performance.mark(activeTimers.get(timerId).startMark);
      } catch (e) {
        // Safari may not support marks
      }
    }

    return timerId;
  };

  /**
   * End measuring operation
   * @param {string} timerId - Timer ID from startTimer
   * @param {Object} metadata - Additional data to store
   * @returns {Object} Measurement result
   */
  const endTimer = (timerId, metadata = {}) => {
    if (!CONFIG.enabled || !activeTimers.has(timerId)) {
      return null;
    }

    const timer = activeTimers.get(timerId);
    const endTime = performance.now();
    const duration = endTime - timer.startTime;

    activeTimers.delete(timerId);

    const measurement = {
      label: timer.label,
      duration: duration,
      startTime: timer.startTime,
      endTime: endTime,
      timestamp: new Date().toISOString(),
      slow: duration > CONFIG.slowThreshold,
      metadata: metadata
    };

    // Mark for browser DevTools
    if (typeof performance.mark === 'function') {
      try {
        const endMark = `profiler-${timer.label}-end-${endTime}`;
        performance.mark(endMark);

        if (typeof performance.measure === 'function') {
          performance.measure(
            `profiler-${timer.label}`,
            timer.startMark,
            endMark
          );
        }
      } catch (e) {
        // Safari may not support marks
      }
    }

    return measurement;
  };

  // =========================================================================
  // RENDER PROFILING
  // =========================================================================

  /**
   * Record render operation
   * @param {string} mode - Render mode (GLOBAL, TAG, ELEMENT)
   * @param {number} duration - Duration in ms
   * @param {Object} details - Additional details
   */
  const recordRender = (mode, duration, details = {}) => {
    if (!CONFIG.enabled) return;

    const measurement = {
      mode: mode,
      duration: duration,
      timestamp: new Date().toISOString(),
      slow: duration > CONFIG.slowThreshold,
      details: details
    };

    metrics.renders.push(measurement);

    // Trim history
    if (metrics.renders.length > CONFIG.maxHistorySize) {
      metrics.renders.shift();
    }
  };

  /**
   * Record module render
   * @param {string} moduleName - Module that rendered (KPICardsModule, etc)
   * @param {number} duration - Duration in ms
   */
  const recordModuleRender = (moduleName, duration) => {
    if (!CONFIG.enabled) return;

    if (!metrics.moduleRenders[moduleName]) {
      metrics.moduleRenders[moduleName] = [];
    }

    metrics.moduleRenders[moduleName].push({
      duration: duration,
      timestamp: new Date().toISOString(),
      slow: duration > CONFIG.slowThreshold
    });

    // Trim history
    if (metrics.moduleRenders[moduleName].length > CONFIG.maxHistorySize) {
      metrics.moduleRenders[moduleName].shift();
    }
  };

  // =========================================================================
  // KPI ENGINE PROFILING
  // =========================================================================

  /**
   * Record KPI calculation
   * @param {Object} params - Calculation parameters
   * @param {number} duration - Duration in ms
   */
  const recordKPICalculation = (params, duration) => {
    if (!CONFIG.enabled) return;

    const measurement = {
      tagCount: (params.tags || []).length,
      elementCount: (params.elements || []).length,
      duration: duration,
      timestamp: new Date().toISOString(),
      slow: duration > CONFIG.slowThreshold,
      metadata: params
    };

    metrics.kpiCalculations.push(measurement);

    if (metrics.kpiCalculations.length > CONFIG.maxHistorySize) {
      metrics.kpiCalculations.shift();
    }
  };

  // =========================================================================
  // TABLE OPERATION PROFILING
  // =========================================================================

  /**
   * Record table operation (prepare, sort, filter, build, append)
   * @param {string} operationType - Type of operation
   * @param {number} duration - Duration in ms
   * @param {Object} metadata - Additional data
   */
  const recordTableOperation = (operationType, duration, metadata = {}) => {
    if (!CONFIG.enabled) return;

    const measurement = {
      operation: operationType,
      duration: duration,
      timestamp: new Date().toISOString(),
      slow: duration > CONFIG.slowThreshold,
      elementCount: metadata.elementCount || 0,
      metadata: metadata
    };

    metrics.tableOperations.push(measurement);

    if (metrics.tableOperations.length > CONFIG.maxHistorySize) {
      metrics.tableOperations.shift();
    }
  };

  // =========================================================================
  // EVENT SYSTEM PROFILING
  // =========================================================================

  /**
   * Record event emission
   * @param {string} eventName - Event name
   * @param {number} listenerCount - Number of listeners
   */
  const recordEvent = (eventName, listenerCount = 0) => {
    if (!CONFIG.enabled) return;

    metrics.events.push({
      event: eventName,
      listenerCount: listenerCount,
      timestamp: new Date().toISOString()
    });

    if (metrics.events.length > CONFIG.maxHistorySize * 2) {
      metrics.events.shift();
    }
  };

  // =========================================================================
  // ANALYSIS & REPORTING
  // =========================================================================

  /**
   * Calculate statistics for measurements
   * @private
   */
  const _calculateStats = (measurements) => {
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const durations = measurements.map(m => m.duration || m.duration);
    durations.sort((a, b) => a - b);

    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const min = durations[0];
    const max = durations[durations.length - 1];
    const median = durations.length % 2 === 0
      ? (durations[durations.length / 2 - 1] + durations[durations.length / 2]) / 2
      : durations[Math.floor(durations.length / 2)];

    const slowCount = measurements.filter(m => m.slow).length;

    return {
      count: measurements.length,
      avg: avg.toFixed(2),
      min: min.toFixed(2),
      max: max.toFixed(2),
      median: median.toFixed(2),
      total: sum.toFixed(2),
      slowCount: slowCount,
      slowPercent: ((slowCount / measurements.length) * 100).toFixed(1)
    };
  };

  /**
   * Generate comprehensive report
   * @returns {Object} Performance report
   */
  const report = () => {
    const report = {
      generated: new Date().toISOString(),
      enabled: CONFIG.enabled,
      config: CONFIG,

      // Render metrics
      renders: {
        statistics: _calculateStats(metrics.renders),
        byMode: {},
        slowRenders: metrics.renders.filter(r => r.slow).slice(-10)
      },

      // Module metrics
      modules: {},

      // KPI metrics
      kpi: {
        statistics: _calculateStats(metrics.kpiCalculations),
        slowCalculations: metrics.kpiCalculations.filter(k => k.slow).slice(-10)
      },

      // Table metrics
      table: {
        statistics: _calculateStats(metrics.tableOperations),
        byOperation: {},
        slowOperations: metrics.tableOperations.filter(t => t.slow).slice(-10)
      },

      // Event metrics
      events: {
        totalEmissions: metrics.events.length,
        uniqueEvents: Array.from(new Set(metrics.events.map(e => e.event))).length,
        recentEvents: metrics.events.slice(-20)
      }
    };

    // Group renders by mode
    metrics.renders.forEach(render => {
      if (!report.renders.byMode[render.mode]) {
        report.renders.byMode[render.mode] = [];
      }
      report.renders.byMode[render.mode].push(render);
    });

    // Calculate stats per mode
    for (const [mode, renders] of Object.entries(report.renders.byMode)) {
      report.renders.byMode[mode] = {
        statistics: _calculateStats(renders),
        count: renders.length
      };
    }

    // Module metrics
    for (const [moduleName, measurements] of Object.entries(metrics.moduleRenders)) {
      report.modules[moduleName] = {
        statistics: _calculateStats(measurements),
        slowRenders: measurements.filter(m => m.slow).slice(-10)
      };
    }

    // Table operations by type
    const tableOpsMap = {};
    metrics.tableOperations.forEach(op => {
      if (!tableOpsMap[op.operation]) {
        tableOpsMap[op.operation] = [];
      }
      tableOpsMap[op.operation].push(op);
    });

    for (const [opType, ops] of Object.entries(tableOpsMap)) {
      report.table.byOperation[opType] = _calculateStats(ops);
    }

    return report;
  };

  /**
   * Generate simple text report
   */
  const textReport = () => {
    const rep = report();

    const lines = [
      '═══════════════════════════════════════════════════════════',
      '  PERFORMANCE PROFILER REPORT',
      '═══════════════════════════════════════════════════════════',
      '',
      `Generated: ${rep.generated}`,
      `Profiling Enabled: ${rep.enabled}`,
      '',
      '─── RENDER PERFORMANCE ───',
      ...(_formatStats('Overall Renders', rep.renders.statistics)),
      '',
      ...Object.entries(rep.renders.byMode).flatMap(([mode, data]) =>
        _formatStats(`${mode} Mode Renders`, data.statistics)
      ),
      '',
      '─── MODULE RENDERING ───',
      ...Object.entries(rep.modules).flatMap(([module, data]) =>
        _formatStats(module, data.statistics)
      ),
      '',
      '─── KPI CALCULATIONS ───',
      ...(_formatStats('KPI Engine', rep.kpi.statistics)),
      '',
      '─── TABLE OPERATIONS ───',
      ...Object.entries(rep.table.byOperation).flatMap(([op, stats]) =>
        _formatStats(`${op}`, stats)
      ),
      '',
      '─── SLOW OPERATIONS (Last 10) ───',
      ..._formatSlowOps(rep),
      '',
      '═══════════════════════════════════════════════════════════'
    ];

    return lines.join('\n');
  };

  /**
   * Format statistics for display
   * @private
   */
  const _formatStats = (label, stats) => {
    if (!stats) {
      return [`${label}: No data`];
    }

    return [
      `${label}:`,
      `  Count: ${stats.count}`,
      `  Avg: ${stats.avg}ms | Min: ${stats.min}ms | Max: ${stats.max}ms | Median: ${stats.median}ms`,
      `  Slow: ${stats.slowCount} (${stats.slowPercent}%)`
    ];
  };

  /**
   * Format slow operations
   * @private
   */
  const _formatSlowOps = (report) => {
    const slowOps = [
      ...report.renders.slowRenders.map(r => ({ type: 'render', label: `${r.mode}`, duration: r.duration })),
      ...report.kpi.slowCalculations.map(k => ({ type: 'KPI', label: 'calculation', duration: k.duration })),
      ...report.table.slowOperations.map(t => ({ type: 'table', label: t.operation, duration: t.duration }))
    ].sort((a, b) => b.duration - a.duration).slice(0, 10);

    if (slowOps.length === 0) {
      return ['  (No slow operations detected)'];
    }

    return slowOps.map(op => `  ${op.type.padEnd(10)} - ${op.label.padEnd(20)}: ${op.duration.toFixed(2)}ms`);
  };

  /**
   * Reset all metrics
   */
  const reset = () => {
    metrics.renders = [];
    metrics.kpiCalculations = [];
    metrics.tableOperations = [];
    metrics.moduleRenders = {};
    metrics.events = [];
    metrics.custom = {};
    activeTimers.clear();
  };

  /**
   * Get current metrics snapshot
   */
  const getMetrics = () => {
    return JSON.parse(JSON.stringify(metrics)); // Deep copy
  };

  /**
   * Debug utility
   */
  const debug = () => {
    return {
      config: CONFIG,
      activeTimers: activeTimers.size,
      metricsCount: {
        renders: metrics.renders.length,
        kpi: metrics.kpiCalculations.length,
        table: metrics.tableOperations.length,
        modules: Object.keys(metrics.moduleRenders).length,
        events: metrics.events.length
      }
    };
  };

  // Public API
  return {
    // Timer operations
    startTimer: startTimer,
    endTimer: endTimer,

    // Recording operations
    recordRender: recordRender,
    recordModuleRender: recordModuleRender,
    recordKPICalculation: recordKPICalculation,
    recordTableOperation: recordTableOperation,
    recordEvent: recordEvent,

    // Reporting
    report: report,
    textReport: textReport,
    getMetrics: getMetrics,

    // Management
    reset: reset,
    debug: debug,

    // Configuration
    enable: () => { CONFIG.enabled = true; },
    disable: () => { CONFIG.enabled = false; },
    setSlowThreshold: (ms) => { CONFIG.slowThreshold = ms; }
  };
})();

// Export to global
window.Profiler = Profiler;
