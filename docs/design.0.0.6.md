# LogFilter v0.0.6 — 扩展图标配置

## 目标

为 VS Code 扩展添加 Marketplace 及扩展列表中的显示图标。

## 修改内容

### 1. 图标文件

在 `icons/` 目录下存放多尺寸 PNG 图标：

| 文件 | 尺寸 |
|------|------|
| `icons/icon-128.png` | 128×128 |
| `icons/icon-256.png` | 256×256 |
| `icons/icon-512.png` | 512×512 |
| `icons/icon-1024.png` | 1024×1024 |
| `icons/icon-2048.png` | 2048×2048 |

### 2. package.json

在 `package.json` 根字段中增加 `icon` 字段，指向 128×128 图标：

```json
{
  "icon": "icons/icon-128.png"
}
```

VS Code 要求：
- 图标必须为 PNG 格式
- 建议尺寸为 128×128（会被缩放到 128×128 显示）
- `icon` 字段路径相对于扩展根目录

### 3. .vscodeignore

`.vscodeignore` 中无需额外配置，`icons/` 目录未被排除，打包时会自动包含图标文件。
