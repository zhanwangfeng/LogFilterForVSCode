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
      result.push(''); // 占位：保持 result 行号与原始文档一一对应，供错误行号定位
    } else {
      result.push(line);
      if (line !== '' && !line.startsWith('#')) {
        lastMergeTarget = result.length - 1;
      }
    }
  }

  return result.join('\n');
}

export interface LfLineError {
  lineIndex: number;
  message: string;
}

/** 行级错误 + 规则位置（从 0 开始，错误行本身占一个位置，与 UI 的 patternIndex 计数一致） */
interface RuleLineError extends LfLineError {
  ruleIndex: number;
}

function parseLfLines(content: string): { rules: Rule[]; errors: RuleLineError[] } {
  const normalized = preprocessLfContent(content);
  const rules: Rule[] = [];
  const errors: RuleLineError[] = [];
  const lines = normalized.split('\n');
  let ruleIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;

    const errorRuleIndex = ruleIndex;
    ruleIndex++;

    if (line.startsWith('!')) {
      const parts = line.slice(1).trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const params = parts.slice(1);
      if (!SUPPORTED_COMMANDS.has(cmd)) {
        const message = `Unknown command: ${line}`;
        console.log(`[LogFilterPro][parseLfLines] line ${i} (rule#${errorRuleIndex}): ${message}`);
        errors.push({ lineIndex: i, message, ruleIndex: errorRuleIndex });
        continue;
      }
      rules.push({ type: 'command', command: cmd, params });
    } else {
      try {
        new RegExp(line);
      } catch {
        const message = `Invalid regex at line: ${line}`;
        console.log(`[LogFilterPro][parseLfLines] line ${i} (rule#${errorRuleIndex}): ${message}`);
        errors.push({ lineIndex: i, message, ruleIndex: errorRuleIndex });
        continue;
      }
      rules.push({ type: 'regex', pattern: line });
    }
  }
  return { rules, errors };
}

/**
 * 解析 .lf 内容为规则数组。
 * @param upToRuleIndex 可选：只校验规则位置 <= upToRuleIndex 的错误（Filter 只执行到目标行，
 * 下方命令不会被执行，因此其错误不应阻断）。未指定则校验整个文件。
 */
export function parseLfFile(content: string, upToRuleIndex?: number): Rule[] {
  const { rules, errors } = parseLfLines(content);
  const firstError =
    upToRuleIndex === undefined ? errors[0] : errors.find((e) => e.ruleIndex <= upToRuleIndex);
  if (firstError) throw new Error(firstError.message);
  return rules;
}

/** 校验 .lf 内容，返回所有无效规则行（文档行号 + 单行错误描述），供 CodeLens 内联提示使用 */
export function validateLfContent(content: string): LfLineError[] {
  return parseLfLines(content).errors;
}
