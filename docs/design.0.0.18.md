# LogFilterPro v0.0.18 — 无效规则行内联错误提示

## 目标

### 1. 无效规则行的 Filter 按钮区域显示错误

当前行为：`.lf` 文件中存在无效 `!` 命令（或非法正则）时，编辑过程中无任何提示，只有点击该行上方的 `▶ Filter (Ctrl+Enter)` 后才会弹出错误对话框（`showErrorMessage`）。

目标行为：**无效规则行上方的 Filter 按钮区域改为显示「黄色灯泡 💡 + 单行错误描述」**。

- 规则无效时，该行上方不再显示 `▶ Filter (Ctrl+Enter)`（该按钮点击必然报错、无实际用途），改为显示 `💡 Unknown command: !foo`（黄色灯泡 + 单行错误描述）
- 点击灯泡 CodeLens 仍会弹出完整错误提示，保留「点击后提示」的行为
- 无效正则行同样适用（`💡 Invalid regex at line: ...`）
- 随编辑实时刷新：删改该行后灯泡自动出现 / 消失

### 2. 版本号升级

`0.0.17` → `0.0.18`

### 3. Filter / Ctrl+Enter 只校验目标行及以上的命令

当前行为：`.lf` 中**任何位置**存在无效命令（即使在被过滤行的下方）都会阻断过滤，因为 `filterUpToLine` 用 `parseLfFile` 校验整个文件。

目标行为：点击 `▶ Filter (Ctrl+Enter)` 只执行目标行及以上的规则，因此**只校验目标行及以上的命令**；下方命令不会被执行，其错误不再阻断过滤（但仍会在编辑区以 💡 灯泡提示）。`openPreview`（执行全部规则）仍校验整个文件，行为不变。

## 改动

| 文件 | 改动 |
|------|------|
| `src/parser.ts` | 重构：抽出 `parseLfLines()` 统一收集规则与全部行级错误；**`parseLfLines` 为每个错误记录 `ruleIndex`（规则位置）**；`parseLfFile(content, upToRuleIndex?)` 支持只校验到指定规则位置，未指定则抛首个错误（`openPreview` 用）；新增 `validateLfContent()` 返回全部无效行 `{lineIndex, message}`；**`preprocessLfContent` 合并 `-` 续行时 `push('')` 占位，保证行号对齐** |
| `src/codelensProvider.ts` | 调用 `validateLfContent()` 建立「行号 → 错误描述」映射；无效规则行渲染 `💡 <错误>` 灯泡 CodeLens（命令 `logFilterPro.showLfError`），有效行保持原有 `▶ Filter (Ctrl+Enter)`；含 `[LogFilterPro][CodeLens]` 调试日志 |
| `src/extension.ts` | 注册 `logFilterPro.showLfError` 命令：点击灯泡弹出错误警告；`filterUpToLine` 改为 `parseLfFile(lfContent, patternIndex)` 只校验目标行及以上 |
| `package.json` | version → 0.0.18；`contributes.commands` 声明 `logFilterPro.showLfError`（**CodeLens 携带的命令必须声明，否则编辑器不渲染**） |
| `package.nls.json` / `package.nls.zh-cn.json` | 新增 `command.showLfError.title` 本地化文案 |
| `package-lock.json` | version 同步 |
| `CHANGELOG.md` | 追加 v0.0.18 变更 |
| `docs/design.0.0.18.md` | 本文件 |

调试日志约定：所有日志统一前缀 `[LogFilterPro]`，输出到 Extension Host 调试控制台（Debug Console）；`parseLfLines` 报错行输出 `line <i>`，`CodeLens` 输出 `line <i>: error lens / filter lens` 及汇总。

## 实现细节

### parser.ts 重构

`parseLfLines(content)` 保留原有逐行校验逻辑（未知命令 / 非法正则），但不再立即 `throw`，而是把错误收集进数组；行号取预处理后数组下标，与原始文档行号一一对应（`preprocessLfContent` 的续行合并不改变数组长度）：

**续行占位机制（关键）**：`preprocessLfContent` 遇到 `-` 开头的续行时，把内容拼接到 `lastMergeTarget`（所属 `!` 命令行）后，必须 `result.push('')` 占位，使 result 数组长度与原始文档行数完全一致。若只原地拼接不占位，数组被压缩、后续行号整体前移，`parseLfLines` 返回的 `lineIndex` 与 CodeLens 使用的原始文档行号错位，灯泡永远匹配不上（线上 bug 根因）。

```ts
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
        errors.push({ lineIndex: i, message: `Unknown command: ${line}`, ruleIndex: errorRuleIndex });
        continue;
      }
      rules.push({ type: 'command', command: cmd, params });
    } else {
      try {
        new RegExp(line);
      } catch {
        errors.push({ lineIndex: i, message: `Invalid regex at line: ${line}`, ruleIndex: errorRuleIndex });
        continue;
      }
      rules.push({ type: 'regex', pattern: line });
    }
  }
  return { rules, errors };
}

/** upToRuleIndex 可选：只校验规则位置 <= upToRuleIndex 的错误；未指定则校验整个文件 */
export function parseLfFile(content: string, upToRuleIndex?: number): Rule[] {
  const { rules, errors } = parseLfLines(content);
  const firstError =
    upToRuleIndex === undefined ? errors[0] : errors.find((e) => e.ruleIndex <= upToRuleIndex);
  if (firstError) throw new Error(firstError.message);
  return rules;
}

export function validateLfContent(content: string): LfLineError[] {
  return parseLfLines(content).errors;
}
```

错误文案与旧版完全一致（`Unknown command: ...` / `Invalid regex at line: ...`）。`parseLfFile` 不传 `upToRuleIndex` 时仍抛首个错误，`openPreview` 弹错行为不变；`filterUpToLine` 传入 `patternIndex`（目标行的规则位置），仅校验目标行及以上，目标行下方的错误不再阻断过滤。

### codelensProvider.ts

```ts
import * as vscode from 'vscode';
import { validateLfContent } from './parser';

export class LfCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const errorsByLine = new Map<number, string>();
    for (const err of validateLfContent(document.getText())) {
      errorsByLine.set(err.lineIndex, err.message);
    }

    let patternIndex = 0;
    for (let line = 0; line < document.lineCount; line++) {
      const text = document.lineAt(line).text.trim();
      if (text === '' || text.startsWith('#') || text.startsWith('-')) continue;

      const range = new vscode.Range(line, 0, line, 0);
      const error = errorsByLine.get(line);
      if (error) {
        lenses.push(new vscode.CodeLens(range, {
          title: `💡 ${error}`,
          command: 'logFilterPro.showLfError',
          arguments: [error],
        }));
      } else {
        lenses.push(new vscode.CodeLens(range, {
          title: '▶ Filter (Ctrl+Enter)',
          command: 'logFilterPro.filterUpToLine',
          arguments: [{ patternIndex, lfUri: document.uri }],
        }));
      }
      patternIndex++;
    }
    return lenses;
  }
}
```

### extension.ts

```ts
context.subscriptions.push(
  vscode.commands.registerCommand('logFilterPro.showLfError', (error: string) => {
    vscode.window.showWarningMessage(error);
  })
);
```

## 风险与边界

- 灯泡 CodeLens 使用 `💡`（U+1F4A1，黄色灯泡 emoji），在编辑器内以彩色 emoji 渲染，满足「黄色灯泡」要求；错误描述为单行文本，满足「单行错误描述」要求
- 无效行**之上**的 Filter 按钮点击仍会报错（目标行及以上含无效命令时阻断，符合「只校验到目标行」语义）；**下方**无效命令不再阻断过滤，仅在编辑区以 💡 提示
- 本版本仅在无效行本身显示灯泡，不做级联
- `validateLfContent` 每次 CodeLens 刷新时执行，开销为逐行正则编译，对常见 `.lf` 文件规模可忽略
- 续行（`-` 开头）不显示 CodeLens；若其所属 `!` 命令无效，灯泡显示在该 `!` 命令所在行
