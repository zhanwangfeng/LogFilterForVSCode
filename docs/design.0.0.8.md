# LogFilter v0.0.8 — 多行命令参数与跨行补全

## 目标

支持将 `!` 命令的参数写在多行上（换行配置），并在输入 `-` 开头行时，自动向上查找最近的 `!` 命令，提供对应的参数补全。

## 动机

长命令（尤其是 `!pivot`）的参数非常多，写在一行可读性差：

```
!pivot -p (\d+\.\d+\.\d+\.\d+).*?(\d{2}): -n 1:IP -n 2:Hour -r IP -c Hour -func count
```

换行书写更清晰：

```
!pivot -p (\d+\.\d+\.\d+\.\d+).*?(\d{2}):
  -n 1:IP
  -n 2:Hour
  -r IP
  -c Hour
  -func count
```

## 设计原则

**行首空格纯属视觉排版，业务逻辑不关心。** 载入 `.lf` 文件后，每一行先 trim 再去判断类型。

## 设计

### 1. 解析器 — `parser.ts`

**核心简化**：先预处理（合并续行），再解析。

**预处理 `preprocessLfContent`**：扫描每一行，trim 后：
- 以 `-` 开头 → 合并到上一个有效行（非空、非注释）后面
- 其他 → 追加为新行，更新"上一个有效行"索引

**然后 `parseLfFile`**：对预处理后的内容执行原有解析逻辑，无需感知续行。

```typescript
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
```

**预处理示例**：

```
输入:                         输出:
!pivot                         !pivot -p (...) -r 1 -c 2
  -p (...)                      # fields
  -r 1
  -c 2
# fields
```

注意注释 `# fields` 出现在 `!pivot` 下方但不影响合并——预处理只关心 `-` 开头的行与上方最近的有效行合并。注释行和空行跳过 `lastMergeTarget` 更新，不作为合并目标。

### 2. 补全提供器 — `completionProvider.ts`

**当前行为**：补全触发条件 `^!(\S+)\s+-?$` — 仅当 `!` 和 `-` 在同一行时生效。

**新行为**：增加第三条补全路径：

| 路径 | 条件 | 示例 |
|------|------|------|
| 1 | `!` 开头，无空格 | `!so` → 补全命令 |
| 2 | `!cmd` + 空格 + 可选 `-` | `!sort -` → 补全参数 |
| **3（新增）** | trim 后以 `-` 开头（非 `!` 行） | `  -r` → 向上找最近的 `!` 命令，补全其参数 |

**路径 3 实现**：

```typescript
// 路径 3：续行 — trim 后以 - 开头，向上查找最近的 ! 命令
const trimmedPrefix = linePrefix.trim();
if (trimmedPrefix.startsWith('-') && !trimmedPrefix.startsWith('!')) {
  const cmdName = findNearestCommand(document, position);
  if (cmdName) {
    const typed = trimmedPrefix.toLowerCase();
    return PARAM_COMPLETIONS
      .filter(p => p.command === cmdName && p.label.toLowerCase().startsWith(typed))
      .map(p => {
        const item = new vscode.CompletionItem(p.label, vscode.CompletionItemKind.Keyword);
        item.detail = p.detail;
        item.documentation = new vscode.MarkdownString(p.documentation);
        const dashPos = linePrefix.lastIndexOf('-');
        item.range = new vscode.Range(
          position.line,
          dashPos >= 0 ? dashPos : position.character,
          position.line,
          position.character
        );
        return item;
      });
  }
}
```

`findNearestCommand` 辅助函数：

```typescript
function findNearestCommand(document: vscode.TextDocument, position: vscode.Position): string | null {
  for (let line = position.line - 1; line >= 0; line--) {
    const text = document.lineAt(line).text.trim();
    if (text.startsWith('!')) {
      const match = text.match(/^!(\w+)/);
      return match ? match[1].toLowerCase() : null;
    }
    // 续行或注释或空行 → 继续向上
    if (text === '' || text.startsWith('#') || text.startsWith('-')) continue;
    // 其他非空行（regex）→ 停止
    return null;
  }
  return null;
}
```

**查找规则**：
- 从当前行向上逐行遍历
- 跳过空行、注释行、`-` 开头的续行
- 遇到 `!` 行 → 返回命令名
- 遇到其他非空行（regex 行）→ 停止查找

### 3. CodeLens — `codelensProvider.ts`

**当前行为**：每行非空、非注释行都显示 `▶ Filter (Ctrl+Enter)` 按钮，并计入 `patternIndex`。

**新行为**：trim 后以 `-` 开头的续行不显示按钮，不计入 `patternIndex`（因为它们不构成独立规则）。

```typescript
if (text === '' || text.startsWith('#') || text.startsWith('-')) continue;
```

### 4. Ctrl+Enter 触发 — `extension.ts` filterCurrentLine

**当前行为**：从光标行向上找到最近的非空、非注释行，然后在线性扫描中将其计为第 N 个 `patternIndex`。

**新行为**：向上查找时跳过 `-` 续行，在 `patternIndex` 计数时也跳过续行。

```typescript
// 向上查找有效规则行（跳过空行、注释、续行）
while (targetLine >= 0) {
  const text = document.lineAt(targetLine).text.trim();
  if (text !== '' && !text.startsWith('#') && !text.startsWith('-')) break;
  targetLine--;
}

// 计算 patternIndex（续行不计入）
let patternIndex = 0;
for (let line = 0; line <= targetLine; line++) {
  const text = document.lineAt(line).text.trim();
  if (text !== '' && !text.startsWith('#') && !text.startsWith('-')) {
    if (line === targetLine) break;
    patternIndex++;
  }
}
```

这样光标在续行上按 Ctrl+Enter，会定位到其所属的 `!` 命令，执行该命令及以上所有规则。

### 5. 边缘情况

| 场景 | 行为 |
|------|------|
| `!sort` 下一行是 `-desc` | 续行，追加 `desc` 到 sort |
| `!sort` 后有 regex 行再接 `-desc` | 停止查找，`-desc` 被当作 regex（会报错） |
| 文件首行就是 `-r 1` | 没有前一个命令，当作 regex 解析 |
| `-\d+` 跟在 `!pivot` 之后 | 被视为续行 token，这是有意为之 —— 约定 `-` 开头在 `!` 后即为参数 |

## 修改清单

### 1. `src/parser.ts`

- 新增 `preprocessLfContent()`：将 `-` 开头续行合并到上方最近的有效行，返回单行化的内容
- `parseLfFile()` 先调用 `preprocessLfContent()` 再执行原有解析逻辑，移除之前的内联续行分支

### 2. `src/completionProvider.ts`

- 新增路径 3：`trimmedPrefix` 以 `-` 开头（非 `!` 行）→ 触发补全
- 新增 `findNearestCommand()` 辅助函数
- 返回对应的 `PARAM_COMPLETIONS`

### 3. `src/codelensProvider.ts`

- 跳过 trim 后以 `-` 开头的续行：`text.startsWith('-')` 时 `continue`

### 4. `src/extension.ts`

- `filterCurrentLine` 的向上查找和 `patternIndex` 计数均跳过续行

## 向后兼容

- 单行命令不受影响，解析结果不变
- 已有 `.lf` 文件不需要修改
- 续行属于可选语法，不改变任何已有命令行为

## 未纳入 v0.0.8

- 续行中的行内注释（如 `-r 1 # row field`）
- 参数值的智能补全（如 `-func ` 后提示 `count|sum|avg|min|max`）
