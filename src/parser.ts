export interface RegexRule {
  type: 'regex';
  pattern: string;
}

export interface CommandRule {
  type: 'command';
  command: string;
  params: string[];
}

export type Rule = RegexRule | CommandRule;

const SUPPORTED_COMMANDS = new Set(['dedupe', 'dedupe-consecutive', 'count', 'count-consecutive', 'sort', 'pivot']);

function preprocessLfContent(content: string): string {
  const result: string[] = [];
  let lastMergeTarget = -1;

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('-') && lastMergeTarget >= 0) {
      result[lastMergeTarget] += ' ' + line;
    } else {
      result.push(line);
      if (line !== '' && !line.startsWith('#')) {
        lastMergeTarget = result.length - 1;
      }
    }
  }

  return result.join('\n');
}

export function parseLfFile(content: string): Rule[] {
  const normalized = preprocessLfContent(content);
  const rules: Rule[] = [];
  for (const rawLine of normalized.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    if (line.startsWith('!')) {
      const parts = line.slice(1).trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const params = parts.slice(1);
      if (!SUPPORTED_COMMANDS.has(cmd)) {
        throw new Error(`Unknown command: ${line}`);
      }
      rules.push({ type: 'command', command: cmd, params });
    } else {
      try {
        new RegExp(line);
      } catch {
        throw new Error(`Invalid regex at line: ${line}`);
      }
      rules.push({ type: 'regex', pattern: line });
    }
  }
  return rules;
}
