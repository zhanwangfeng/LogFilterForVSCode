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
            console.log(`[sort desc=${desc} int=${asInt}] a="${a}" → ka="${ka}"  |  b="${b}" → kb="${kb}"`);
            const cmp = asInt ? (ka as number) - (kb as number) : String(ka).localeCompare(String(kb));
            return desc ? -cmp : cmp;
          });
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
