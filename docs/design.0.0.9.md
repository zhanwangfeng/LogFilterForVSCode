# LogFilter v0.0.9 — 精简 VSIX 体积

## 目标

将 `.vsix` 打包体积从 ~4.4 MB 缩减至 ~50 KB。

## 分析

`vsce package` 的输出显示体积大头来自 `icons/` 目录中未被引用的超大 PNG：

| 文件 | 大小 | 是否被 `package.json` 引用 |
|------|------|--------------------------|
| `icon-128.png` | 31 KB | 是 (`"icon": "icons/icon-128.png"`) |
| `icon-256.png` | 114 KB | 否 |
| `icon-512.png` | 411 KB | 否 |
| `icon-1024.png` | 1.28 MB | 否 |
| `icon-2048.png` | 2.58 MB | 否 |

5 个图标合计约 4.4 MB，但 VS Code Marketplace 只要求 `package.json` 中 `icon` 字段指定的图标文件，其余 4 个超大图标完全不会被使用。

## 改动

在 `.vscodeignore` 中排除无用图标，保留 `icon-128.png`：

```
icons/icon-*.png
!icons/icon-128.png
```

## 修改清单

### `.vscodeignore`

新增两行：排除所有 `icons/icon-*.png`，再重新包含 `icons/icon-128.png`。

## 前后对比

| 指标 | v0.0.8 | v0.0.9 |
|------|--------|--------|
| VSIX 体积 | ~4.4 MB | ~50 KB |
| 打包文件数 | 18 | 15 |
