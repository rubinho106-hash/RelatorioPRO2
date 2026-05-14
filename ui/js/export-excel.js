'use strict';

function sanitizeForExcel(value) {
  const text = value == null ? '' : String(value);
  // Mitiga formula injection em células de texto.
  return /^[=+\-@]/.test(text) ? ("'" + text) : text;
}

function parseLocalizedNumberDisplay(text) {
  const decSep = localStorage.getItem('decimalSeparator') || '.';
  const thsSep = localStorage.getItem('thousandSeparator') || ',';
  let raw = (text == null ? '' : String(text)).trim();
  if (!raw) { return 0; }

  if (thsSep) {
    raw = raw.split(thsSep).join('');
  }
  if (decSep !== '.') {
    raw = raw.split(decSep).join('.');
  }
  raw = raw.replace(/\s+/g, '');

  const n = parseFloat(raw);
  return isNaN(n) ? 0 : n;
}

function isNumericColumnKey(key) {
  if (!key) { return false; }
  return key.includes('len') || key.includes('area') || key.includes('volume') ||
    key === 'price' || key === 'quantity' || key === 'total' ||
    key === 'quantidade' || key === 'metro_linear_total' || key === 'comprimento';
}

function excelColumnLetter(indexZeroBased) {
  let n = indexZeroBased + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - m) / 26);
  }
  return s;
}

function summarizeUnits(selectedColumns) {
  const lengthUnits = selectedColumns.filter(c => c.key.includes('len') || c.key === 'comprimento' || c.key === 'metro_linear_total').map(c => c.unit).filter(Boolean);
  const areaUnits = selectedColumns.filter(c => c.key.includes('area')).map(c => c.unit).filter(Boolean);
  const volumeUnits = selectedColumns.filter(c => c.key.includes('volume')).map(c => c.unit).filter(Boolean);

  const uniq = arr => Array.from(new Set(arr));
  const lu = uniq(lengthUnits).join(', ') || '-';
  const au = uniq(areaUnits).join(', ') || '-';
  const vu = uniq(volumeUnits).join(', ') || '-';
  return `Comprimento: ${lu} | Area: ${au} | Volume: ${vu}`;
}

function readGroupMetric(row, key) {
  const cell = row.querySelector(`td[id$="-${key}"]`);
  if (!cell) { return 0; }
  return parseLocalizedNumberDisplay(cell.textContent || '0');
}

function readGroupText(row, key) {
  const cell = row.querySelector(`td[id$="-${key}"]`);
  return (cell ? (cell.textContent || '') : '').trim();
}

function normalizeTipoFromRow(row) {
  const raw = readGroupText(row, 'tipo').toUpperCase();
  if (raw.includes('VIGA')) { return 'Viga'; }
  if (raw.includes('PILAR')) { return 'Pilar'; }
  if (raw.includes('LAJE')) { return 'Laje'; }
  if (raw.includes('FUND')) { return 'Fundacao'; }

  const ifc = readGroupText(row, 'ifc').toUpperCase();
  if (ifc.includes('BEAM')) { return 'Viga'; }
  if (ifc.includes('COLUMN')) { return 'Pilar'; }
  if (ifc.includes('SLAB')) { return 'Laje'; }
  if (ifc.includes('FOOTING') || ifc.includes('PILE')) { return 'Fundacao'; }
  return 'Outro';
}

function buildStructuralSummary(groupRows) {
  const resumo = {
    vigas_m: 0,
    pilares_m: 0,
    lajes_m2: 0,
    fundacoes_qtd: 0,
    byStorey: {}
  };

  groupRows.forEach(function (row) {
    if (row.style.display === 'none') { return; }

    const tipo = normalizeTipoFromRow(row);
    const storeyRaw = readGroupText(row, 'storey');
    const storey = storeyRaw || 'SEM PAVIMENTO';

    const ml = readGroupMetric(row, 'metro_linear_total');
    const area = readGroupMetric(row, 'area_total');
    const qtd = readGroupMetric(row, 'quantidade') || readGroupMetric(row, 'quantity');

    if (!resumo.byStorey[storey]) {
      resumo.byStorey[storey] = { vigas_m: 0, pilares_m: 0, lajes_m2: 0, fundacoes_qtd: 0 };
    }
    const bucket = resumo.byStorey[storey];

    if (tipo === 'Viga') {
      resumo.vigas_m += ml;
      bucket.vigas_m += ml;
    } else if (tipo === 'Pilar') {
      resumo.pilares_m += ml;
      bucket.pilares_m += ml;
    } else if (tipo === 'Laje') {
      resumo.lajes_m2 += area;
      bucket.lajes_m2 += area;
    } else if (tipo === 'Fundacao') {
      resumo.fundacoes_qtd += qtd;
      bucket.fundacoes_qtd += qtd;
    }
  });

  return resumo;
}

function appendStructuralSummarySheet(workbook, groupRows) {
  const s = buildStructuralSummary(groupRows);
  const aoa = [];

  aoa.push(['Resumo Estrutural', '', '']);
  aoa.push(['Data', new Date().toLocaleString(), '']);
  aoa.push([]);
  aoa.push(['Elemento', 'Valor', 'Unidade']);
  aoa.push(['Vigas', s.vigas_m, 'm']);
  aoa.push(['Pilares', s.pilares_m, 'm']);
  aoa.push(['Lajes', s.lajes_m2, 'm²']);
  aoa.push(['Fundacoes', s.fundacoes_qtd, 'un']);

  const storeys = Object.keys(s.byStorey).sort();
  if (storeys.length > 0) {
    aoa.push([]);
    aoa.push(['Resumo por Pavimento', '', '']);
    aoa.push(['Pavimento', 'Vigas (m)', 'Pilares (m)', 'Lajes (m²)', 'Fundacoes (un)']);

    storeys.forEach(function (storey) {
      const v = s.byStorey[storey];
      aoa.push([storey, v.vigas_m, v.pilares_m, v.lajes_m2, v.fundacoes_qtd]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(workbook, ws, 'Resumo_Estrutural');
}

function ifcGroupFromRow(row) {
  const ifc = readGroupText(row, 'ifc').toUpperCase();
  if (!ifc) { return 'other'; }

  if (ifc.includes('WALL') || ifc.includes('CURTAINWALL')) {
    return 'wall';
  }

  if (ifc.includes('ROOF') || ifc.includes('COVERING')) {
    return 'roof';
  }

  return 'other';
}

function buildIfcAreaSummary(groupRows, targetGroup) {
  const resumo = {
    total_area_m2: 0,
    total_quantidade: 0,
    byStorey: {},
    rows: []
  };

  groupRows.forEach(function (row) {
    if (row.style.display === 'none') { return; }
    if (ifcGroupFromRow(row) !== targetGroup) { return; }

    const storeyRaw = readGroupText(row, 'storey');
    const storey = storeyRaw || 'SEM PAVIMENTO';
    const ifc = readGroupText(row, 'ifc');
    const tipo = readGroupText(row, 'tipo');
    const secao = readGroupText(row, 'secao');
    const area = readGroupMetric(row, 'area_total');
    const quantidade = readGroupMetric(row, 'quantidade') || readGroupMetric(row, 'quantity');

    resumo.total_area_m2 += area;
    resumo.total_quantidade += quantidade;

    if (!resumo.byStorey[storey]) {
      resumo.byStorey[storey] = { area_m2: 0, quantidade: 0 };
    }
    resumo.byStorey[storey].area_m2 += area;
    resumo.byStorey[storey].quantidade += quantidade;

    resumo.rows.push({
      storey: storey,
      ifc: ifc,
      tipo: tipo,
      secao: secao,
      quantidade: quantidade,
      area_m2: area
    });
  });

  return resumo;
}

function appendIfcAreaSummarySheet(workbook, groupRows, targetGroup, sheetName, title) {
  const s = buildIfcAreaSummary(groupRows, targetGroup);
  if (!s.rows.length) { return; }

  const aoa = [];
  aoa.push([title, '', '']);
  aoa.push(['Data', new Date().toLocaleString(), '']);
  aoa.push([]);
  aoa.push(['Indicador', 'Valor', 'Unidade']);
  aoa.push(['Area Total', s.total_area_m2, 'm²']);
  aoa.push(['Quantidade Total', s.total_quantidade, 'un']);

  const storeys = Object.keys(s.byStorey).sort();
  if (storeys.length > 0) {
    aoa.push([]);
    aoa.push(['Resumo por Pavimento', '', '']);
    aoa.push(['Pavimento', 'Area (m²)', 'Quantidade']);

    storeys.forEach(function (storey) {
      const v = s.byStorey[storey];
      aoa.push([storey, v.area_m2, v.quantidade]);
    });
  }

  aoa.push([]);
  aoa.push(['Detalhamento', '', '', '', '', '']);
  aoa.push(['Pavimento', 'IFC', 'Tipo', 'Secao', 'Quantidade', 'Area (m²)']);
  s.rows.forEach(function (row) {
    aoa.push([row.storey, row.ifc, row.tipo, row.secao, row.quantidade, row.area_m2]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(workbook, ws, sheetName);
}

function appendEnvelopeSummarySheet(workbook, groupRows) {
  const walls = buildIfcAreaSummary(groupRows, 'wall');
  const roofs = buildIfcAreaSummary(groupRows, 'roof');

  if (!walls.rows.length && !roofs.rows.length) { return; }

  const allStoreys = Array.from(new Set(
    Object.keys(walls.byStorey).concat(Object.keys(roofs.byStorey))
  )).sort();

  const wallArea = walls.total_area_m2 || 0;
  const roofArea = roofs.total_area_m2 || 0;
  const wallQty = walls.total_quantidade || 0;
  const roofQty = roofs.total_quantidade || 0;

  const aoa = [];
  aoa.push(['Resumo Envelope', '', '']);
  aoa.push(['Data', new Date().toLocaleString(), '']);
  aoa.push([]);
  aoa.push(['Categoria', 'Area (m²)', 'Quantidade']);
  aoa.push(['Paredes', wallArea, wallQty]);
  aoa.push(['Coberturas', roofArea, roofQty]);
  aoa.push(['TOTAL Envelope', wallArea + roofArea, wallQty + roofQty]);

  if (allStoreys.length > 0) {
    aoa.push([]);
    aoa.push(['Resumo por Pavimento', '', '', '', '']);
    aoa.push(['Pavimento', 'Paredes (m²)', 'Coberturas (m²)', 'Envelope (m²)', 'Quantidade']);

    allStoreys.forEach(function (storey) {
      const wall = walls.byStorey[storey] || { area_m2: 0, quantidade: 0 };
      const roof = roofs.byStorey[storey] || { area_m2: 0, quantidade: 0 };
      aoa.push([
        storey,
        wall.area_m2,
        roof.area_m2,
        wall.area_m2 + roof.area_m2,
        wall.quantidade + roof.quantidade
      ]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(workbook, ws, 'Resumo_Envelope');
}

function appendIfcStoreySheetFromSummary(workbook, summary) {
  const storeyListRaw = summary && Array.isArray(summary.por_pavimento) ? summary.por_pavimento : [];
  const storeyList = typeof window.relatorioSortStoreys === 'function'
    ? window.relatorioSortStoreys(storeyListRaw)
    : storeyListRaw.slice();
  if (storeyList.length === 0) { return; }

  const ifcDisplayLabel = function (ifcType) {
    const map = {
      IfcBeam: 'Vigas',
      IfcColumn: 'Pilares',
      IfcSlab: 'Lajes',
      IfcFooting: 'Fundacoes',
      IfcPile: 'Fundacoes',
      IfcWall: 'Paredes',
      IfcWallStandardCase: 'Paredes',
      IfcRoof: 'Coberturas',
      IfcCovering: 'Coberturas'
    };
    const key = ifcType == null ? '' : String(ifcType);
    return map[key] || key;
  };

  const aoa = [];
  aoa.push(['Resumo por Pavimento (IFC)', '', '', '', '']);
  aoa.push(['Data', new Date().toLocaleString(), '', '', '']);
  aoa.push([]);
  aoa.push(['Pavimento', 'IFC', 'Quantidade', 'Metro Linear (m)', 'Area (m²)']);

  storeyList.forEach(function (storeyBucket) {
    const storey = storeyBucket && storeyBucket.storey ? String(storeyBucket.storey) : 'SEM PAVIMENTO';
    const tipos = storeyBucket && Array.isArray(storeyBucket.tipos) ? storeyBucket.tipos : [];
    let subtotalQtd = 0;
    let subtotalMl = 0;
    let subtotalArea = 0;

    if (tipos.length === 0) {
      aoa.push([storey, '-', 0, 0, 0]);
      return;
    }

    tipos.forEach(function (item) {
      const qtd = Number(item && item.quantidade ? item.quantidade : 0);
      const ml = Number(item && item.metro_linear_m ? item.metro_linear_m : 0);
      const area = Number(item && item.area_m2 ? item.area_m2 : 0);

      subtotalQtd += qtd;
      subtotalMl += ml;
      subtotalArea += area;

      aoa.push([
        storey,
        ifcDisplayLabel(item && item.ifc ? String(item.ifc) : ''),
        qtd,
        ml,
        area
      ]);
    });

    aoa.push([storey, 'TOTAL', subtotalQtd, subtotalMl, subtotalArea]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(workbook, ws, 'Por_Pavimento');
}

function groupedModeExport(table, workbook) {
  const groupRows = Array.from(table.querySelectorAll('tbody tr[data-group-row="1"]'));
  if (groupRows.length === 0) { return false; }

  const headerCells = Array.from(table.querySelectorAll('thead tr:first-child th'));
  const checkboxes = document.querySelectorAll("#selectColumns input[type='checkbox']");
  const extraRow = table.querySelector("#extra");
  const extraCells = extraRow ? extraRow.getElementsByTagName('td') : [];

  const selectedColumns = [];
  const header = [];
  for (let i = 0; i < headerCells.length; i++) {
    const checkbox = checkboxes[i];
    if (!checkbox || !checkbox.checked) { continue; }
    const unitCell = extraCells[i];
    const unitText = unitCell ? unitCell.textContent : '';
    const key = (headerCells[i].id || '').trim();
    const label = headerWithUnit(headerCells[i], unitText);
    selectedColumns.push({ index: i, key: key, label: label, unit: unitText });
    header.push(label);
  }

  const summary = [];
  summary.push(['Projeto', document.title || 'RelatorioPRO']);
  summary.push(['Data', new Date().toLocaleString()]);
  summary.push(['Unidades', summarizeUnits(selectedColumns)]);
  summary.push([]);
  summary.push(header);

  groupRows.forEach(function (row) {
    if (row.style.display === 'none') { return; }
    const cells = row.getElementsByTagName('td');
    const line = [];
    selectedColumns.forEach(function (col) {
      const cell = cells[col.index];
      const text = cell ? (cell.textContent || '') : '';
      if (isNumericColumnKey(col.key)) {
        line.push(parseLocalizedNumberDisplay(text));
      } else {
        line.push(sanitizeForExcel(text));
      }
    });
    if (line.length > 0) { summary.push(line); }
  });

  const headerRowIndex = 4; // 0-based after 3 metadata rows + blank line
  const dataStart = headerRowIndex + 1;
  const dataEnd = summary.length - 1;
  if (dataEnd >= dataStart) {
    const totals = new Array(header.length).fill('');
    if (totals.length > 0) { totals[0] = 'TOTAL'; }

    selectedColumns.forEach(function (col, idx) {
      if (!isNumericColumnKey(col.key)) { return; }
      const colLetter = excelColumnLetter(idx);
      const startRow = dataStart + 1;
      const endRow = dataEnd + 1;
      totals[idx] = { t: 'n', f: `SUM(${colLetter}${startRow}:${colLetter}${endRow})` };
    });

    summary.push(totals);
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  XLSX.utils.book_append_sheet(workbook, wsSummary, "Resumo_Grupos");

  const details = [["group_id", "instance_id"]];
  groupRows.forEach(function (row) {
    const gid = row.getAttribute('data-row-id') || '';
    const serialized = row.getAttribute('data-instancias') || '[]';
    let ids = [];
    try {
      ids = JSON.parse(serialized);
    } catch (_) {
      ids = [];
    }

    ids.forEach(function (id) {
      details.push([gid, sanitizeForExcel(String(id))]);
    });
  });

  const wsDetails = XLSX.utils.aoa_to_sheet(details);
  XLSX.utils.book_append_sheet(workbook, wsDetails, "Instancias");

  appendStructuralSummarySheet(workbook, groupRows);
  appendIfcAreaSummarySheet(workbook, groupRows, 'wall', 'Resumo_Paredes', 'Resumo de Paredes');
  appendIfcAreaSummarySheet(workbook, groupRows, 'roof', 'Resumo_Coberturas', 'Resumo de Coberturas');
  appendEnvelopeSummarySheet(workbook, groupRows);
  appendIfcStoreySheetFromSummary(workbook, window.relatorioIfcSummary);
  return true;
}

function headerWithUnit(headerCell, unitText) {
  const base = (headerCell.textContent || '').trim();
  const key = (headerCell.id || '').trim();
  const unit = (unitText || '').trim();
  if (!base) { return base; }

  if ((key.includes('len') || key.includes('area') || key === 'volume' || key === 'price') && unit) {
    return `${base} (${unit})`;
  }

  return base;
}

function appendTagDashboardSheets(workbook) {
  let model = window.relatorioTagDashboard;
  
  // Fallback 1: tentar buildTagModel complexo
  if ((!model || !Array.isArray(model.tags)) && typeof window.relatorioBuildTagModel === 'function') {
    model = window.relatorioBuildTagModel(window.relatorioRowsSource || [], window.relatorioLayerList || []);
  }
  
  // ✅ CORREÇÃO 5: Fallback 2 EXPANDIDO - usar tagModel simples com volume e ifc_types
  if ((!model || !Array.isArray(model.tags)) && window.tagModel && typeof window.tagModel === 'object') {
    const simpleModel = window.tagModel;
    const tags = Object.keys(simpleModel).map(function (key) {
      const tagData = simpleModel[key];
      const ifcList = Object.keys(tagData.ifc_types || {});
      const totalElementos = Number(tagData.total_elementos || (tagData.elementos || []).length || 0);
      const totalGrupos = Number(tagData.total_grupos || tagData.quantidade || 0);
      const eficiencia = totalElementos > 0 ? ((1 - (totalGrupos / totalElementos)) * 100) : 0;
      return {
        tag: key,
        elements: tagData.elementos || [],
        quantidade: tagData.quantidade || 0,
        total_elementos: totalElementos,
        total_grupos: totalGrupos,
        eficiencia: Number(eficiencia.toFixed(0)),
        total_ml: tagData.metro_linear || 0,
        total_area: tagData.area || 0,
        total_volume: tagData.volume || 0,
        total_eps_volume: tagData.eps_volume || 0,
        concrete_cost: tagData.concrete_cost || 0,
        eps_cost: tagData.eps_cost || 0,
        slab_weight_kg: tagData.slab_weight_kg || 0,
        ifc_types: ifcList.join(', '),
        not_classified: tagData.not_classified || 0,
        mismatches: 0
      };
    });
    const all = {
      quantidade: tags.reduce(function (sum, t) { return sum + (t.quantidade || 0); }, 0),
      total_elementos: tags.reduce(function (sum, t) { return sum + (t.total_elementos || 0); }, 0),
      total_grupos: tags.reduce(function (sum, t) { return sum + (t.total_grupos || 0); }, 0),
      total_ml: tags.reduce(function (sum, t) { return sum + (t.total_ml || 0); }, 0),
      total_area: tags.reduce(function (sum, t) { return sum + (t.total_area || 0); }, 0),
      total_volume: tags.reduce(function (sum, t) { return sum + (t.total_volume || 0); }, 0),
      total_eps_volume: tags.reduce(function (sum, t) { return sum + (t.total_eps_volume || 0); }, 0),
      concrete_cost: tags.reduce(function (sum, t) { return sum + (t.concrete_cost || 0); }, 0),
      eps_cost: tags.reduce(function (sum, t) { return sum + (t.eps_cost || 0); }, 0),
      slab_weight_kg: tags.reduce(function (sum, t) { return sum + (t.slab_weight_kg || 0); }, 0),
      mismatches: 0
    };
    model = { tags: tags, all: all, by_storey: [] };
  }
  
  if (!model || !Array.isArray(model.tags)) { return; }

  const all = model.all || { quantidade: 0, total_elementos: 0, total_grupos: 0, total_ml: 0, total_area: 0, total_volume: 0, total_eps_volume: 0, concrete_cost: 0, eps_cost: 0, slab_weight_kg: 0 };
  const tags = model.tags || [];
  const byStorey = Array.isArray(model.by_storey) ? model.by_storey : [];
  const allElementos = Number(all.total_elementos || 0);
  const allGrupos = Number(all.total_grupos || all.quantidade || 0);
  const allEficiencia = allElementos > 0 ? ((1 - (allGrupos / allElementos)) * 100) : 0;
  const allQualidadeIfc = allElementos > 0 ? ((1 - (Number(all.mismatches || 0) / allElementos)) * 100) : 100;
  let topMlTag = null;
  let topAreaTag = null;

  tags.forEach(function (tag) {
    const valorMl = Number(tag.total_ml || 0);
    const valorArea = Number(tag.total_area || 0);
    if (!topMlTag || valorMl > topMlTag.valor) {
      topMlTag = { tag: String(tag.tag || 'SEM TAG'), valor: valorMl };
    }
    if (!topAreaTag || valorArea > topAreaTag.valor) {
      topAreaTag = { tag: String(tag.tag || 'SEM TAG'), valor: valorArea };
    }
  });

  const topMlLabel = topMlTag ? topMlTag.tag : '-';
  const topMlValue = topMlTag ? Number(topMlTag.valor.toFixed(1)) + ' m' : '-';
  const topAreaLabel = topAreaTag ? topAreaTag.tag : '-';
  const topAreaValue = topAreaTag ? Number(topAreaTag.valor.toFixed(1)) + ' m²' : '-';

  const aoaExecutive = [];
  aoaExecutive.push(['Resumo Executivo do Projeto', '', '', '']);
  aoaExecutive.push(['Data', new Date().toLocaleString(), '', '']);
  aoaExecutive.push([]);
  aoaExecutive.push(['Indicador', 'Valor', 'Unidade', 'Observacao']);
  aoaExecutive.push(['Elementos Totais', allElementos, 'un', 'Instancias reais do modelo']);
  aoaExecutive.push(['Grupos Tecnicos', allGrupos, 'un', 'Agrupamentos para leitura de engenharia']);
  aoaExecutive.push(['Eficiência de Agrupamento', Number(allEficiencia.toFixed(0)), '%', 'Reducao por agrupamento tecnico']);
  aoaExecutive.push(['Metro Linear Total', Number(all.total_ml || 0), 'm', 'Soma consolidada do projeto']);
  aoaExecutive.push(['Area Total', Number(all.total_area || 0), 'm²', 'Soma consolidada do projeto']);
  aoaExecutive.push(['Volume Total', Number(all.total_volume || 0), 'm³', 'Soma consolidada do projeto']);
  aoaExecutive.push(['Volume EPS', Number(all.total_eps_volume || 0), 'm³', 'Volume estimado de vazios EPS']);
  aoaExecutive.push(['Custo Concreto', Number(all.concrete_cost || 0), 'R$', 'Estimativa por volume de concreto']);
  aoaExecutive.push(['Custo EPS', Number(all.eps_cost || 0), 'R$', 'Estimativa por volume de EPS']);
  aoaExecutive.push(['Custo Total', Number((all.concrete_cost || 0) + (all.eps_cost || 0)), 'R$', 'Concreto + EPS']);
  aoaExecutive.push(['Peso Lajes', Number(all.slab_weight_kg || 0), 'kg', 'Peso estimado do concreto em lajes']);
  aoaExecutive.push(['Top TAG (ML)', topMlLabel, 'tag', topMlValue]);
  aoaExecutive.push(['Top TAG (Área)', topAreaLabel, 'tag', topAreaValue]);
  aoaExecutive.push(['Qualidade IFC', Number(allQualidadeIfc.toFixed(0)), '%', 'Consistencia TAG x IFC']);
  aoaExecutive.push(['Inconsistencias TAG x IFC', Number(all.mismatches || 0), 'un', 'Itens que exigem revisao']);

  const wsExecutive = XLSX.utils.aoa_to_sheet(aoaExecutive);
  XLSX.utils.book_append_sheet(workbook, wsExecutive, 'Resumo_Executivo');

  const aoaSummary = [];
  aoaSummary.push(['Dashboard por TAG', '', '', '', '', '', '', '']);
  aoaSummary.push(['Data', new Date().toLocaleString(), '', '', '', '', '', '']);
  aoaSummary.push([]);
  aoaSummary.push(['Indicador', 'Valor', 'Unidade', '', '', '', '', '']);
  aoaSummary.push(['Elementos Totais', allElementos, 'un', '', '', '', '', '']);
  aoaSummary.push(['Grupos Totais', allGrupos, 'un', '', '', '', '', '']);
  aoaSummary.push(['Otimização Total', Number(allEficiencia.toFixed(0)), '%', '', '', '', '', '']);
  aoaSummary.push(['Metro Linear Total', Number(all.total_ml || 0), 'm', '', '', '', '', '']);
  aoaSummary.push(['Area Total', Number(all.total_area || 0), 'm²', '', '', '', '', '']);
  aoaSummary.push(['Volume Total', Number(all.total_volume || 0), 'm³', '', '', '', '', '']);
  aoaSummary.push(['Volume EPS', Number(all.total_eps_volume || 0), 'm³', '', '', '', '', '']);
  aoaSummary.push(['Custo Concreto', Number(all.concrete_cost || 0), 'R$', '', '', '', '', '']);
  aoaSummary.push(['Custo EPS', Number(all.eps_cost || 0), 'R$', '', '', '', '', '']);
  aoaSummary.push(['Custo Total', Number((all.concrete_cost || 0) + (all.eps_cost || 0)), 'R$', '', '', '', '', '']);
  aoaSummary.push(['Peso Lajes', Number(all.slab_weight_kg || 0), 'kg', '', '', '', '', '']);
  aoaSummary.push(['Inconsistencias TAG x IFC', Number(all.mismatches || 0), 'un', '', '', '', '', '']);
  aoaSummary.push([]);
  aoaSummary.push(['TAG', 'Elementos', 'Grupos', 'Otimização (%)', 'Metro Linear (m)', 'Area (m²)', 'Volume (m³)', 'EPS (m³)', 'Custo Concreto (R$)', 'Custo EPS (R$)', 'Peso Lajes (kg)', 'Tipos IFC']);

  tags.forEach(function (tag) {
    const totalElementos = Number(tag.total_elementos || (Array.isArray(tag.elements) ? tag.elements.length : 0));
    const totalGrupos = Number(tag.total_grupos || tag.quantidade || 0);
    const eficiencia = totalElementos > 0 ? ((1 - (totalGrupos / totalElementos)) * 100) : 0;
    aoaSummary.push([
      String(tag.tag || 'SEM TAG'),
      totalElementos,
      totalGrupos,
      Number(eficiencia.toFixed(0)),
      Number(tag.total_ml || 0),
      Number(tag.total_area || 0),
      Number(tag.total_volume || 0),
      Number(tag.total_eps_volume || 0),
      Number(tag.concrete_cost || 0),
      Number(tag.eps_cost || 0),
      Number(tag.slab_weight_kg || 0),
      String(tag.ifc_types || '-')
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(aoaSummary);
  XLSX.utils.book_append_sheet(workbook, wsSummary, 'Dashboard_TAG');

  if (byStorey.length > 0) {
    const aoaStorey = [];
    aoaStorey.push(['Dashboard por Pavimento', '', '', '']);
    aoaStorey.push(['Data', new Date().toLocaleString(), '', '']);
    aoaStorey.push([]);
    aoaStorey.push(['Pavimento', 'Quantidade', 'Metro Linear (m)', 'Area (m²)']);
    byStorey.forEach(function (row) {
      aoaStorey.push([
        String(row.storey || 'SEM PAVIMENTO'),
        Number(row.quantidade || 0),
        Number(row.total_ml || 0),
        Number(row.total_area || 0)
      ]);
    });
    const wsStorey = XLSX.utils.aoa_to_sheet(aoaStorey);
    XLSX.utils.book_append_sheet(workbook, wsStorey, 'TAG_Pavimento');
  }

  const aoaElements = [];
  aoaElements.push(['Detalhamento por TAG', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
  aoaElements.push(['Data', new Date().toLocaleString(), '', '', '', '', '', '', '', '', '', '', '', '', '']);
  aoaElements.push([]);
  aoaElements.push(['TAG', 'Tipo', 'Elementos', 'Grupos', 'Otimização (%)', 'Nome', 'IFC', 'Comprimento (m)', 'Area (m²)', 'Volume (m³)', 'EPS (m³)', 'Custo Concreto (R$)', 'Custo EPS (R$)', 'Peso Laje (kg)', 'Pavimento', 'TagIfcValidacao']);

  tags.forEach(function (tag) {
    const elements = Array.isArray(tag.elements) ? tag.elements : [];
    const totalElementos = Number(tag.total_elementos || elements.length || 0);
    const totalGrupos = Number(tag.total_grupos || tag.quantidade || 0);
    const eficiencia = totalElementos > 0 ? ((1 - (totalGrupos / totalElementos)) * 100) : 0;
    if (elements.length === 0) {
      aoaElements.push([String(tag.tag || 'SEM TAG'), '-', totalElementos, totalGrupos, Number(eficiencia.toFixed(0)), '-', '-', 0, 0, 0, 0, 0, 0, 0, '-', 'OK']);
      return;
    }
    elements.forEach(function (el) {
      const rowElementos = Math.max(1, Math.round(Number(el && (el.quantidade || el.quantity) ? (el.quantidade || el.quantity) : 1)));
      const rowGrupos = (el && el.is_group) ? 1 : rowElementos;
      const rowEficiencia = rowElementos > 0 ? ((1 - (rowGrupos / rowElementos)) * 100) : 0;
      const rowVolume = Number(el && (el.volume_total || el.volume) ? (el.volume_total || el.volume) : 0);
      const rowEps = Number(el && (el.eps_volume_total || el.eps_volume_m3) ? (el.eps_volume_total || el.eps_volume_m3) : 0);
      const rowConcreteCost = Number(el && (el.concrete_cost_total || el.concrete_cost) ? (el.concrete_cost_total || el.concrete_cost) : 0);
      const rowEpsCost = Number(el && (el.eps_cost_total || el.eps_cost) ? (el.eps_cost_total || el.eps_cost) : 0);
      const rowSlabWeight = Number(el && (el.slab_weight_total_kg || el.slab_weight_kg) ? (el.slab_weight_total_kg || el.slab_weight_kg) : 0);
      aoaElements.push([
        String(tag.tag || 'SEM TAG'),
        (el && el.is_group) ? 'Grupo' : 'Elemento',
        rowElementos,
        rowGrupos,
        Number(rowEficiencia.toFixed(0)),
        sanitizeForExcel(el && el.nome ? el.nome : ''),
        sanitizeForExcel(el && el.ifc ? el.ifc : ''),
        Number(el && el.comprimento ? el.comprimento : 0),
        Number(el && el.area ? el.area : 0),
        rowVolume,
        rowEps,
        rowConcreteCost,
        rowEpsCost,
        rowSlabWeight,
        sanitizeForExcel(el && el.pavimento ? el.pavimento : 'SEM PAVIMENTO'),
        (el && el.mismatch) ? 'ERRO_TAG_IFC' : 'OK'
      ]);
    });
  });

  const wsElements = XLSX.utils.aoa_to_sheet(aoaElements);
  XLSX.utils.book_append_sheet(workbook, wsElements, 'TAG_Elementos');
}

function exportTagDashboardExcel() {
  if (typeof XLSX === 'undefined') { return; }
  const model = window.relatorioTagDashboard;
  if (!model) { return; }

  const workbook = XLSX.utils.book_new();
  appendTagDashboardSheets(workbook);

  const excelFile = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelFile], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'dashboard_tag.xlsx';
  a.click();
}

window.exportTagDashboardExcel = exportTagDashboardExcel;

function exportToExcel() {
  // Get the table element
  const table = document.getElementById("myTable");
  if (!table || typeof XLSX === 'undefined') { return; }

  // Create a new Excel workbook
  const workbook = XLSX.utils.book_new();

  if (groupedModeExport(table, workbook)) {
    appendTagDashboardSheets(workbook);
    const groupedExcel = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const groupedBlob = new Blob([groupedExcel], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const groupedLink = document.createElement("a");
    groupedLink.href = URL.createObjectURL(groupedBlob);
    groupedLink.download = "exported_groups.xlsx";
    groupedLink.click();
    return;
  }

  // Build a 2D array to store the table data
  const tableData = [];

  // Add the header row to the tableData array
  const headerRowData = [];
  const headerCells = table.getElementsByTagName('th');
  const checkboxes = document.querySelectorAll("#selectColumns input[type='checkbox']");
  const extraRow = table.querySelector("#extra");
  const extraCells = extraRow ? extraRow.getElementsByTagName('td') : [];
  for (let i = 0; i < headerCells.length; i++) {
    const headerCell = headerCells[i];
    const unitCell = extraCells[i];
    const unitText = unitCell ? unitCell.textContent : '';
    const columnName = headerWithUnit(headerCell, unitText);
    const checkbox = checkboxes[i];

    // Check if the corresponding checkbox is checked
    if (checkbox.checked) {
      headerRowData.push(columnName);
    }
  }
  tableData.push(headerRowData);

  // Iterate through the table rows (excluding the header and extra rows) and cells
  const rows = table.getElementsByTagName('tbody')[0].getElementsByTagName('tr');
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Check if the row is visible (not hidden)
    if (row.style.display !== "none") {
      const rowData = [];
      const cells = row.getElementsByTagName('td');

      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        const columnIndex = j + 1;

        // Check if the corresponding checkbox is checked
        const checkbox = checkboxes[columnIndex - 1];
        if (checkbox.checked) {
          let cellData;

          if (cell.querySelector('img')) {
            // If the cell contains an image, create the Excel formula
            const imgUrl = cell.querySelector('img').src;
            cellData = { f: `=IMAGE("${imgUrl}",,0)` };
          } else {
            // Otherwise, get the cell value and alignment
            const cellValue = cell.tagName === 'TEXTAREA' ? convertToExcelFormat(cell.value) : cell.textContent;
            const cellAlign = window.getComputedStyle(cell).textAlign;
            cellData = { v: sanitizeForExcel(cellValue), s: { alignment: { horizontal: cellAlign } } };
          }

          rowData.push(cellData);
        }
      }

      // Only add the row data if it contains non-hidden cells
      if (rowData.length > 0) {
        tableData.push(rowData);
      }
    }
  }

  // const tableContainer = document.getElementById("tableContainer");
  // const sumRow = tableContainer.querySelector("#sum");
  // const sumRowData = [];
  // const sumDivs = sumRow.getElementsByTagName('div');
  // for (let i = 0; i < sumDivs.length; i++) {
  //   const sumDiv = sumDivs[i];
  //   const divValue = sumDiv.textContent;
  //   sumRowData.push(divValue);
  // }
  // tableData.push(sumRowData);

  // Create worksheet from AOA data
  const worksheet = XLSX.utils.aoa_to_sheet(tableData);

  // Add the worksheet to the workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  appendTagDashboardSheets(workbook);

  // Generate the Excel file (browser-safe output)
  const excelFile = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

  // Create a Blob object for the Excel file
  const blob = new Blob([excelFile], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

  // Create a download link and trigger the download
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "exported_table.xlsx";
  a.click();
}
