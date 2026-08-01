# LogFilter v0.0.15 — 发布者更新与版本号升级

## 目标

### 1. 发布者（Publisher）变更

将扩展发布者从 `logfilter` 改为 `zhanwangfeng`，与 GitHub 仓库所有者一致
（`https://github.com/zhanwangfeng/LogFilterForVSCode`），以便使用正确的身份发布到
VS Code Marketplace。

涉及修改：
- `package.json` 中 `"publisher": "logfilter"` → `"zhanwangfeng"`
- `README.md` / `README.zh-CN.md` 中所有 Marketplace 链接和徽章 URL：
  - Badge: `logfilter.LogFilter` → `zhanwangfeng.LogFilter`
  - Item URL: `logfilter.logfilter` → `zhanwangfeng.logfilter`

### 2. 版本号升级

版本号从 `0.0.14` 升级到 `0.0.15`。

## 改动

- `package.json`：
  - `publisher`: `logfilter` → `zhanwangfeng`
  - `version`: `0.0.14` → `0.0.15`
- `package-lock.json`：`version` 同步更新为 `0.0.15`
- `README.md`：更新 4 处 Marketplace 链接/徽章
- `README.zh-CN.md`：更新 4 处 Marketplace 链接/徽章

## 修改清单

| 文件 | 改动 |
|------|------|
| `package.json` | publisher: logfilter → zhanwangfeng；version: 0.0.14 → 0.0.15 |
| `package-lock.json` | version: 0.0.14 → 0.0.15 |
| `README.md` | Marketplace 徽章与链接：logfilter → zhanwangfeng |
| `README.zh-CN.md` | Marketplace 徽章与链接：logfilter → zhanwangfeng |
| `docs/design.0.0.15.md` | 本文件 |
| `CHANGELOG.md` | 追加 v0.0.15 变更 |
