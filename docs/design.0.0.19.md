# LogFilterPro v0.0.19 — 修复 .lf 文件每行显示 2 个 ▶ Filter 按钮

## 目标

### 1. 修复 BUG：同一条规则行上方显示 2 个 ▶ Filter (Ctrl+Enter) 按钮

当前行为：打开 `.lf` 文件时，**每一行规则上方都显示 2 个 `▶ Filter (Ctrl+Enter)` 按钮**（所有规则行都是如此）。

目标行为：每行规则上方只显示 1 个 `▶ Filter (Ctrl+Enter)` 按钮。

### 2. 版本号升级

`0.0.18` → `0.0.19`

## 根因分析

`src/codelensProvider.ts` 的 `provideCodeLenses` 对每一有效规则行只 `push` **一个** CodeLens（要么 `💡` 灯泡、要么 `▶ Filter`），且 `src/extension.ts` 中只调用了一次 `vscode.languages.registerCodeLensProvider('lf', ...)`。从单次激活的静态逻辑看，同一行只返回 1 个 lens。

但同一行渲染出 **2 个相同按钮**，说明实际有两个 CodeLens provider 同时向 `lf` 语言注册并返回了相同的 lens。可能的重复注册来源：

- 扩展被 **激活两次**（例如 `activationEvents` 同时包含 `onLanguage:lf` 与其它 `onCommand:*` 触发的激活），`activate()` 被执行两次，`registerCodeLensProvider` 被注册两次；
- **同一工作区同时加载了该扩展的两个来源**（如开发版 + 已安装版、或旧版残留），各自注册一个 provider；
- 手动执行过 `activate()`（有些调试导流下会重复调用）。

由于 VS Code 会把所有匹配文档语言的 CodeLens provider 的结果**合并渲染**，两个 provider 返回相同标题/位置的 lens 时，就会在每一行叠加显示 2 个 `▶ Filter`。

## 修复方案

采用**防御性防重复注册**：在 `activate()` 内维护一个模块级注册标志位，确保 CodeLens provider 只注册一次；若 `activate()` 被重复调用，直接跳过已注册的 provider（保持已注册实例不变）。同时为编译产物与源码一致，重新 `npm run compile` 刷新 `out/`。

```ts
// extension.ts
let codeLensRegistered = false;

// ... 在 activate() 内：
if (!codeLensRegistered) {
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider('lf', new LfCodeLensProvider())
  );
  codeLensRegistered = true;
}
```

说明：

- 模块级 `codeLensRegistered` 保证即使扩展 host 重复执行 `activate()`，也只会注册一个 provider，从源头避免同一行叠加 2 个按钮。
- `activationEvents` 维持现状（补全 provider 等其它注册每次激活都要执行，无需防重；重复激活时仅 CodeLens 被拦截）。
- 不改变 CodeLens 的渲染逻辑（每行仍返回 1 个 lens），不引入额外 UI 改动。

## 改动

| 文件 | 改动 |
|------|------|
| `src/extension.ts` | 新增模块级 `codeLensRegistered` 标志；`registerCodeLensProvider('lf', ...)` 包裹在 `if (!codeLensRegistered)` 内，仅注册一次 |
| `package.json` | version → 0.0.19 |
| `package-lock.json` | version 同步 |
| `CHANGELOG.md` | 追加 v0.0.19 变更 |
| `docs/design.0.0.19.md` | 本文件 |

`out/`（编译产物）通过 `npm run compile` 同步刷新。

## 验证

1. `npm run compile` 编译通过；
2. 打开 `.lf` 文件，确认每行规则上方只显示 **1 个** `▶ Filter (Ctrl+Enter)`；
3. 无效规则行仅显示 1 个 `💡` 灯泡（不叠加 Filter）；
4. 重复激活（F5 调试多次 / 手动重新加载）后仍只显示 1 个按钮。