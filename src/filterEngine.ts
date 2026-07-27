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
