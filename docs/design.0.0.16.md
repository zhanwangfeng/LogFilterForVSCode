# LogFilterPro v0.0.16 — 品牌标识重命名

## 目标

### 1. 扩展标识符重命名

将扩展的所有标识符从 `logfilter` / `LogFilter` 统一改为 `logfilterpro` / `LogFilterPro`：

- 扩展 `name`：`logfilter` → `logfilterpro`（Marketplace ID 变为 `zhanwangfeng.logfilterpro`）
- 语言别名：`LogFilter` → `LogFilterPro`
- 显示名称：`LogFilterPro`（已在 nls 中，本次确认一致）
- 语法文件名称：`LogFilter` → `LogFilterPro`
- 命令前缀：`logFilter.*` → `logFilterPro.*`
- 命令 `createLogFilter` → `createLogFilterPro`
- 上下文键：`logFilter:lfFileExists` → `logFilterPro:lfFileExists`
- 打包脚本输出名：`logfilter-{ver}.vsix` → `logfilterpro-{ver}.vsix`

### 2. 版本号升级

`0.0.15` → `0.0.16`

## 改动

| 文件 | 改动 |
|------|------|
| `package.json` | name→logfilterpro, version→0.0.16, 所有 logFilter.* → logFilterPro.*, createLogFilter → createLogFilterPro, LogFilter alias → LogFilterPro, context key, script output name |
| `package-lock.json` | name + version 同步 |
| `package.nls.json` | displayName, 所有命令标题 LogFilter: → LogFilterPro:, createLogFilter key |
| `package.nls.zh-cn.json` | 同上（中文） |
| `syntaxes/lf.tmLanguage.json` | name: LogFilter → LogFilterPro |
| `src/extension.ts` | 所有命令注册 ID + context key + 命令调用 |
| `src/codelensProvider.ts` | 命令引用 |
| `README.md` | Marketplace 徽章与链接 |
| `README.zh-CN.md` | 同上 |
| `docs/design.0.0.16.md` | 本文件 |
| `CHANGELOG.md` | 追加 v0.0.16 变更 |
