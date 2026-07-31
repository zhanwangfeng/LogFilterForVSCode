# LogFilter v0.0.14 — `!pivot` 增强

## 目标

### 1. 修复 `!pivot` 强制要求 `-c` 的 Bug

`!pivot` 目前强制要求同时提供 `-r` 和 `-c`，缺一即返回错误 `!pivot: -r and -c are required`。
但实际使用中只需要行分组（`-r`）即可得到按行聚合的汇总表，列（`-c`）应可省略。

本次修复：`!pivot` 只要求 `-r`，`-c` 变为可选。未提供 `-c` 时，输出按行分组的单列汇总表，列标题显示聚合函数名。

### 2. 多值列标题标注值字段引用

多值 `-v` 时，值列标题原只显示聚合函数名（如 `sum`、`count`），无法区分各值列的对应关系。
现在标题显示为 `值字段引用(函数)`，直接使用 `-v` 后的参数：`-v copy_id -func sum` 显示 `copy_id(sum)`，
`-v 1 -func sum -v 2 -func count` 显示 `1(sum)`、`2(count)`。未提供 `-v`（纯计数列）时仅显示函数名。

### 3. `!pivot` 视图与表格格式

新增 `-view tree|list|csv|tab` 与 `-table-view-format compact|aligned`：

- **tree（默认）**：层级树状显示，外层行显示滚动汇总（subtotal），紧凑或对齐两种排版
- **list**：平铺列表，每行完整展示所有层级字段与值列，表头含字段名与 `值(函数)` 标签
- **csv / tab**：逗号 / 制表符分隔导出，便于复制到表格软件（不支持 aligned 对齐）
- **aligned**：`│`/`┿` 精确对齐的分隔线表格；**compact**：内容前后各一个空格、无分隔线

### 4. 别名自动编号

`-n` 省略索引时按出现顺序自动编号：`-n a -n b` 等价于 `-n 1:a -n 2:b`，减少输入。

### 5. `!sort` 跳过前 N 行

新增 `-skip-line <N>`：前 N 行原样保留、不参与排序（也不被 `-drop-unmatched` 过滤），其余行正常排序。
典型场景：日志文件首行表头或列名不需要参与排序。

### 6. 其他修复

- `!pivot` 无匹配行时返回 `!pivot: no matching rows`，而不是渲染空表
- 读取 `.log` 时先将 `\r\n` 归一化为 `\n` 再按行拆分，CRLF 文件中的命令匹配不再出错

## 改动

- `filterEngine.ts`：
  - `!pivot` 校验改为仅要求 `-r`（`!pivot: -r is required`）
  - `colIndices` 为空时不再构建空白多层列标题，改为以聚合函数名作为唯一列标题（多值 `-v` 时并列显示各函数名）
  - 新增 `valueHeaderLabel`：值列标题统一为 `-v 参数(函数)` 格式，应用于 list/tree/csv/tab 视图
  - 新增 `-view`、`-table-view-format` 参数解析与 list/csv/tab 渲染（`renderPivotList`）、tree 对齐渲染与层级小计
  - 新增 `-n <别名>` 自动编号（`autoIdx`）
  - `!sort` 新增 `-skip-line <N>`：跳过前 N 行，其余行排序
  - 新增 `!pivot: no matching rows` 空结果提示
- `extension.ts`：读取日志时归一化 `\r\n` → `\n`
- `completionProvider.ts`：更新 `!pivot`/`!sort` 补全文档，新增 `-view`、`-table-view-format`、`-skip-line` 参数补全

## 修改清单

| 文件 | 改动 |
|------|------|
| `src/filterEngine.ts` | `!pivot` 校验、视图/格式、值列标题、别名自动编号；`!sort -skip-line`；空结果提示 |
| `src/extension.ts` | CRLF 归一化 |
| `src/completionProvider.ts` | 补全文档与新增参数补全 |
| `docs/design.0.0.14.md` | 本文件 |
| `CHANGELOG.md` | 追加 v0.0.14 变更 |
