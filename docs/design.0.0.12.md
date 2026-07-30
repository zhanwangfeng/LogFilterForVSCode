# LogFilter v0.0.12 — `.lf` 语法高亮增加 `-` 参数行

## 目标

`.lf` 文件中 `-` 开头的参数行（如 `-desc`、`-regex`、`-p` 等）在 TextMate 语法中没有高亮规则，显示为纯文本。现为这些行增加独立的高亮颜色，与 `#` 注释和 `!` 命令区分。

## 改动

在 `syntaxes/lf.tmLanguage.json` 中：

- 新增 `params` 规则
- 匹配 `^\s*-[\w-]+`（忽略行首空格，匹配 `-` 开头、包含单词字符和 `-` 的标志名，不包含后面的参数值）
- 使用作用域 `entity.other.attribute-name.lf`，在多数主题下显示为橙/黄色

## 修改清单

| 文件 | 改动 |
|------|------|
| `syntaxes/lf.tmLanguage.json` | 新增 `params` 规则，匹配 `-` 开头的参数行 |
| `docs/design.0.0.12.md` | 本文件 |
| `CHANGELOG.md` | 追加 v0.0.12 变更 |
