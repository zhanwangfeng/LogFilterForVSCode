# LogFilterPro v0.0.17 — 预览标签页按文件名复用

## 目标

### 1. 预览标签页复用

当前行为：每次执行预览（`openPreview`、`filterUpToLine`、`filterCurrentLine` → `showPreview`）都会调用 `vscode.window.createWebviewPanel`，导致同一个日志文件的预览结果在多个标签页中重复打开。

目标行为：**每个日志文件名只打开一个预览标签页**。

- 若该文件名的预览标签页尚未打开 → 新建标签页（`ViewColumn.Beside`，`preserveFocus: true`）
- 若该文件名的预览标签页已存在且未被关闭 → 复用该标签页（`reveal` 到 `Beside` 列）并刷新 `webview.html` 内容
- 标签页被用户关闭后 → 从缓存中移除，下次预览重新创建

### 2. 版本号升级

`0.0.16` → `0.0.17`

## 改动

| 文件 | 改动 |
|------|------|
| `src/extension.ts` | 新增模块级 `previewPanels: Map<string, WebviewPanel>`；将 HTML 构建抽取为 `buildPreviewHtml`；`showPreview` 改为先查缓存，命中则 `reveal` + 刷新 html，未命中则新建并注册 `onDidDispose` 清理缓存 |
| `package.json` | version → 0.0.17 |
| `package-lock.json` | version 同步 |
| `CHANGELOG.md` | 追加 v0.0.17 变更 |
| `docs/design.0.0.17.md` | 本文件 |

## 实现细节

```ts
const previewPanels = new Map<string, vscode.WebviewPanel>();

function showPreview(logFileName, resultLines, appliedCount, totalCount) {
  const existing = previewPanels.get(logFileName);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Beside, true);
    existing.webview.html = buildPreviewHtml(...);
    return;
  }
  const panel = vscode.window.createWebviewPanel(...);
  panel.webview.html = buildPreviewHtml(...);
  panel.onDidDispose(() => previewPanels.delete(logFileName));
  previewPanels.set(logFileName, panel);
}
```

## 风险与边界

- 缓存键为日志文件名（`path.basename`），同名不同目录的文件会复用同一标签页——与现有标题 `${logFileName} (Preview)` 一致，行为可接受。
- 标签页关闭后由 `onDidDispose` 清理，无内存泄漏。
- 主题（深/浅色）在每次刷新时重新读取 `activeColorTheme`，刷新后配色与当前主题一致。
