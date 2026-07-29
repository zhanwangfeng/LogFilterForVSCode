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
          const regexIdx = rule.params.indexOf('-regex');
          const regex = regexIdx !== -1 && regexIdx + 1 < rule.params.length
            ? new RegExp(rule.params[regexIdx + 1])
            : null;

          currentLines = [...currentLines].sort((a, b) => {
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
  filters: FilterRule[];
  funcs: string[];
  fill: string;
  sort: 'none' | 'rows' | 'cols' | 'both';
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
  const filters: FilterRule[] = [];
  const funcs: string[] = [];
  let pattern: RegExp | null = null;
  let fill = '';
  let sort: 'none' | 'rows' | 'cols' | 'both' = 'none';

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
        }
        break;
      }
      case '-r':
        rowIndices.push(resolveField(params[++i], aliasMap));
        break;
      case '-c':
        colIndices.push(resolveField(params[++i], aliasMap));
        break;
      case '-v':
        valIndices.push(resolveField(params[++i], aliasMap));
        break;
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
    }
  }

  return {
    pattern: pattern!,
    aliasMap,
    rowIndices,
    colIndices,
    valIndices: valIndices.length > 0 ? valIndices : null,
    filters,
    funcs: funcs.length > 0 ? funcs : ['count'],
    fill,
    sort,
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

function applyPivot(lines: string[], params: string[]): string[] {
  const cfg = parsePivotParams(params);

  if (cfg.rowIndices.length === 0 || cfg.colIndices.length === 0) {
    return ['!pivot: -r and -c are required'];
  }

  // Normalize funcs to match valIndices count
  if (cfg.valIndices && cfg.funcs.length > 1 && cfg.funcs.length !== cfg.valIndices.length) {
    cfg.funcs = cfg.funcs.slice(0, cfg.valIndices.length);
  }
  while (cfg.valIndices && cfg.funcs.length < cfg.valIndices.length) {
    cfg.funcs.push(cfg.funcs[0] || 'count');
  }

  type CellMap = Map<number, number[]>;
  type ColMap = Map<string, CellMap>;
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

  const rowKeys = [...matrix.keys()];
  const sortedColKeys = [...new Set([...matrix.values()].flatMap(cm => [...cm.keys()]))];

  if (cfg.sort === 'rows' || cfg.sort === 'both') rowKeys.sort(sortByParts);
  if (cfg.sort === 'cols' || cfg.sort === 'both') sortedColKeys.sort(sortByParts);

  const numValues = cfg.valIndices ? cfg.valIndices.length : 1;
  const numColSlots = sortedColKeys.length * numValues;

  // Build column header levels
  const colHeaders: string[][] = [];
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
        colHeaders[level].push(cfg.funcs[v]);
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

  // Measure widths
  let rowWidth = 0;
  const rowLabels: { depth: number; text: string }[] = [];
  for (const rk of rowKeys) {
    const parts = rk.split(SEP);
    for (let d = 0; d < parts.length; d++) {
      const indent = d > 0 ? '  ' : '';
      rowWidth = Math.max(rowWidth, indent.length + parts[d].length);
      rowLabels.push({ depth: d, text: parts[d] });
    }
  }
  rowWidth = Math.max(rowWidth, 2);

  const colWidths: number[] = new Array(numColSlots).fill(0);
  for (let l = 0; l < colHeaders.length; l++) {
    for (let ci = 0; ci < colHeaders[l].length; ci++) {
      colWidths[ci] = Math.max(colWidths[ci], colHeaders[l][ci].length);
    }
  }
  for (const rk of rowKeys) {
    const cm = matrix.get(rk)!;
    for (const [ck, cellMap] of cm) {
      const baseIdx = sortedColKeys.indexOf(ck);
      if (baseIdx < 0) continue;
      for (let v = 0; v < numValues; v++) {
        const agg = cellMap.get(v);
        if (agg && agg.length > 0) {
          colWidths[baseIdx * numValues + v] = Math.max(colWidths[baseIdx * numValues + v], String(agg[0]).length);
        }
      }
    }
  }
  for (let ci = 0; ci < colWidths.length; ci++) {
    colWidths[ci] = Math.max(colWidths[ci], 1);
  }

  const result: string[] = [];

  // Render column headers
  for (let l = 0; l < colHeaders.length; l++) {
    const parts = colHeaders[l];
    const row = ' '.repeat(rowWidth) + ' │ ' +
      parts.map((p, ci) => pad(p, colWidths[ci])).join(' │ ');
    result.push(row.replace(/\s+$/, ''));
  }

  // Separator
  result.push('━'.repeat(rowWidth) + '┿' +
    colWidths.map(w => '━'.repeat(w)).join('┿'));

  // Render data rows with hierarchy
  let prevPrefix: string[] = [];
  for (let ri = 0; ri < rowKeys.length; ri++) {
    const rk = rowKeys[ri];
    const parts = rk.split(SEP);
    const cm = matrix.get(rk)!;

    // Determine which prefix levels changed vs previous row
    const commonPrefixLen = ri > 0
      ? (() => { let c = 0; const prev = rowKeys[ri - 1].split(SEP); while (c < Math.min(parts.length, prev.length) && parts[c] === prev[c]) c++; return c; })()
      : 0;

    // Build display: we show each non-common prefix part on its own line
    const displayParts: string[] = [];
    for (let d = 0; d < parts.length; d++) {
      if (d >= commonPrefixLen) {
        displayParts.push((d > 0 ? '  ' : '') + parts[d]);
      }
    }

    // If the entire prefix is new (e.g., first row or all new), we may need multiple lines
    // Simple approach: one row per compound key, show only the deepest new level
    const displayLines: { label: string; depth: number }[] = [];
    for (let d = commonPrefixLen; d < parts.length; d++) {
      displayLines.push({ label: (d > 0 ? '  ' : '') + parts[d], depth: d });
    }

    if (displayLines.length === 0) {
      displayLines.push({ label: parts.map((p, i) => i > 0 ? '  ' + p : p).join(''), depth: 0 });
    }

    for (let di = 0; di < displayLines.length; di++) {
      const dl = displayLines[di];
      const cells: string[] = [];
      for (let ci = 0; ci < sortedColKeys.length; ci++) {
        const ck = sortedColKeys[ci];
        const cellMap = cm.get(ck) || new Map();
        for (let v = 0; v < numValues; v++) {
          const agg = cellMap.get(v);
          const val = (agg && agg.length > 0) ? agg[0] : null;
          const fill = val !== null ? String(val) : (cfg.fill || (cfg.funcs[0] === 'count' ? '0' : '-'));
          cells.push(padRight(fill, colWidths[ci * numValues + v]));
        }
      }
      const paddedLabel = pad(dl.label, rowWidth);
      result.push(paddedLabel + ' │ ' + cells.join(' │ '));
    }

    prevPrefix = parts;
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
