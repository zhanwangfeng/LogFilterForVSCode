# LogFilter v0.0.11 — `!sort` 增加 `-drop-unmatched` 参数

## 目标

`!sort` 在使用 `-regex` 时，不匹配正则的行默认保留（以自身为排序键）。现增加 `-drop-unmatched` 参数，控制是否丢弃不匹配的行。

## 改动

在 `src/filterEngine.ts` 的 `!sort` 分支中：

- 解析参数时检测 `-drop-unmatched`
- 排序前先用 `-regex` 过滤掉不匹配的行（仅在 `-drop-unmatched` 开启时）
- 其后对剩余行进行排序

## 修改清单

| 文件 | 改动 |
|------|------|
| `src/filterEngine.ts` | `!sort` 分支增加 `-drop-unmatched` 处理 |
| `src/completionProvider.ts` | 补全提示增加 `-drop-unmatched` 文档 |
| `docs/usage.md` | `!sort` 表格增加 `-drop-unmatched` 说明 |
| `docs/design.0.0.11.md` | 本文件 |
| `CHANGELOG.md` | 追加 v0.0.11 变更 |
