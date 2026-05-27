// =============================================================================
// BIMSchemaRegistry — Semantic field metadata registry
// =============================================================================

'use strict';

const BIMSchemaRegistry = (() => {
    const _fields = new Map();
    const _aliasToKey = new Map();

    const _normalize = (raw) => String(raw || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .trim();

    const _defaults = {
        instance: { label: 'Nome', category: 'coordination', type: 'string', unit: '', aggregatable: false, filterable: true, chartable: false, queryable: true, visibleByDefault: true, sortable: true, aliases: ['nome', 'instancia'] },
        ifc: { label: 'Classe IFC', category: 'ifc', type: 'enum', unit: '', aggregatable: false, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true, aliases: ['classe_ifc', 'ifc_class'] },
        tag: { label: 'Etiqueta', category: 'coordination', type: 'enum', unit: '', aggregatable: false, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true, aliases: ['etiqueta'] },
        storey: { label: 'Pavimento', category: 'coordination', type: 'enum', unit: '', aggregatable: false, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true, aliases: ['pavimento'] },
        material: { label: 'Material', category: 'commercial', type: 'enum', unit: '', aggregatable: false, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true },

        metro_linear_total: { label: 'Metro Linear', category: 'geometry', type: 'length', unit: 'm', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true, aliases: ['comprimento', 'metro_linear'] },
        comprimento: { label: 'Comprimento', category: 'geometry', type: 'length', unit: 'm', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true },
        len_x: { label: 'Comprimento (X)', category: 'geometry', type: 'length', unit: 'm', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true },
        len_y: { label: 'Comprimento (Y)', category: 'geometry', type: 'length', unit: 'm', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true },
        len_z: { label: 'Comprimento (Z)', category: 'geometry', type: 'length', unit: 'm', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true },

        area: { label: 'Area', category: 'geometry', type: 'area', unit: 'm²', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true },
        area_total: { label: 'Area Total', category: 'geometry', type: 'area', unit: 'm²', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true, aliases: ['area'] },
        area_xy: { label: 'Area (X*Y)', category: 'geometry', type: 'area', unit: 'm²', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true },
        area_xz: { label: 'Area (X*Z)', category: 'geometry', type: 'area', unit: 'm²', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true },

        volume: { label: 'Volume', category: 'geometry', type: 'volume', unit: 'm³', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true },
        volume_total: { label: 'Volume Total', category: 'geometry', type: 'volume', unit: 'm³', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true, aliases: ['volume'] },

        quantity: { label: 'Quantidade', category: 'commercial', type: 'number', unit: 'un', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true, aliases: ['quantidade'] },
        quantidade: { label: 'Quantidade', category: 'commercial', type: 'number', unit: 'un', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true },
        total: { label: 'Total', category: 'commercial', type: 'currency', unit: 'R$', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true },
        price: { label: 'Preco Unitario', category: 'commercial', type: 'currency', unit: 'R$', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true, aliases: ['preco_unitario'] },

        owner: { label: 'Proprietario', category: 'coordination', type: 'string', unit: '', aggregatable: false, filterable: true, chartable: false, queryable: true, visibleByDefault: false, sortable: true },
        status: { label: 'Estado', category: 'coordination', type: 'enum', unit: '', aggregatable: false, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true },
        url: { label: 'Link', category: 'coordination', type: 'string', unit: '', aggregatable: false, filterable: true, chartable: false, queryable: true, visibleByDefault: false, sortable: false },
        image: { label: 'Imagem', category: 'coordination', type: 'image', unit: '', aggregatable: false, filterable: false, chartable: false, queryable: false, visibleByDefault: false, sortable: false }
    };

    const _metaFromKey = (key) => {
        const n = _normalize(key);

        if (n.includes('fire_rating') || n.includes('firerating')) {
            return { category: 'ifc', type: 'enum', unit: '', aggregatable: false, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true };
        }

        if (n.includes('ifc') || n.includes('guid')) {
            return { category: 'ifc', type: 'string', unit: '', aggregatable: false, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true };
        }

        if (n.includes('price') || n.includes('cost') || n === 'total' || n.includes('custo')) {
            return { category: 'commercial', type: 'currency', unit: 'R$', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true };
        }

        if (n.includes('area')) {
            return { category: 'geometry', type: 'area', unit: 'm²', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true };
        }

        if (n.includes('volume')) {
            return { category: 'geometry', type: 'volume', unit: 'm³', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true };
        }

        if (n.includes('len_') || n.includes('metro_linear') || n.includes('comprimento')) {
            return { category: 'geometry', type: 'length', unit: 'm', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true };
        }

        if (n.includes('weight') || n.includes('peso')) {
            return { category: 'commercial', type: 'number', unit: 'kg', aggregatable: true, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true };
        }

        if (n.includes('material')) {
            return { category: 'commercial', type: 'enum', unit: '', aggregatable: false, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true };
        }

        if (n.includes('tag') || n.includes('storey') || n.includes('owner') || n.includes('status')) {
            return { category: 'coordination', type: 'string', unit: '', aggregatable: false, filterable: true, chartable: true, queryable: true, visibleByDefault: true, sortable: true };
        }

        return { category: 'custom', type: 'string', unit: '', aggregatable: false, filterable: true, chartable: true, queryable: true, visibleByDefault: false, sortable: true };
    };

    const _registerAlias = (alias, key) => {
        const token = _normalize(alias);
        if (!token || !key) { return; }
        _aliasToKey.set(token, key);
    };

    const registerField = (key, metadata = {}) => {
        const raw = String(key || '').trim();
        if (!raw) { return false; }

        const normalized = _normalize(raw);
        const base = _fields.get(raw) || _fields.get(normalized) || _defaults[raw] || _defaults[normalized] || _metaFromKey(raw);

        const merged = {
            key: raw,
            label: metadata.label || base.label || raw,
            category: metadata.category || base.category || 'custom',
            type: metadata.type || base.type || 'string',
            unit: Object.prototype.hasOwnProperty.call(metadata, 'unit') ? metadata.unit : (base.unit || ''),
            aggregatable: Object.prototype.hasOwnProperty.call(metadata, 'aggregatable') ? !!metadata.aggregatable : !!base.aggregatable,
            filterable: Object.prototype.hasOwnProperty.call(metadata, 'filterable') ? !!metadata.filterable : true,
            chartable: Object.prototype.hasOwnProperty.call(metadata, 'chartable') ? !!metadata.chartable : (Object.prototype.hasOwnProperty.call(base, 'chartable') ? !!base.chartable : true),
            queryable: Object.prototype.hasOwnProperty.call(metadata, 'queryable') ? !!metadata.queryable : (Object.prototype.hasOwnProperty.call(base, 'queryable') ? !!base.queryable : true),
            visibleByDefault: Object.prototype.hasOwnProperty.call(metadata, 'visibleByDefault') ? !!metadata.visibleByDefault : !!base.visibleByDefault,
            sortable: Object.prototype.hasOwnProperty.call(metadata, 'sortable') ? !!metadata.sortable : true,
            property: metadata.property || base.property || '',
            aliases: Array.isArray(metadata.aliases)
                ? metadata.aliases.slice()
                : (Array.isArray(base.aliases) ? base.aliases.slice() : [])
        };

        _fields.set(raw, merged);
        _fields.set(normalized, merged);
        _registerAlias(raw, raw);
        _registerAlias(merged.label, raw);
        if (merged.property) { _registerAlias(merged.property, raw); }
        merged.aliases.forEach((alias) => _registerAlias(alias, raw));
        return true;
    };

    const bootstrapDefaults = () => {
        Object.keys(_defaults).forEach((key) => {
            registerField(key, _defaults[key]);
        });
    };

    const mergeDynamicSchema = (dynamicMap) => {
        const source = dynamicMap || {};
        Object.keys(source).forEach((key) => {
            const item = source[key] || {};
            registerField(key, {
                label: item.label || key,
                category: item.category,
                type: item.type,
                unit: item.unit,
                aggregatable: item.aggregatable,
                filterable: item.filterable,
                chartable: item.chartable,
                queryable: item.queryable,
                visibleByDefault: item.visibleByDefault,
                sortable: item.sortable,
                property: item.property,
                aliases: item.aliases
            });
        });
    };

    const resolveFieldKey = (raw) => {
        const token = _normalize(raw);
        if (!token) { return ''; }

        if (_aliasToKey.has(token)) {
            return _aliasToKey.get(token);
        }

        if (_fields.has(token)) {
            return _fields.get(token).key;
        }

        const inferred = _metaFromKey(raw);
        registerField(raw, inferred);
        return String(raw || '').trim();
    };

    const getField = (key) => {
        const raw = String(key || '').trim();
        if (!raw) { return null; }

        if (_fields.has(raw)) { return _fields.get(raw); }

        const resolved = resolveFieldKey(raw);
        if (resolved && _fields.has(resolved)) { return _fields.get(resolved); }

        const normalized = _normalize(raw);
        if (_fields.has(normalized)) { return _fields.get(normalized); }

        const inferred = _metaFromKey(raw);
        registerField(raw, inferred);
        return _fields.get(raw);
    };

    const listFields = (options = {}) => {
        const category = options.category ? String(options.category).toLowerCase() : '';
        const onlyChartable = !!options.chartable;
        const onlyQueryable = !!options.queryable;
        const onlyFilterable = !!options.filterable;
        const list = [];
        const seen = new Set();

        _fields.forEach((field) => {
            if (!field || !field.key) { return; }
            const signature = _normalize(field.key);
            if (seen.has(signature)) { return; }
            seen.add(signature);

            if (category && String(field.category || '').toLowerCase() !== category) { return; }
            if (onlyChartable && !field.chartable) { return; }
            if (onlyQueryable && !field.queryable) { return; }
            if (onlyFilterable && !field.filterable) { return; }
            list.push(field);
        });

        return list.sort((a, b) => String(a.label || a.key).localeCompare(String(b.label || b.key)));
    };

    bootstrapDefaults();

    return {
        registerField,
        mergeDynamicSchema,
        resolveFieldKey,
        getField,
        listFields
    };
})();

window.BIMSchemaRegistry = BIMSchemaRegistry;
