# LogFilterPro v0.0.21 — 命令编辑器（Webview）

## 目标

为所有 `!` 命令（`dedupe`、`dedupe-consecutive`、`count`、`count-consecutive`、`sort`、`pivot`）增加独立的 Webview 编辑器，让用户通过可视化表单配置命令参数，避免手动编辑命令行的复杂性。

## 改动

| 文件 | 改动 |
|------|------|
| `src/codelensProvider.ts` | 所有命令行（`!` 开头）均显示 `Editor` 按钮，不再仅限 `!sort` |
| `src/extension.ts` | 新增 `openCommandEditor` 分发命令；添加各命令独立编辑器函数 |
| `package.json` | version → 0.0.21；命令 `openSortEditor` → `openCommandEditor` |
| `package-lock.json` | version 同步 |
| `package.nls.json` | 命令标题同步 |
| `CHANGELOG.md` | 追加 v0.0.21 变更 |
| `README.md` / `README.zh-CN.md` | 编辑器功能增加 Editor 按钮说明 |
| `docs/design.0.0.21.md` | 本文件 |

## 实现细节

### codelensProvider.ts

```ts
// 命令行额外显示 Editor 按钮
if (text.startsWith('!')) {
  const cmdMatch = text.match(/^!\s*(\S+)/);
  if (cmdMatch) {
    const cmd = cmdMatch[1].toLowerCase();
    lenses.push(new vscode.CodeLens(range, {
      title: 'Editor',
      command: 'logFilterPro.openCommandEditor',
      arguments: [{ command: cmd, line, lfUri: document.uri }],
    }));
  }
}
```

### extension.ts —— 命令分发

```ts
vscode.commands.registerCommand('logFilterPro.openCommandEditor', async (args) => {
  const { command, line, lfUri } = args;
  switch (command) {
    case 'sort':     /* sort 编辑器 */ break;
    case 'dedupe':   /* dedupe 编辑器 */ break;
    case 'dedupe-consecutive': /* ... */ break;
    case 'count':    /* ... */ break;
    case 'count-consecutive': /* ... */ break;
    case 'pivot':    /* pivot 编辑器 */ break;
    default: vscode.window.showWarningMessage(`No editor available for command: !${command}`);
  }
});
```

### 编辑器分类

**无参数命令**（`dedupe`、`dedupe-consecutive`、`count`、`count-consecutive`）：
- 使用 `buildSimpleEditorHtml(cmd, description, examples)` 生成简约信息面板
- 展示命令名、功能描述、使用示例
- Apply 按钮直接写入该命令

**有参数命令**（`sort`、`pivot`）：
- 使用表单控件（复选框、文本输入、下拉框、动态列表）
- 实时预览生成的命令字符串
- Apply 按钮写入完整命令

### pivot 编辑器特殊设计

- `-n` 字段：逗号分隔，格式 `N:alias`
- `-v` / `-func`：配对动态列表，每行一个文本输入 + 下拉框
- 解析时自动将相邻的 `-v` 和 `-func` 配对

### 续行处理

所有编辑器 Apply 时自动移除后续的 `-` 续行，保持命令简洁。

## 风险与边界

- 仅支持 `SUPPORTED_COMMANDS` 中的命令，未知命令不显示 Editor 按钮（CodeLens 中 `text.startsWith('!')` 会匹配，但分发时 `default` 分支提示无编辑器）
- 无参数命令的编辑器仅展示文档，功能简单但保证所有命令一致性
- 调试日志保留真实命令名，便于排障