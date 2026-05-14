'use strict';

const RelatorioDataLoader = (() => {
    const JSON_CANDIDATES = {
        elements: [
            '../json/elements.json',
            './json/elements.json',
            '../../json/elements.json'
        ],
        groups: [
            '../json/groups.json',
            './json/groups.json',
            '../../json/groups.json'
        ],
        summary: [
            '../json/summary.json',
            './json/summary.json',
            '../../json/summary.json'
        ]
    };

    const DEFAULT_SETTINGS = {
        round_length: '0.00',
        format_length: 'm',
        round_area: '0.00',
        format_area: 'm²',
        round_volume: '0.000',
        format_volume: 'm³',
        decimal_separator: '.',
        concrete_cover_thickness_m: 0.05,
        slab_mode: 'nervurada',
        slab_ribbed_factor_m: 0.10,
        concrete_density_kg_m3: 2500.0,
        concrete_cost_per_m3: 0.0,
        eps_cost_per_m3: 0.0
    };

    const STRUCTURE_TYPES = new Set([
        'IFCPROJECT',
        'IFCSITE',
        'IFCBUILDING',
        'IFCBUILDINGSTOREY',
        'IFCSPACE',
        'IFCZONE',
        'IFCGRID',
        'IFCANNOTATION'
    ]);

    let cache = null;
    let cacheTimestamp = 0;

    function toSafeNumber(value) {
        return Number.isFinite(Number(value)) ? Number(value) : 0;
    }

    function normalizeIfcType(value) {
        return String(value || 'IfcBuildingElementProxy');
    }

    function loadJsonWithFallback(paths) {
        let attempt = 0;

        const loadNext = () => {
            if (attempt >= paths.length) {
                return Promise.reject(new Error('JSON não encontrado em nenhum caminho candidato'));
            }

            const target = paths[attempt++];
            return fetch(target, { cache: 'no-store' }).then(response => {
                if (!response.ok) {
                    throw new Error('Falha ao carregar ' + target + ' (' + response.status + ')');
                }
                return response.json();
            }).catch(() => loadNext());
        };

        return loadNext();
    }

    function emitEvent(name, payload) {
        if (window.EventBus && window.EventBus.Events) {
            window.EventBus.emit(name, payload);
        }
    }

    function buildRows(elements) {
        return (Array.isArray(elements) ? elements : []).map((element, index) => {
            const ifcType = normalizeIfcType(element.type);
            const level = element.level || 'Sem pavimento';
            const quantity = 1;
            const area = toSafeNumber(element.area);
            const volume = toSafeNumber(element.volume);

            return {
                ordinal: index + 1,
                id: String(element.id || ''),
                entity: String(element.id || ''),
                definition: String(element.name || ifcType),
                instance: String(element.name || ifcType),
                description: String(element.name || ifcType),
                material: element.material || '-',
                storey: String(level),
                ifc: ifcType,
                tag: String(ifcType).toUpperCase(),
                tipo: ifcType,
                quantidade: quantity,
                quantity,
                area,
                volume,
                area_total: area,
                volume_total: volume,
                metro_linear_total: 0,
                total: 0,
                is_group: false
            };
        });
    }

    function buildIfcSummary(elements, groups, summary) {
        const allElements = Array.isArray(elements) ? elements : [];
        const summaryByType = summary && summary.by_type ? summary.by_type : {};
        const groupList = Array.isArray(groups) ? groups : [];

        const rows = Object.keys(summaryByType).map(ifc => ({
            ifc,
            quantity: toSafeNumber(summaryByType[ifc])
        }));

        const physicalElements = [];
        const ifcStructure = [];
        const otherTypes = [];

        rows.forEach(row => {
            const normalized = String(row.ifc || '').toUpperCase();
            if (STRUCTURE_TYPES.has(normalized)) {
                ifcStructure.push(row);
            } else if (normalized.startsWith('IFC')) {
                physicalElements.push(row);
            } else {
                otherTypes.push(row);
            }
        });

        const porPavimentoMap = new Map();
        allElements.forEach(element => {
            const pav = String(element.level || 'Sem pavimento');
            if (!porPavimentoMap.has(pav)) {
                porPavimentoMap.set(pav, new Map());
            }
            const bucket = porPavimentoMap.get(pav);
            const ifcType = normalizeIfcType(element.type);
            const prev = bucket.get(ifcType) || { quantidade: 0, metro_linear_m: 0, area_m2: 0, volume_m3: 0 };

            prev.quantidade += 1;
            prev.area_m2 += toSafeNumber(element.area);
            prev.volume_m3 += toSafeNumber(element.volume);
            bucket.set(ifcType, prev);
        });

        const por_pavimento = Array.from(porPavimentoMap.entries()).map(([pavimento, typeMap]) => ({
            pavimento,
            tipos: Array.from(typeMap.entries()).map(([ifc, values]) => ({
                ifc,
                quantidade: values.quantidade,
                metro_linear_m: values.metro_linear_m,
                area_m2: values.area_m2,
                volume_m3: values.volume_m3
            }))
        }));

        const totals = {
            physical_elements: physicalElements.reduce((acc, row) => acc + row.quantity, 0),
            ifc_structure: ifcStructure.reduce((acc, row) => acc + row.quantity, 0),
            other_types: otherTypes.reduce((acc, row) => acc + row.quantity, 0),
            overall: toSafeNumber(summary && summary.total_elements ? summary.total_elements : allElements.length)
        };

        return {
            physical_elements: physicalElements,
            ifc_structure: ifcStructure,
            other_types: otherTypes,
            por_pavimento,
            totals,
            groups_count: groupList.length
        };
    }

    function buildLayerList(elements) {
        const values = new Set();
        (Array.isArray(elements) ? elements : []).forEach(element => {
            values.add(String(element.type || 'SEM_TAG').toUpperCase());
        });
        return Array.from(values).sort();
    }

    function loadAllJson(options = {}) {
        const useCache = options.useCache !== false;
        if (useCache && cache) {
            return Promise.resolve(cache);
        }

        return Promise.all([
            loadJsonWithFallback(JSON_CANDIDATES.elements),
            loadJsonWithFallback(JSON_CANDIDATES.groups).catch(() => []),
            loadJsonWithFallback(JSON_CANDIDATES.summary).catch(() => ({}))
        ]).then(([elements, groups, summary]) => {
            cache = { elements, groups, summary };
            cacheTimestamp = Date.now();
            return cache;
        });
    }

    function applyToDashboard(payload) {
        if (typeof window.updateData !== 'function') {
            return false;
        }

        const rows = buildRows(payload.elements);
        const layerList = buildLayerList(payload.elements);
        const ifcSummary = buildIfcSummary(payload.elements, payload.groups, payload.summary);

        window.updateData(rows, DEFAULT_SETTINGS, layerList, [], ['material'], ifcSummary);
        window.relatorioDataSource = 'json';

        emitEvent(window.EventBus.Events.DATA_LOADED, {
            source: 'json',
            totalElements: rows.length,
            loadedAt: cacheTimestamp
        });

        emitEvent(window.EventBus.Events.DATA_UPDATED, {
            source: 'json',
            totalElements: rows.length,
            loadedAt: cacheTimestamp
        });

        emitEvent(window.EventBus.Events.UI_LOADING_END, { source: 'json' });
        return true;
    }

    function bootstrapFromJson(options = {}) {
        if (typeof fetch !== 'function') {
            return Promise.resolve(false);
        }

        return loadAllJson(options)
            .then(applyToDashboard)
            .catch(() => false);
    }

    function reloadFromJson() {
        cache = null;
        cacheTimestamp = 0;
        return bootstrapFromJson({ useCache: false });
    }

    function getCacheInfo() {
        return {
            hasCache: !!cache,
            cacheTimestamp
        };
    }

    return {
        bootstrapFromJson,
        reloadFromJson,
        getCacheInfo
    };
})();

window.RelatorioDataLoader = RelatorioDataLoader;