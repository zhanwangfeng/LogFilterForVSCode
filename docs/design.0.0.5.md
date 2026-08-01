# LogFilterPro v0.0.5 — 命令参数系统 & !sort 命令

## 目标

1. 为 `!` 命令引入通用参数系统，支持 Linux 风格的 `-flag` 参数
2. 新增 `!sort` 命令，参数 `-desc` 支持降序，参数 `-regex <正则>` 支持按提取内容排序

## 总体设计

### CommandRule 扩展

`CommandRule` 增加 `params` 字段保存参数列表：

```typescript
interface CommandRule {
  type: 'command';
  command: string;   // 命令名，如 'sort'
  params: string[];  // 参数数组，如 ['-desc']
}
```

### 解析规则

```
!命令名 [参数1] [参数2] ...
```

- 行首 `!` 后第一个空格前的部分为**命令名**，转小写匹配
- 后续以空格分割，每项作为一个**参数**，保留原始大小写
- 示例：`!sort -desc` → `{ command: 'sort', params: ['-desc'] }`

### 参数处理方式

每个命令的 case 内自行解析 params，引擎不做统一校验。不支持的参数可以忽略或报错，由各命令自行决定。

### 参数类型

两种参数风格：
- **标志型**：如 `-desc`，存在即表示开启某项功能
- **取值型**：如 `-regex <正则>`，参数名后紧跟的值作为参数值

取值型参数按位置解析：在 `params` 中找到 `-regex`，则其后一项即为正则表达式字符串。

---

## 修改清单

### 1. parser.ts — 支持参数解析

```typescript
export interface CommandRule {
  type: 'command';
  command: string;
  params: string[];
}
```

解析逻辑变更（伪代码）：

```typescript
if (line.startsWith('!')) {
  const parts = line.slice(1).trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const params = parts.slice(1);
  if (!SUPPORTED_COMMANDS.has(cmd)) {
    throw new Error(`Unknown command: ${line}`);
  }
  rules.push({ type: 'command', command: cmd, params });
}
```

### 2. filterEngine.ts — 排序逻辑

switch 新增 `case 'sort'`：

```typescript
case 'sort': {
  const desc = rule.params.includes('-desc');
  const regexIdx = rule.params.indexOf('-regex');
  const regex = regexIdx !== -1 && regexIdx + 1 < rule.params.length
    ? new RegExp(rule.params[regexIdx + 1])
    : null;

  currentLines = [...currentLines].sort((a, b) => {
    const ka = regex ? regex.exec(a)?.[1] ?? a : a;
    const kb = regex ? regex.exec(b)?.[1] ?? b : b;
    const cmp = ka.localeCompare(kb);
    return desc ? -cmp : cmp;
  });
  break;
}
```

要点：
- 使用 `rule.params.includes('-desc')` 检测降序
- `-regex <正则>` 从 params 中取出正则字符串，创建 RegExp 对象
- 对每行执行 `regex.exec()`，取第一个捕获组 `[1]` 作为排序键；若行不匹配则回退到整行
- `-int` 将 ka/kb 通过 `parseInt(String(...), 10)` 转为整数后做数值比较（`ka - kb`），而非字符串比较
- 默认升序，`-desc` 时反转比较结果

### 3. completionProvider.ts — 自动补全

- `COMMAND_COMPLETIONS` 中保留 `!sort`，移除单独的 `!sort -desc` 和 `!sort -regex` 条目
- 新增 `PARAM_COMPLETIONS` 数组，按 `command` 分组管理各命令的参数补全
- 注册 `-` 为触发字符（与 `!` 并列）
- 补全逻辑分两条路径：
  - 输入 `!` 时弹出命令补全（现有逻辑）
  - 输入 `!命令名 -` 时弹出该命令的参数补全

```typescript
const PARAM_COMPLETIONS: (CompletionEntry & { command: string })[] = [
  {
    command: 'sort',
    label: '-desc',
    detail: '降序排序',
    documentation: '对当前行集按字母降序排序。',
  },
  {
    command: 'sort',
    label: '-regex <正则>',
    detail: '按正则提取内容排序',
    documentation: '按正则第一个捕获组 `()` 提取的内容作为排序键。\n示例：`!sort -regex (\\d+)`',
  },
  {
    command: 'sort',
    label: '-int',
    detail: '按整数排序',
    documentation: '将排序键转为整数再比较，适用于数字排序。\n可与 `-regex` 组合使用。',
  },
];
```

```typescript
// 参数补全触发分支
const paramMatch = linePrefix.match(/^!(\S+)\s+-?$/);
if (paramMatch) {
  const cmdName = paramMatch[1].toLowerCase();
  const typed = linePrefix.slice(linePrefix.lastIndexOf('-')).toLowerCase();
  return PARAM_COMPLETIONS
    .filter(p => p.command === cmdName && p.label.toLowerCase().startsWith(typed))
    .map(p => { /* ... */ });
}
```

注册触发字符：
```typescript
vscode.languages.registerCompletionItemProvider('lf', new LfCompletionProvider(), '!', '-')
```

### 4. 文档更新

- `README.md` — 命令表新增 `!sort` / `-desc` / `-regex`
- `docs/design.md` — 命令表新增 `!sort`
- `docs/usage.md` — 命令表新增 `!sort`
- `CHANGELOG.md` — 新增 v0.0.5 条目

---

## 使用示例

### 基础升序
```lf
# 保留 ERROR 行 → 排序
ERROR
!sort
```

### 降序排序
```lf
# 提取 IP → 去重 → 降序排序
\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]
!dedupe
!sort -desc
```

### 按提取内容排序
```lf
# 保留包含时间的行 → 按时间戳排序（而非整行）
\d{2}:\d{2}:\d{2}
!sort -regex (\d{2}:\d{2}:\d{2})
```

### 降序 + 正则提取
```lf
# 按状态码降序排列
\b(\d{3})\b
!dedupe
!sort -desc -regex (\d+)
```

## 向后兼容

- 所有已有命令（`!dedupe` 等）解析后 params 为空数组 `[]`，不影响现有逻辑
- 无需修改已有命令的 case，也无需修改语法高亮（`!` 命令已通用匹配）
- 不影响已有 .lf 文件
