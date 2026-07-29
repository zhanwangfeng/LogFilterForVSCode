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

export function parseLfFile(content: string): Rule[] {
  const rules: Rule[] = [];
  for (const rawLine of content.split('\n')) {
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
