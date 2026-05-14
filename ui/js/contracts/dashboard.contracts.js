/**
 * Dashboard UI Contracts
 * 
 * Purpose: Formal interface definitions for all dashboard modules
 * 
 * Philosophy: 
 * - Modules are products, not functions
 * - Each module has a defined input contract
 * - Validation prevents bugs from data mismatches
 * - Enables independent module testing and evolution
 * 
 * Pattern:
 * - Define contracts declaratively
 * - Validate at module entry points
 * - Fail fast with clear error messages
 * - Development mode: strict validation
 * - Production mode: optional validation
 */

const DashboardContracts = (() => {
  'use strict';

  // Enable/disable validation (development vs production)
  const VALIDATION_ENABLED = true;
  const STRICT_MODE = true; // Fail on invalid data

  /**
   * Contract definition format
   * @typedef {Object} ContractDef
   * @property {string} name - Contract identifier
   * @property {Object} schema - Field definitions
   * @property {string} schema.fieldName - Type and requirements
   * @property {boolean} required - Is field required
   * @property {string} type - Expected type
   * @property {*} default - Default value if missing
   * @property {Function} validate - Custom validator
   */

  // =========================================================================
  // KPI CARDS MODULE CONTRACT
  // =========================================================================

  const KPICardsContract = {
    name: 'KPICardsModule',
    description: 'KPI cards rendering - metrics display for all navigation modes',
    fields: {
      navigation: {
        required: true,
        type: 'object',
        description: 'Navigation state object',
        schema: {
          mode: { required: true, type: 'string', enum: ['GLOBAL', 'TAG', 'ELEMENT'] },
          currentTag: { required: false, type: 'string' },
          currentElement: { required: false, type: 'string' },
          breadcrumb: { required: false, type: 'array' }
        }
      },
      data: {
        required: true,
        type: 'object',
        description: 'Application data state',
        schema: {
          tags: { required: true, type: 'array' },
          rows: { required: false, type: 'array' }
        }
      },
      filters: {
        required: false,
        type: 'object',
        description: 'Active filters',
        schema: {
          search: { required: false, type: 'string' },
          storey: { required: false, type: 'string' }
        }
      }
    },
    example: {
      navigation: {
        mode: 'TAG',
        currentTag: 'PILAR',
        currentElement: null
      },
      data: {
        tags: [],
        rows: []
      },
      filters: {
        search: '',
        storey: null
      }
    }
  };

  // =========================================================================
  // BREADCRUMB MODULE CONTRACT
  // =========================================================================

  const BreadcrumbContract = {
    name: 'BreadcrumbModule',
    description: 'Navigation breadcrumb - shows GLOBAL > TAG > ELEMENT hierarchy',
    fields: {
      navigation: {
        required: true,
        type: 'object',
        description: 'Navigation state',
        schema: {
          mode: { required: true, type: 'string', enum: ['GLOBAL', 'TAG', 'ELEMENT'] },
          currentTag: { required: false, type: 'string' },
          currentElement: { required: false, type: 'string' },
          breadcrumb: { required: false, type: 'array' }
        }
      }
    },
    example: {
      navigation: {
        mode: 'ELEMENT',
        currentTag: 'VIGAS',
        currentElement: 'viga-001',
        breadcrumb: ['GLOBAL', 'VIGAS', 'viga-001']
      }
    }
  };

  // =========================================================================
  // SIDEBAR MODULE CONTRACT
  // =========================================================================

  const SidebarContract = {
    name: 'SidebarModule',
    description: 'Sidebar navigation - tag menu with global option and counts',
    fields: {
      navigation: {
        required: true,
        type: 'object',
        description: 'Navigation state',
        schema: {
          mode: { required: true, type: 'string', enum: ['GLOBAL', 'TAG', 'ELEMENT'] },
          currentTag: { required: false, type: 'string' }
        }
      },
      data: {
        required: true,
        type: 'object',
        description: 'Element data grouped by tags',
        schema: {
          tags: { required: true, type: 'array', description: 'Array of tag objects' }
        }
      }
    },
    example: {
      navigation: {
        mode: 'TAG',
        currentTag: 'PILARES'
      },
      data: {
        tags: [
          { tag: 'PILARES', elementos: [], metro_linear: 100, area: 50 }
        ]
      }
    }
  };

  // =========================================================================
  // DETAILS MODULE CONTRACT
  // =========================================================================

  const DetailsContract = {
    name: 'DetailsModule',
    description: 'Element details panel - detailed properties and metrics display',
    fields: {
      navigation: {
        required: true,
        type: 'object',
        description: 'Navigation state',
        schema: {
          mode: { required: true, type: 'string', enum: ['GLOBAL', 'TAG', 'ELEMENT'] },
          currentTag: { required: true, type: 'string', description: 'Current tag must be set' },
          currentElement: { required: true, type: 'string', description: 'Current element must be set' }
        }
      },
      data: {
        required: true,
        type: 'object',
        description: 'Element data with tag grouping',
        schema: {
          tags: { required: true, type: 'array' }
        }
      }
    },
    example: {
      navigation: {
        mode: 'ELEMENT',
        currentTag: 'PILARES',
        currentElement: 'pilar-001'
      },
      data: {
        tags: [
          {
            tag: 'PILARES',
            elementos: [
              {
                id: 'pilar-001',
                name: 'Pilar A',
                area: 5.5,
                volume: 22.0,
                peso: 55.0,
                custo: 1200
              }
            ]
          }
        ]
      }
    }
  };

  // =========================================================================
  // CONTRACT REGISTRY
  // =========================================================================

  const contractRegistry = {
    KPICardsModule: KPICardsContract,
    BreadcrumbModule: BreadcrumbContract,
    SidebarModule: SidebarContract,
    DetailsModule: DetailsContract
  };

  // =========================================================================
  // VALIDATION ENGINE
  // =========================================================================

  /**
   * Validate data against contract
   * @private
   */
  const _validateType = (value, expectedType) => {
    if (expectedType === 'array') {
      return Array.isArray(value);
    }
    return typeof value === expectedType;
  };

  /**
   * Validate enum values
   * @private
   */
  const _validateEnum = (value, allowedValues) => {
    return allowedValues.includes(value);
  };

  /**
   * Validate nested schema
   * @private
   */
  const _validateSchema = (obj, schema, path = '') => {
    const errors = [];

    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      const fullPath = path ? `${path}.${fieldName}` : fieldName;
      const fieldValue = obj[fieldName];

      // Check required fields
      if (fieldDef.required && (fieldValue === undefined || fieldValue === null)) {
        errors.push(`${fullPath} is required`);
        continue;
      }

      // Skip optional fields if not provided
      if (!fieldDef.required && fieldValue === undefined) {
        continue;
      }

      // Type validation
      if (fieldDef.type && !_validateType(fieldValue, fieldDef.type)) {
        errors.push(`${fullPath} must be ${fieldDef.type}, got ${typeof fieldValue}`);
      }

      // Enum validation
      if (fieldDef.enum && !_validateEnum(fieldValue, fieldDef.enum)) {
        errors.push(`${fullPath} must be one of [${fieldDef.enum.join(', ')}], got ${fieldValue}`);
      }

      // Nested schema validation
      if (fieldDef.schema && fieldValue && typeof fieldValue === 'object') {
        const nestedErrors = _validateSchema(fieldValue, fieldDef.schema, fullPath);
        errors.push(...nestedErrors);
      }
    }

    return errors;
  };

  /**
   * Main validation function
   * @private
   */
  const _validateContract = (moduleName, data) => {
    if (!VALIDATION_ENABLED) {
      return { valid: true };
    }

    const contract = contractRegistry[moduleName];
    if (!contract) {
      return { valid: false, errors: [`Unknown contract: ${moduleName}`] };
    }

    const errors = [];
    const schema = contract.fields;

    // Validate each field
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      const fieldValue = data[fieldName];

      // Required check
      if (fieldDef.required && (fieldValue === undefined || fieldValue === null)) {
        errors.push(`Required field missing: ${fieldName}`);
        continue;
      }

      // Skip optional fields
      if (!fieldDef.required && fieldValue === undefined) {
        continue;
      }

      // Type validation
      if (!_validateType(fieldValue, fieldDef.type)) {
        errors.push(`${fieldName} must be type ${fieldDef.type}, got ${typeof fieldValue}`);
        continue;
      }

      // Nested validation
      if (fieldDef.schema && typeof fieldValue === 'object') {
        const nestedErrors = _validateSchema(fieldValue, fieldDef.schema, fieldName);
        errors.push(...nestedErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors,
      moduleName: moduleName,
      timestamp: new Date().toISOString()
    };
  };

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Validate module input data
   * @param {string} moduleName - Module to validate against
   * @param {Object} data - Input data to validate
   * @returns {Object} Validation result {valid, errors}
   */
  const validate = (moduleName, data) => {
    const result = _validateContract(moduleName, data);

    if (!result.valid && STRICT_MODE) {
      console.error(`❌ Contract Validation Failed: ${moduleName}`, {
        errors: result.errors,
        received: data,
        contract: contractRegistry[moduleName]
      });

      if (STRICT_MODE) {
        throw new Error(`Contract validation failed for ${moduleName}: ${result.errors.join('; ')}`);
      }
    }

    return result;
  };

  /**
   * Get contract definition
   * @param {string} moduleName - Module name
   * @returns {Object} Contract definition
   */
  const getContract = (moduleName) => {
    return contractRegistry[moduleName] || null;
  };

  /**
   * List all contracts
   * @returns {Array} Array of contract definitions
   */
  const listContracts = () => {
    return Object.values(contractRegistry);
  };

  /**
   * Get validation status for all modules
   * @param {Object} state - Application state
   * @returns {Object} Status of all module contracts
   */
  const validateAll = (state) => {
    const results = {};

    for (const [moduleName, contract] of Object.entries(contractRegistry)) {
      // Build test data based on what module needs
      const testData = {};

      if (moduleName === 'KPICardsModule') {
        testData.navigation = state.navigation || { mode: 'GLOBAL' };
        testData.data = state.data || { tags: [], rows: [] };
        testData.filters = state.filters || {};
      } else if (moduleName === 'BreadcrumbModule') {
        testData.navigation = state.navigation || { mode: 'GLOBAL' };
      } else if (moduleName === 'SidebarModule') {
        testData.navigation = state.navigation || { mode: 'GLOBAL' };
        testData.data = state.data || { tags: [] };
      } else if (moduleName === 'DetailsModule') {
        testData.navigation = state.navigation || { mode: 'GLOBAL' };
        testData.data = state.data || { tags: [] };
      }

      results[moduleName] = validate(moduleName, testData);
    }

    return results;
  };

  /**
   * Debug method
   */
  const debug = () => {
    return {
      validationEnabled: VALIDATION_ENABLED,
      strictMode: STRICT_MODE,
      contractCount: Object.keys(contractRegistry).length,
      contracts: Object.keys(contractRegistry)
    };
  };

  // Public API
  return {
    validate: validate,
    validateAll: validateAll,
    getContract: getContract,
    listContracts: listContracts,
    debug: debug,

    // Contract definitions for reference
    KPICardsContract: KPICardsContract,
    BreadcrumbContract: BreadcrumbContract,
    SidebarContract: SidebarContract,
    DetailsContract: DetailsContract
  };
})();

// Export to global
window.DashboardContracts = DashboardContracts;
