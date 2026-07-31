import { Rule } from './parser';

function hasCaptureGroups(pattern: string): boolean {
  let depth = 0;
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === '\\') { i += 2; continue; }
    if (pattern[i] === '(') {
      if (pattern[i + 1] === '?' && pattern[i + 2] === ':') { i += 3; continue; }
      depth++;
    }
    i++;
  }
  return depth > 0;
}

export function applyFilter(lines: string[], rules: Rule[]): string[] {
  let currentLines = lines;

  for (const rule of rules) {
    if (rule.type === 'command') {
      switch (rule.command) {
        case 'dedupe': {
          const seen = new Set<string>();
          currentLines = currentLines.filter(line => {
            if (seen.has(line)) return false;
            seen.add(line);
            return true;
          });
          break;
        }
        case 'dedupe-consecutive': {
          const result: string[] = [];
          for (const line of currentLines) {
            if (result.length === 0 || line !== result[result.length - 1]) {
              result.push(line);
            }
          }
          currentLines = result;
          break;
        }
        case 'count': {
          const counts = new Map<string, number>();
          for (const line of currentLines) {
            counts.set(line, (counts.get(line) ?? 0) + 1);
          }
          currentLines = [];
          for (const [line, count] of counts) {
            currentLines.push(`${line} (${count})`);
          }
          break;
        }
        case 'count-consecutive': {
          const result: string[] = [];
          let count = 0;
          for (let i = 0; i < currentLines.length; i++) {
            count++;
            if (i + 1 >= currentLines.length || currentLines[i] !== currentLines[i + 1]) {
              result.push(`${currentLines[i]} (${count})`);
              count = 0;
            }
          }
          currentLines = result;
          break;
        }
        case 'sort': {
          const desc = rule.params.includes('-desc');
          const asInt = rule.params.includes('-int');
          const dropUnmatched = rule.params.includes('-drop-unmatched');
          const regexIdx = rule.params.indexOf('-regex');
          const regex = regexIdx !== -1 && regexIdx + 1 < rule.params.length
            ? new RegExp(rule.params[regexIdx + 1])
            : null;
          const skipIdx = rule.params.indexOf('-skip-line');
          const skipLine = skipIdx !== -1 && skipIdx + 1 < rule.params.length
            ? Math.max(0, parseInt(rule.params[skipIdx + 1], 10) || 0)
            : 0;

          let head: string[] = [];
          let tail = currentLines;
          if (skipLine > 0) {
            head = currentLines.slice(0, skipLine);
            tail = currentLines.slice(skipLine);
          }

          if (dropUnmatched && regex) {
            tail = tail.filter(line => regex.test(line));
          }

          tail = [...tail].sort((a, b) => {
            const ra = regex ? regex.exec(a)?.[1] ?? a : a;
            const rb = regex ? regex.exec(b)?.[1] ?? b : b;
            let ka: string | number = ra;
            let kb: string | number = rb;
            if (asInt) {
              ka = parseInt(String(ra), 10) || 0;
              kb = parseInt(String(rb), 10) || 0;
            }
            const cmp = asInt ? (ka as number) - (kb as number) : String(ka).localeCompare(String(kb));
            return desc ? -cmp : cmp;
          });

          currentLines = [...head, ...tail];
          break;
        }
        case 'pivot': {
          currentLines = applyPivot(currentLines, rule.params);
          break;
        }
      }
    } else {
      const regex = new RegExp(rule.pattern, 'g');
      const hasCapture = hasCaptureGroups(rule.pattern);
      const newLines: string[] = [];

      for (const line of currentLines) {
        if (hasCapture) {
          let match: RegExpExecArray | null;
          while ((match = regex.exec(line)) !== null) {
            for (let gi = 1; gi < match.length; gi++) {
              const captured = match[gi];
              if (captured !== undefined) newLines.push(captured);
            }
            if (match.index === regex.lastIndex) regex.lastIndex++;
          }
        } else {
          regex.lastIndex = 0;
          if (regex.test(line)) newLines.push(line);
        }
      }

      currentLines = newLines;
    }
  }

  return currentLines;
}

interface FilterRule {
  fieldIdx: number;
  regex: RegExp | null;
}

interface PivotConfig {
  pattern: RegExp;
  aliasMap: Map<string, number>;
  rowIndices: number[];
  colIndices: number[];
  valIndices: number[] | null;
  valRefs: string[];
  filters: FilterRule[];
  funcs: string[];
  fill: string;
  sort: 'none' | 'rows' | 'cols' | 'both';
  view: 'tree' | 'list' | 'csv' | 'tab';
  format: 'compact' | 'aligned';
}

const SEP = '\x00';

function resolveField(raw: string, aliasMap: Map<string, number>): number {
  const asNum = parseInt(raw.split(',')[0], 10);
  if (!isNaN(asNum)) return asNum - 1;
  return aliasMap.get(raw.toLowerCase()) ?? -1;
}

function parsePivotParams(params: string[]): PivotConfig {
  const aliasMap = new Map<string, number>();
  const rowIndices: number[] = [];
  const colIndices: number[] = [];
  const valIndices: number[] = [];
  const valRefs: string[] = [];
  const filters: FilterRule[] = [];
  const funcs: string[] = [];
  let pattern: RegExp | null = null;
  let fill = '';
  let sort: 'none' | 'rows' | 'cols' | 'both' = 'none';
  let view: 'tree' | 'list' | 'csv' | 'tab' = 'tree';
  let format: 'compact' | 'aligned' = 'compact';
  let autoIdx = 0;

  for (let i = 0; i < params.length; i++) {
    switch (params[i]) {
      case '-p':
        pattern = new RegExp(params[++i]);
        break;
      case '-n': {
        const part = params[++i];
        const colonIdx = part.indexOf(':');
        if (colonIdx > 0) {
          const idx = parseInt(part.slice(0, colonIdx), 10) - 1;
          const alias = part.slice(colonIdx + 1);
          aliasMap.set(alias.toLowerCase(), idx);
        } else {
          aliasMap.set(part.toLowerCase(), autoIdx++);
        }
        break;
      }
      case '-r':
        rowIndices.push(resolveField(params[++i], aliasMap));
        break;
      case '-c':
        colIndices.push(resolveField(params[++i], aliasMap));
        break;
      case '-v': {
        const raw = params[++i];
        valRefs.push(raw);
        valIndices.push(resolveField(raw, aliasMap));
        break;
      }
      case '-f': {
        const field = resolveField(params[++i], aliasMap);
        if (i + 1 < params.length && !params[i + 1].startsWith('-')) {
          filters.push({ fieldIdx: field, regex: new RegExp(params[++i]) });
        } else {
          filters.push({ fieldIdx: field, regex: null });
        }
        break;
      }
      case '-func':
        funcs.push(params[++i]);
        break;
      case '-fill':
        fill = params[++i];
        break;
      case '-sort':
        sort = params[++i] as typeof sort;
        break;
      case '-view':
        view = params[++i] as typeof view;
        break;
      case '-table-view-format':
        format = params[++i] as typeof format;
        break;
    }
  }

  return {
    pattern: pattern!,
    aliasMap,
    rowIndices,
    colIndices,
    valIndices: valIndices.length > 0 ? valIndices : null,
    valRefs,
    filters,
    funcs: funcs.length > 0 ? funcs : ['count'],
    fill,
    sort,
    view,
    format,
  };
}

function aggregate(values: number[], func: string): number {
  switch (func) {
    case 'sum': return values.reduce((a, b) => a + b, 0);
    case 'avg': return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min': return Math.min(...values);
    case 'max': return Math.max(...values);
    default: return values.length; // count
  }
}

function groupRowKeysByHierarchy(rowKeys: string[]): string[] {
  const firstSeen = new Map<string, number>();
  const ranked = rowKeys.map(rk => {
    const parts = rk.split(SEP);
    const rank = parts.map((_, d) => {
      const prefix = parts.slice(0, d + 1).join(SEP);
      if (!firstSeen.has(prefix)) firstSeen.set(prefix, firstSeen.size);
      return firstSeen.get(prefix)!;
    });
    return { rk, rank };
  });
  ranked.sort((a, b) => {
    const len = Math.min(a.rank.length, b.rank.length);
    for (let i = 0; i < len; i++) {
      if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
    }
    return a.rank.length - b.rank.length;
  });
  return ranked.map(r => r.rk);
}

type CellMap = Map<number, number[]>;
type ColMap = Map<string, CellMap>;

function valueHeaderLabel(cfg: PivotConfig, v: number): string {
  const func = cfg.funcs[v] || cfg.funcs[0];
  if (!cfg.valIndices) return func;
  return `${cfg.valRefs[v]}(${func})`;
}

function renderPivotList(
  matrix: Map<string, ColMap>,
  rowKeys: string[],
  colKeys: string[],
  cfg: PivotConfig,
  fixedSep?: string
): string[] {
  const numValues = cfg.valIndices ? cfg.valIndices.length : 1;
  const fillDefault = cfg.fill || (cfg.funcs[0] === 'count' ? '0' : '-');

  const nameByIndex = new Map<number, string>();
  for (const [alias, idx] of cfg.aliasMap) {
    if (!nameByIndex.has(idx)) nameByIndex.set(idx, alias);
  }
  const rowNames = cfg.rowIndices.map(idx => nameByIndex.get(idx) || String(idx + 1));
  const colNames = cfg.colIndices.map(idx => nameByIndex.get(idx) || String(idx + 1));
  const headerParts = [...rowNames];
  if (colNames.length > 0) headerParts.push(...colNames);
  headerParts.push(...cfg.funcs.map((_, v) => valueHeaderLabel(cfg, v)));

  const rows: string[][] = [headerParts];
  for (const rk of rowKeys) {
    const rowParts = rk.split(SEP);
    const cm = matrix.get(rk)!;
    for (const ck of colKeys) {
      const cellMap = cm.get(ck);
      if (!cellMap) continue;
      const colParts = ck === '' ? [] : ck.split(SEP);
      const row: string[] = [...rowParts];
      if (colParts.length > 0) row.push(...colParts);
      for (let v = 0; v < numValues; v++) {
        const agg = cellMap.get(v);
        row.push((agg && agg.length > 0) ? String(agg[0]) : fillDefault);
      }
      rows.push(row);
    }
  }

  if (fixedSep !== undefined) {
    // csv / tab: plain delimited output, aligned is not supported
    if (fixedSep === ',') {
      const escapeCsv = (s: string) => /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      return rows.map(r => r.map(escapeCsv).join(','));
    }
    return rows.map(r => r.join(fixedSep));
  }

  if (cfg.format !== 'aligned') {
    return rows.map(r => r.join(' | '));
  }

  const numCols = rows[0].length;
  const widths: number[] = new Array(numCols).fill(0);
  for (const r of rows) {
    for (let i = 0; i < numCols; i++) {
      widths[i] = Math.max(widths[i], (r[i] || '').length);
    }
  }

  const result: string[] = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    const isData = ri > 0;
    const cells = r.map((cell, i) => {
      const w = widths[i];
      const isValue = isData && i >= r.length - numValues;
      return (isValue ? padRight(cell, w + 1) : pad(cell, w + 1)) + ' ';
    });
    result.push(cells.join('│ '));
  }
  return result;
}

function applyPivot(lines: string[], params: string[]): string[] {
  const cfg = parsePivotParams(params);

  if (cfg.rowIndices.length === 0) {
    return ['!pivot: -r is required'];
  }

  // Normalize funcs to match valIndices count
  if (cfg.valIndices && cfg.funcs.length > 1 && cfg.funcs.length !== cfg.valIndices.length) {
    cfg.funcs = cfg.funcs.slice(0, cfg.valIndices.length);
  }
  while (cfg.valIndices && cfg.funcs.length < cfg.valIndices.length) {
    cfg.funcs.push(cfg.funcs[0] || 'count');
  }

  const matrix = new Map<string, ColMap>();

  for (const line of lines) {
    const m = cfg.pattern.exec(line);
    if (!m) continue;
    cfg.pattern.lastIndex = 0;
    const fields = m.slice(1);

    let skip = false;
    for (const f of cfg.filters) {
      const val = fields[f.fieldIdx];
      if (val === undefined || val === '') { skip = true; break; }
      if (f.regex !== null && !f.regex.test(val)) { skip = true; break; }
    }
    if (skip) continue;

    const rowParts: string[] = [];
    for (const idx of cfg.rowIndices) {
      const v = fields[idx];
      if (v === undefined || v === '') { skip = true; break; }
      rowParts.push(v);
    }
    if (skip) continue;

    const colParts: string[] = [];
    for (const idx of cfg.colIndices) {
      const v = fields[idx];
      if (v === undefined || v === '') { skip = true; break; }
      colParts.push(v);
    }
    if (skip) continue;

    const rowKey = rowParts.join(SEP);
    const colKey = colParts.join(SEP);

    if (!matrix.has(rowKey)) matrix.set(rowKey, new Map());
    const cm = matrix.get(rowKey)!;
    if (!cm.has(colKey)) cm.set(colKey, new Map());
    const cellMap = cm.get(colKey)!;

    if (cfg.valIndices) {
      for (let vi = 0; vi < cfg.valIndices.length; vi++) {
        const val = parseFloat(fields[cfg.valIndices[vi]]);
        if (!isNaN(val)) {
          if (!cellMap.has(vi)) cellMap.set(vi, []);
          cellMap.get(vi)!.push(val);
        }
      }
    } else {
      if (!cellMap.has(0)) cellMap.set(0, []);
      cellMap.get(0)!.push(1);
    }
  }

  if (matrix.size === 0) {
    return ['!pivot: no matching rows'];
  }

  // Aggregate
  for (const cm of matrix.values()) {
    for (const cellMap of cm.values()) {
      for (const [vi, vals] of cellMap) {
        cellMap.set(vi, [aggregate(vals, cfg.funcs[vi] || cfg.funcs[0])]);
      }
    }
  }

  // Sort keys
  const sortByParts = (a: string, b: string) => {
    const ap = a.split(SEP);
    const bp = b.split(SEP);
    for (let i = 0; i < Math.min(ap.length, bp.length); i++) {
      const cmp = ap[i].localeCompare(bp[i]);
      if (cmp !== 0) return cmp;
    }
    return ap.length - bp.length;
  };

  let rowKeys = [...matrix.keys()];
  const sortedColKeys = [...new Set([...matrix.values()].flatMap(cm => [...cm.keys()]))];

  if (cfg.sort === 'rows' || cfg.sort === 'both') rowKeys.sort(sortByParts);
  else rowKeys = groupRowKeysByHierarchy(rowKeys);
  if (cfg.sort === 'cols' || cfg.sort === 'both') sortedColKeys.sort(sortByParts);

  if (cfg.view !== 'tree') {
    const fixedSep = cfg.view === 'csv' ? ',' : cfg.view === 'tab' ? '\t' : undefined;
    return renderPivotList(matrix, rowKeys, sortedColKeys, cfg, fixedSep);
  }

  // Subtotals per hierarchy prefix: each row level rolls up all its children
  const subtotals = new Map<string, Map<string, Map<number, number[]>>>();
  for (const rk of matrix.keys()) {
    const parts = rk.split(SEP);
    const cm = matrix.get(rk)!;
    for (let d = 0; d < parts.length; d++) {
      const prefix = parts.slice(0, d + 1).join(SEP);
      let sc = subtotals.get(prefix);
      if (!sc) { sc = new Map(); subtotals.set(prefix, sc); }
      for (const [ck, cellMap] of cm) {
        let scm = sc.get(ck);
        if (!scm) { scm = new Map(); sc.set(ck, scm); }
        for (const [vi, vals] of cellMap) {
          if (vals.length === 0) continue;
          if (!scm.has(vi)) scm.set(vi, []);
          scm.get(vi)!.push(vals[0]);
        }
      }
    }
  }

  const subtotalVal = (prefix: string, ck: string, vi: number): number | null => {
    const sc = subtotals.get(prefix);
    const scm = sc && sc.get(ck);
    const vals = scm && scm.get(vi);
    if (!vals || vals.length === 0) return null;
    return aggregate(vals, cfg.funcs[vi] || cfg.funcs[0]);
  };

  const numValues = cfg.valIndices ? cfg.valIndices.length : 1;
  const numColSlots = sortedColKeys.length * numValues;
  const numLevels = cfg.rowIndices.length;

  // Field display names (alias if defined, otherwise 1-based index)
  const nameByIndex = new Map<number, string>();
  for (const [alias, idx] of cfg.aliasMap) {
    if (!nameByIndex.has(idx)) nameByIndex.set(idx, alias);
  }
  const rowFieldNames = cfg.rowIndices.map(idx => nameByIndex.get(idx) || String(idx + 1));

  // Build column header levels
  const colHeaders: string[][] = [];
  if (cfg.colIndices.length === 0) {
    // No columns: single-column summary grouped by rows, funcs as the header
    colHeaders[0] = cfg.funcs.map((_, v) => valueHeaderLabel(cfg, v));
  } else {
    for (const ck of sortedColKeys) {
      const parts = ck.split(SEP);
      for (let l = 0; l < parts.length; l++) {
        if (!colHeaders[l]) colHeaders[l] = [];
        colHeaders[l].push(parts[l]);
      }
      // Value function labels (if multiple values) go under each column
      if (numValues > 1) {
        for (let v = 0; v < numValues; v++) {
          const level = parts.length + v;
          if (!colHeaders[level]) colHeaders[level] = [];
          colHeaders[level].push(valueHeaderLabel(cfg, v));
        }
      }
    }
  }

  // Auto-fill missing header cells (span by merging)
  // Actually for simplicity, just leave empty where spanned
  for (let l = 0; l < colHeaders.length; l++) {
    while (colHeaders[l].length < numColSlots) {
      colHeaders[l].push('');
    }
  }

  // Measure row-level column widths
  const rowWidths: number[] = rowFieldNames.map(name => Math.max(name.length, 2));
  for (const rk of rowKeys) {
    const parts = rk.split(SEP);
    for (let d = 0; d < numLevels; d++) {
      rowWidths[d] = Math.max(rowWidths[d], parts[d].length);
    }
  }

  const colWidths: number[] = new Array(numColSlots).fill(0);
  for (let l = 0; l < colHeaders.length; l++) {
    for (let ci = 0; ci < colHeaders[l].length; ci++) {
      colWidths[ci] = Math.max(colWidths[ci], colHeaders[l][ci].length);
    }
  }
  for (const rk of rowKeys) {
    const parts = rk.split(SEP);
    for (let d = 0; d < parts.length; d++) {
      const prefix = parts.slice(0, d + 1).join(SEP);
      const sc = subtotals.get(prefix);
      if (!sc) continue;
      for (const [ck, scm] of sc) {
        const baseIdx = sortedColKeys.indexOf(ck);
        if (baseIdx < 0) continue;
        for (let v = 0; v < numValues; v++) {
          const s = subtotalVal(prefix, ck, v);
          if (s !== null) {
            colWidths[baseIdx * numValues + v] = Math.max(colWidths[baseIdx * numValues + v], String(s).length);
          }
        }
      }
    }
  }
  for (let ci = 0; ci < colWidths.length; ci++) {
    colWidths[ci] = Math.max(colWidths[ci], 1);
  }

  const result: string[] = [];

  const aligned = cfg.format === 'aligned';

  if (!aligned) {
    // compact: CSV-like, no column alignment, no separator line
    const headerRows: string[][] = [];
    for (let l = 0; l < colHeaders.length; l++) {
      const levelCells = l === 0 ? [...rowFieldNames] : rowFieldNames.map(() => '');
      headerRows.push([...levelCells, ...colHeaders[l]]);
    }
    for (const h of headerRows) {
      result.push(h.join(' | ').replace(/( \| )*$/, ''));
    }

    for (let ri = 0; ri < rowKeys.length; ri++) {
      const rk = rowKeys[ri];
      const parts = rk.split(SEP);

      // Determine which prefix levels changed vs previous row
      const commonPrefixLen = ri > 0
        ? (() => { let c = 0; const prev = rowKeys[ri - 1].split(SEP); while (c < Math.min(parts.length, prev.length) && parts[c] === prev[c]) c++; return c; })()
        : 0;

      const depths: number[] = [];
      for (let d = commonPrefixLen; d < parts.length; d++) {
        depths.push(d);
      }
      if (depths.length === 0) depths.push(0);

      for (const d of depths) {
        const prefix = parts.slice(0, d + 1).join(SEP);
        const levelCells: string[] = [];
        for (let j = 0; j < numLevels; j++) {
          levelCells.push(j === d ? parts[j] : '');
        }
        const valueCells: string[] = [];
        for (let ci = 0; ci < sortedColKeys.length; ci++) {
          const ck = sortedColKeys[ci];
          for (let v = 0; v < numValues; v++) {
            const val = subtotalVal(prefix, ck, v);
            valueCells.push(val !== null ? String(val) : (cfg.fill || (cfg.funcs[0] === 'count' ? '0' : '-')));
          }
        }
        result.push([...levelCells, ...valueCells].join(' | '));
      }
    }
    return result;
  }

  // aligned: padded columns, ┿ aligned with │, separator line
  const cellSep = '│ ';
  const textCell = (content: string, baseW: number) => pad(content, baseW + 1) + ' ';
  const numCell = (content: string, baseW: number) => padRight(content, baseW + 1) + ' ';
  const blankCell = (baseW: number) => ' '.repeat(baseW + 2);

  const headerLevelCells = rowFieldNames.map((name, d) => textCell(name, rowWidths[d]));
  const blankLevelCells = rowWidths.map(w => blankCell(w));

  // Render column headers (row field names on the first level)
  for (let l = 0; l < colHeaders.length; l++) {
    const levelCells = l === 0 ? headerLevelCells : blankLevelCells;
    const valueParts = colHeaders[l];
    const row = levelCells.join(cellSep) + cellSep +
      valueParts.map((p, ci) => textCell(p, colWidths[ci])).join(cellSep);
    result.push(row);
  }

  // Separator: first column spans its width, subsequent columns get +1 so ┿ lines up with │
  const sepSegments: string[] = [];
  rowWidths.forEach((w, i) => sepSegments.push('━'.repeat(w + 2 + (i === 0 ? 0 : 1))));
  colWidths.forEach(w => sepSegments.push('━'.repeat(w + 3)));
  result.push(sepSegments.join('┿'));

  // Render data rows: one line per newly changed hierarchy level, one column per level
  for (let ri = 0; ri < rowKeys.length; ri++) {
    const rk = rowKeys[ri];
    const parts = rk.split(SEP);

    // Determine which prefix levels changed vs previous row
    const commonPrefixLen = ri > 0
      ? (() => { let c = 0; const prev = rowKeys[ri - 1].split(SEP); while (c < Math.min(parts.length, prev.length) && parts[c] === prev[c]) c++; return c; })()
      : 0;

    const depths: number[] = [];
    for (let d = commonPrefixLen; d < parts.length; d++) {
      depths.push(d);
    }
    if (depths.length === 0) depths.push(0);

    for (const d of depths) {
      const prefix = parts.slice(0, d + 1).join(SEP);
      const levelCells: string[] = [];
      for (let j = 0; j < numLevels; j++) {
        levelCells.push(j === d ? textCell(parts[j], rowWidths[j]) : blankCell(rowWidths[j]));
      }
      const valueCells: string[] = [];
      for (let ci = 0; ci < sortedColKeys.length; ci++) {
        const ck = sortedColKeys[ci];
        for (let v = 0; v < numValues; v++) {
          const val = subtotalVal(prefix, ck, v);
          const fill = val !== null ? String(val) : (cfg.fill || (cfg.funcs[0] === 'count' ? '0' : '-'));
          valueCells.push(numCell(fill, colWidths[ci * numValues + v]));
        }
      }
      result.push(levelCells.join(cellSep) + cellSep + valueCells.join(cellSep));
    }
  }

  return result;
}

function pad(s: string, w: number): string {
  if (s.length >= w) return s;
  return s + ' '.repeat(w - s.length);
}

function padRight(s: string, w: number): string {
  if (s.length >= w) return s;
  return ' '.repeat(w - s.length) + s;
}
