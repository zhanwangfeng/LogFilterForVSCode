# LogFilterPro v0.0.20 — 无效命令只显示固定文案（无效命令）

## 目标

### 1. 无效规则行只显示「灯泡 + 固定文字」

当前行为：`.lf` 文件中存在无效 `!` 命令（或非法正则）时，该行上方显示 `💡 Unknown command: !foo` / `💡 Invalid regex at line: ...`，即灯泡 + **完整的单行错误描述**（0.0.18 引入）。

目标行为：命令错误时，该行上方**只显示「小灯泡 💡 + 固定文字『无效命令』」**，不再内联展示具体错误内容，避免错误原文占满行上方、干扰阅读。

- 固定文字不随具体错误变化：无论未知命令还是非法正则，统一显示 `💡 无效命令`
- 点击灯泡仍弹出完整错误提示（`logFilterPro.showLfError` 行为不变），保留「点击查看详情」能力
- 文案本地化：VS Code 界面语言为中文时显示「无效命令」，否则显示「Invalid command」
- 随编辑实时刷新：删改该行后灯泡自动出现 / 消失（CodeLens 刷新机制不变）

### 2. 版本号升级

`0.0.19` → `0.0.20`

## 改动

| 文件 | 改动 |
|------|------|
| `src/codelensProvider.ts` | 无效行的 CodeLens `title` 由 `💡 <错误描述>` 改为 `💡 <固定文案>`；`arguments` 仍传真实错误消息（供点击查看）；新增本地化固定文案 helper |
| `package.json` | version → 0.0.20 |
| `package-lock.json` | version 同步 |
| `CHANGELOG.md` | 追加 v0.0.20 变更 |
| `docs/design.0.0.20.md` | 本文件 |

`out/`（编译产物）通过 `npm run compile` 同步刷新。

## 实现细节

### codelensProvider.ts

```ts
function invalidCommandText(): string {
  return vscode.env.language.toLowerCase().startsWith('zh') ? '无效命令' : 'Invalid command';
}

// 无效行 CodeLens
const error = errorsByLine.get(line);
if (error) {
  lenses.push(new vscode.CodeLens(range, {
    title: `💡 ${invalidCommandText()}`,
    command: 'logFilterPro.showLfError',
    arguments: [error],
  }));
}
```

要点：

- `title` 只含灯泡 + 固定文案；具体错误仍通过 `arguments` 传给 `logFilterPro.showLfError`，点击灯泡时 `showWarningMessage(error)` 展示完整错误
- 调试日志保留真实错误消息（`line ${line}: error lens -> "${error}"`），便于排障
- 无新增命令、无新增本地化 key（命令标题 nls 不变）

## 风险与边界

- 无效正则行同样显示「无效命令」文案（与未知命令一致），符合「命令错误统一固定文案」的要求
- 仅修改 CodeLens 标题展示，不改变解析/校验逻辑，`parseLfFile`、`filterUpToLine` 行为不变
- 文案本地化基于 `vscode.env.language` 前缀判断，不引入 l10n 基础设施，与现有「运行时字符串硬编码」约定一致
