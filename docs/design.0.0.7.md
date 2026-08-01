# LogFilterPro v0.0.7 — 数据透视命令 `!pivot`

## 目标

为 LogFilterPro 添加 Excel 风格的数据透视（Pivot Table）能力，通过一行 `!pivot` 命令对当前行集做交叉统计，输出格式化二维表格。

## Excel 透视映射

```
┌──────────────────────────────────────────────────────────┐
│                       !pivot                              │
│                                                          │
│  ┌──────────────────────────────────────────────┐        │
│  │  -p <正则> 定义字段结构（每个捕获组=一个字段）          │        │
│  │  例: -p (\d+\.\d+\.\d+\.\d+).*?(\d{2}):.*?(\d{3})   │        │
│  │       └── 字段1 ──┘  └─ 字段2 ─┘  └─ 字段3 ─┘      │        │
│  └──────────────────────────────────────────────┘        │
│                    │  🔽 多次使用同一参数添加多个字段       │        │
│                    │     -r 1 -r 2  (不逗号，用重复)      │        │
│                    │     -c 1 -c 2                       │        │
│                    │     -v 1 -v 2                       │        │
│                    │     -f 1 -f 2                       │        │
│  ┌──────────────────────────────────────────────────┐    │        │
│  │  筛选器 -f 1 -f 2  │  值 -v 1 -v 2  + -func F1…  │    │        │
│  │  行 -r 1 -r 2      │  列 -c 1 -c 2               │    │        │
│  └──────────────────────────────────────────────────┘    │        │
│                                                          │        │
│  每个区域可拖入多个字段，和 Excel 完全一致                │        │
│  -r 1,label,dir 预留，未来支持字段级配置                  │        │
└──────────────────────────────────────────────────────────┘        │
```

| Excel 透视区域 | 命令参数 | 引用方式 |
|----------------|----------|----------|
| **筛选器**（可选） | `-f <字段> [正则]` 可多次 | 引用字段值，可选正则过滤 |
| **行**（必填） | `-r <字段>` 可多次 | 作为行标签（多层嵌套） |
| **列**（必填） | `-c <字段>` 可多次 | 作为列标题（多层嵌套） |
| **值**（可选） | `-v <字段>` 可多次 + `-func F` 可多次 | 作为聚合值；省略则计数 |

## 语法

```
!pivot -p <正则> [-n <N>:<别名>]… [-r <字段>]… [-c <字段>]… [-v <字段>]… [-f <字段> [正则]]… [-func <F>]… [-fill <文本>] [-sort rows|cols|both|none]
```

### 参数一览

| 参数 | Excel 区域 | 必填 | 说明 |
|------|-----------|------|------|
| `-p` | **（定义字段结构）** | **是** | 带多个捕获组的正则，每个 `()` 定义一个字段 |
| `-n` | **（字段别名）** | 否 | 为字段设置别名，格式 `<N>:<别名>`，如 `-n 1:IP -n 2:Hour` |
| `-r` | 行 | **是** | 可多次；值可以是字段索引或别名；首次为最外层，后续为内层嵌套 |
| `-c` | 列 | **是** | 同上，首次为最外层列，后续为内层嵌套列 |
| `-v` | 值 | 否 | 可多次；值可以是字段索引或别名作为聚合值；省略则对 (row, col) 计数 |
| `-f` | 筛选器 | 否 | 可多次；格式 `<字段> [正则]`，字段值匹配正则才保留；省略正则仅检查非空 |
| `-func` | 值汇总方式 | 否 | 可多次，与 `-v` 按顺序一一对应；单次 `-func` 对所有 `-v` 生效；默认 `count` |
| `-fill` | — | 否 | 空单元格填充文本（count 默认 `0`，其他默认 `-`） |
| `-sort` | — | 否 | 排序：`rows` / `cols` / `both` / `none`（默认 `none`） |

### 字段引用规则

`-r` / `-c` / `-v` / `-f` 中的 `<字段>` 可以是：

| 形式 | 示例 | 说明 |
|------|------|------|
| **数字索引** | `-r 1` | 引用 `-p` 的第 1 个捕获组 |
| **别名** | `-r IP` | 引用别名为 `IP` 的字段（需先通过 `-n` 定义） |

```
!pivot -p (\d+\.\d+\.\d+\.\d+).*?(\d{2}): -n 1:IP -n 2:Hour -r IP -c Hour -func count
```

## 核心概念

### 字段定义（`-p`）

`-p` 是一个正则表达式，对每一行执行匹配，每个捕获组 `()` 对应一个**字段**。

```
-p (\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}).*?(\d{2}):.*?(\d{3})
    └────────── 字段1 ──────────┘  └ 字段2 ┘  └ 字段3 ┘
```

- 字段序号从 1 开始
- 非捕获组 `(?:...)` 不计入
- 不匹配 `-p` 的行被跳过

### 字段别名（`-n`）

`-n` 为 `-p` 中的捕获组设置别名，后续可通过别名引用，便于阅读和维护。

```
-p (\d+\.\d+\.\d+\.\d+).*?(\d{2}):.*?(\d+)
-n 1:IP -n 2:Hour -n 3:Latency
-r IP -c Hour -v Latency -func avg
```

- 别名必须唯一
- 别名不区分大小写
- 别名与数字索引可混用：`-r IP -c 2`

### 多字段引用（`-r`, `-c`, `-v`, `-f` 重复使用）

每个参数可重复多次，每次添加一个字段，对应 Excel 中将多个字段拖入同一区域。顺序决定层级：首次为最外层，后续为内层嵌套。

```
# 行嵌套
!pivot -p (...) -n 1:IP -n 2:Method -r IP -r Method -c 3 -func count
#  行 = IP（外层）→ Method（内层）

# 列嵌套
!pivot -p (...) -r 1 -c 2 -c 3 -func count
#  列 = 小时（外层）→ 状态码（内层）

# 多值
!pivot -p (...) -r 1 -c 2 -v 3 -v 4 -func avg -func sum
#  值 = avg(字段3), sum(字段4)

# 多筛选器（带正则过滤）
!pivot -p (...) -n 1:IP -r IP -c 2 -f IP 10\.0\.0\.\d+ -func count
#  筛选器 = IP字段值匹配 10.0.0.x
```

### 筛选器（`-f`）

对应 Excel 的"筛选器"区域。`-f` 有两种用法：

**用法 1 — 非空检查**：只传字段，该字段非空的行才保留。

```
!pivot -p (\d+\.\d+\.\d+\.\d+).*?(\d{2}):.*?(ERROR)? -r 1 -c 2 -f 3 -func count
```

上例 `-f 3`：字段 3（可选捕获组 `(ERROR)?`）非空的行才保留。

**用法 2 — 正则匹配**：后跟正则表达式，字段值必须匹配该正则才保留。

```
# 只保留 IP 以 10.0.0 开头的行
!pivot -p \[(\d+\.\d+\.\d+\.\d+)\] -r 1 -c 2 -f 1 10\.0\.0\.\d+ -func count
```

上例 `-f 1 10\\.0\\.0\\.\\d+`：字段 1（IP）的值必须匹配正则 `10\.0\.0\.\d+`。

```
# 用别名：只保留 Level=ERROR 的行
!pivot -p ... -n 3:Level -r ... -c ... -f Level ERROR
```

多个筛选条件（AND 逻辑）：
```
# 字段2非空 AND 字段1匹配 10.0.0.x
!pivot -p \[(\d+\.\d+\.\d+\.\d+)\].*?(\d{2}):.*?(ERROR)? -r 1 -c 2 -f 2 -f 1 10\.0\.0\.\d+ -func count
```

**解析规则**：
- `-f` 后跟第 1 个 token 为 `<字段>`（索引或别名）
- 若后面还有 token 且不以 `-` 开头，则作为正则条件
- 若后面无 token 或下一个 token 以 `-` 开头，则仅做非空检查

### 聚合函数（`-func`）

| `-func` | Excel 对应 | 默认空单元格填充 |
|---------|-----------|------------------|
| `count` | 计数 | `0` |
| `sum` | 求和 | `-` |
| `avg` | 平均值 | `-` |
| `min` | 最小值 | `-` |
| `max` | 最大值 | `-` |

- 单次 `-func` 对所有 `-v` 字段生效（例如 `-v 3 -v 4 -func sum` = sum(字段3) 和 sum(字段4)）
- 多次 `-func` 与 `-v` 按顺序一一对应（例如 `-v 3 -v 4 -func avg -func sum` = avg(字段3), sum(字段4)）
- 省略 `-v` 时 `-func` 不起作用，固定为 count

### 排序

| `-sort` 值 | 行为 |
|------------|------|
| `none`（默认） | 按首次出现顺序 |
| `rows` | 行标签按字母升序（逐层比较） |
| `cols` | 列标签按字母升序 |
| `both` | 行、列标签均按字母升序 |

多级行排序：先比外层，同值再比内层。

## 输出格式

### 单行单列单值

```
           | 10 | 11 | 12
━━━━━━━━━━━┿━━━━┿━━━━┿━━━━
10.0.0.1   |  3 |  1 |  0
10.0.0.5   |  1 |  5 |  2
```

### 多行嵌套（`-r 1 -r 2`）

```
IP             | Status | Count
━━━━━━━━━━━━━━━┿━━━━━━━━┿━━━━━━
192.168.1.1    │
  GET          │      15
  POST         │       5
10.0.0.5       │
  GET          │      10
  PUT          │       3
```

外层行标签只出现在分组第一行，内层行标签缩进 2 空格。

### 多列嵌套（`-c 1 -c 2`）

```
          │ 10              │ 11
          │ 200   │ 500     │ 200   │ 500
━━━━━━━━━━┿━━━━━━━┿━━━━━━━━━┿━━━━━━━┿━━━━━━━━
10.0.0.1  │    12 │       3 │     8 │      1
10.0.0.5  │     5 │       0 │    10 │      2
```

列标题分多层表头行，每层占一行，用 `│` 分隔层级。

### 多值（`-v 3 -v 4 -func avg -func sum`）

```
          │ avg(字段3)    │ sum(字段4)
          │ 10     │ 11   │ 10     │ 11
━━━━━━━━━━┿━━━━━━━━┿━━━━━━┿━━━━━━━━┿━━━━━━
10.0.0.1  │    302 │  500 │   1510 │  2500
10.0.0.5  │    150 │   50 │    750 │   250
```

当 `-v` 多值与 `-c` 多列同时存在时，值作为列标题的最内层。

### 通用输出规则

- 列宽自动适配每列最大值（表头、行标签、数据）
- 字符串左对齐，数值右对齐
- 分隔符 `｜`（全角竖线），分隔线用 `━` 和 `┿`

## 算法

```
输入: currentLines (string[]), rule.params (string[])
输出: string[]（格式化后的表格行）

1. 解析参数
   - 遍历 params，收集 `-p`, `-n`, `-r`, `-c`, `-v`, `-f`, `-func`, `-fill`, `-sort`
   - `-p` 后跟的正则直接编译（只能出现一次）
   - `-n`：收集别名映射 `{ "IP": 0, "Hour": 1, … }`（0-based）
   - `-r`, `-c`, `-v`：每出现一次，将值解析为索引追加到对应数组：
     - `-r 1 -r IP` → rowIndices = [1, indexOfAlias("IP")]
     - 解析函数：`resolveField(ref, aliasMap)` — 数字直接 parse，字符串查别名
   - `-f`：每出现一次，解析第 1 个 token 为索引；若后跟非 `-` 开头的 token 则为正则
     - `-f 1` → filterRules = [{ idx: 0, regex: null }]
     - `-f IP ERROR` → filterRules = [{ idx: 0, regex: /ERROR/ }]
   - `-func`：追加函数名；单次展开为数组匹配 `-v` 长度
   - 编译 `-p` 的正则

2. 遍历 currentLines，对每行执行 -p 匹配
   for each line in currentLines:
     match ← regex.exec(line); if match === null → skip
     fields = match.slice(1)  // 所有捕获组，按 0-based 索引

     // 筛选器：逐条检查
     for each (idx, regex) in filterRules:
       val = fields[idx]
       if val === undefined or val === "": skip  // 非空检查
       if regex ≠ null and not regex.test(val): skip  // 正则匹配

     // 组合键
     rowKey  ← fields[rowIndices[0]] + '\x00' + fields[rowIndices[1]] + …
     colKey  ← fields[colIndices[0]] + '\x00' + fields[colIndices[1]] + …
     if any component is undefined or "" → skip

     if valIndices ≠ null:
       for i, vi in valIndices:
         val = parseFloat(fields[vi]); if isNaN(val) → skip for this vi
         matrix[rowKey][colKey][i].push(val)
     else:
       matrix[rowKey][colKey][0].push(1)  // count

3. 聚合
   for each (rowKey, colMap) in matrix:
     for each (colKey, valMap) in colMap:
       for each (valIdx, values) in valMap:
         matrix[rowKey][colKey][valIdx] = aggregate(values, funcs[valIdx])

4. 收集有序 key
   rowKeys = sort(unique(rowKeys), rowIndices)
   colKeys = sort(unique(colKeys), colIndices)
   对于多级 key，先比较第 1 个分量，相同再比较第 2 个分量

5. 格式化输出
   // 构建列标题层次
   colHeaderLines[] = buildColHeaders(colKeys, colIndices, valIndices, funcs)
   // 构建数据行
   for each rowKey in rowKeys:
     components = rowKey.split('\x00')
     对每层行标签：外层显示在组首行，内层缩进
     对每个 colKey: 取聚合值，右对齐
     dataRows.push(...)
   // 合并表头 + 分隔线 + 数据行
   return [...colHeaderLines, separatorLine, ...dataRows]
```

### 聚合函数

```typescript
function aggregate(values: number[], func: string): number {
  switch (func) {
    case 'count': return values.length;
    case 'sum':   return values.reduce((a, b) => a + b, 0);
    case 'avg':   return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':   return Math.min(...values);
    case 'max':   return Math.max(...values);
  }
}
```

### 内部数据结构

```typescript
// 三层 Map
type Matrix = Map<
  string,              // rowKey（复合键，\x00 分隔）
  Map<
    string,            // colKey（复合键，\x00 分隔）
    Map<
      number,          // valIdx（0-based，第几个 -v 字段）
      number[]         // 原始值数组
    >
  >
>
```

## 完整示例

### 示例 1：单行单列单值 — IP × 小时

原始 `app.log`：
```
2024-01-15 10:00:00 ERROR [192.168.1.1] Connection timeout
2024-01-15 10:00:01 ERROR [10.0.0.5] Retry failed
2024-01-15 10:00:02 ERROR [192.168.1.1] Timeout again
2024-01-15 11:00:03 ERROR [10.0.0.5] Connection refused
2024-01-15 11:00:04 ERROR [192.168.1.1] Timeout
2024-01-15 12:00:05 ERROR [10.0.0.5] Retry failed
```

`app.lf`：
```lf
ERROR
# 字段1=IP  字段2=小时
!pivot -p \[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\].*?(\d{2}): -r 1 -c 2 -func count
```

预览输出：
```
           | 10 | 11 | 12
━━━━━━━━━━━┿━━━━┿━━━━┿━━━━
192.168.1.1 |  2 |  1 |  0
10.0.0.5    |  1 |  1 |  1
```

### 示例 2：多行嵌套 — IP → Method × 小时

原始 `app.log`：
```
10:00:00 [192.168.1.1] GET /api 200 302ms
10:01:00 [10.0.0.5] POST /auth 201 150ms
10:02:00 [192.168.1.1] GET /health 200 50ms
11:00:00 [10.0.0.5] PUT /data 200 500ms
11:01:00 [192.168.1.1] POST /order 500 100ms
```

```lf
# 字段1=IP  字段2=Method  字段3=小时
# -r 1 -r 2：行先按 IP 分组（外层），再按 Method 分组（内层）
!pivot -p \[(\d+\.\d+\.\d+\.\d+)\]\s+(\w+)\s.*?(\d{2}): -r 1 -r 2 -c 3 -func count
```

预览输出：
```
IP             | 10 | 11
━━━━━━━━━━━━━━━┿━━━━┿━━━━
192.168.1.1    │
  GET          │  2 │  0
  POST         │  0 │  1
10.0.0.5       │
  POST         │  1 │  0
  PUT          │  0 │  1
```

### 示例 3：多列嵌套 — IP × 小时 → 状态码

```lf
# 字段1=IP  字段2=小时  字段3=状态码
# -c 2 -c 3：列先按小时分组（外层），再按状态码分组（内层）
!pivot -p \[(\d+\.\d+\.\d+\.\d+)\].*?(\d{2}):.*?(\d{3})\s -r 1 -c 2 -c 3 -func count
```

预览输出：
```
          │ 10          │ 11
          │ 200 │ 500   │ 200 │ 500
━━━━━━━━━━┿━━━━━┿━━━━━━━┿━━━━━┿━━━━━━
10.0.0.5  │   2 │     0 │   1 │     0
192.168.1 │   1 │     1 │   0 │     1
```

### 示例 4：多值 — IP × 小时，统计计数和平均延时

```lf
# 字段1=IP  字段2=小时  字段3=延时ms
# -v 3 -func count -func avg：对字段3既计数又求平均
!pivot -p \[(\d+\.\d+\.\d+\.\d+)\].*?(\d{2}):.*?(\d+)ms -r 1 -c 2 -v 3 -func count -func avg
```

预览输出：
```
          │ count(字段3)       │ avg(字段3)
          │ 10     │ 11       │ 10      │ 11
━━━━━━━━━━┿━━━━━━━━┿━━━━━━━━━━┿━━━━━━━━━┿━━━━━━━━
10.0.0.5  │      2 │        1 │    150  │    500
192.168.1 │      2 │        1 │    176  │    100
```

### 示例 5：多筛选器 — 配合可选捕获组

```lf
# 字段1=IP  字段2=方法（可选）  字段3=状态码  字段4=延时
# -f 2 -f 3：要求方法字段非空 AND 状态码字段非空
!pivot -p \[(\d+\.\d+\.\d+\.\d+)\]\s+(\w+)?.*?(\d{3})\s.*?(\d+)ms -r 1 -c 2 -v 4 -f 2 -f 3 -func avg
```

### 示例 6：使用别名 + 正则筛选器

```lf
# 用别名让命令更可读
# -n 1:IP  -n 2:Level  -n 3:Latency
# -f Level ERROR  只保留 Level 字段匹配 ERROR 的行
# -f IP 10\.0\.0  只保留 IP 字段含 10.0.0 的行
!pivot -p \[(\d+\.\d+\.\d+\.\d+)\]\s+(\w+).*?(\d+)ms -n 1:IP -n 2:Level -n 3:Latency -r IP -c 2 -v Latency -f Level ERROR -f IP 10\\.0\\.0 -func avg
```

### 示例 7：完整工作流 — 从原始日志到透视

原始 `app.log`：
```
2024-01-15 10:00:00 [192.168.1.1] ERROR GET /api 302ms
2024-01-15 10:01:00 [10.0.0.5] ERROR POST /auth 150ms
2024-01-15 10:02:00 [192.168.1.1] INFO GET /health 50ms
2024-01-15 11:00:00 [10.0.0.5] ERROR PUT /data 500ms
2024-01-15 11:01:00 [192.168.1.1] INFO POST /order 100ms
2024-01-15 11:02:00 [10.0.0.5] ERROR GET /api 302ms
```

`app.lf`：
```lf
# 提取 IP、日志级别、HTTP方法、小时、延时
\[(\d+\.\d+\.\d+\.\d+)\]\s+(ERROR|INFO)\s+(\w+).*?(\d{2}):.*?(\d+)ms
# 透视：IP×Method，筛选只保留 ERROR，统计平均延时
!pivot -p \[(\d+\.\d+\.\d+\.\d+)\]\s+(ERROR|INFO)\s+(\w+).*?(\d{2}):.*?(\d+)ms -n 1:IP -n 2:Level -n 3:Method -n 4:Hour -n 5:Latency -r IP -r Method -c Hour -v Latency -f Level ERROR -func avg
```

预览输出：
```
IP             | 10      | 11
━━━━━━━━━━━━━━━┿━━━━━━━━━┿━━━━━━━━
10.0.0.5       │
  POST         │    150  │
  GET          │         │    302
  PUT          │         │    500
192.168.1.1    │
  GET          │    302  │
```

## 修改清单

### 1. parser.ts

`SUPPORTED_COMMANDS` 新增 `'pivot'`：

```typescript
const SUPPORTED_COMMANDS = new Set([
  'dedupe', 'dedupe-consecutive',
  'count', 'count-consecutive',
  'sort', 'pivot',
]);
```

### 2. filterEngine.ts

在 `applyFilter` 的 switch 中新增 `case 'pivot'`，抽出 `applyPivot` 函数。

```typescript
interface FilterRule {
  fieldIdx: number;       // 字段索引（0-based）
  regex: RegExp | null;   // null 表示仅非空检查
}

interface PivotConfig {
  pattern: RegExp;
  aliasMap: Map<string, number>;  // -n 别名 → 索引
  rowIndices: number[];       // -r 解析后的索引（0-based）
  colIndices: number[];       // -c 解析后的索引
  valIndices: number[] | null;  // -v 解析后的索引（null=计数）
  filters: FilterRule[];      // -f 收集的筛选规则
  funcs: string[];            // -func 收集
  fill: string;
  sort: 'none' | 'rows' | 'cols' | 'both';
}
```

参数解析逻辑：
```typescript
function parsePivotParams(params: string[]): PivotConfig {
  const aliasMap = new Map<string, number>();
  const rowIndices: number[] = [];
  const colIndices: number[] = [];
  const valIndices: number[] = [];
  const filters: FilterRule[] = [];
  const funcs: string[] = [];
  let pattern: RegExp | null = null;
  let fill = '';
  let sort = 'none';

  for (let i = 0; i < params.length; i++) {
    switch (params[i]) {
      case '-p':
        pattern = new RegExp(params[++i]);
        break;
      case '-n': {
        // -n 1:IP → aliasMap["IP"] = 0
        const part = params[++i];
        const colonIdx = part.indexOf(':');
        const idx = parseInt(part.slice(0, colonIdx), 10) - 1;
        const alias = part.slice(colonIdx + 1);
        aliasMap.set(alias.toLowerCase(), idx);
        break;
      }
      case '-r':
        rowIndices.push(resolveField(params[++i], aliasMap));
        break;
      case '-c':
        colIndices.push(resolveField(params[++i], aliasMap));
        break;
      case '-v':
        valIndices.push(resolveField(params[++i], aliasMap));
        break;
      case '-f': {
        // -f <字段> [正则]
        const field = resolveField(params[++i], aliasMap);
        if (i + 1 < params.length && !params[i + 1].startsWith('-')) {
          const re = new RegExp(params[++i]);
          filters.push({ fieldIdx: field, regex: re });
        } else {
          filters.push({ fieldIdx: field, regex: null });
        }
        break;
      }
      case '-func':
        funcs.push(params[++i]);
        break;
      case '-fill':
        fill = params[++i];
        break;
      case '-sort':
        sort = params[++i];
        break;
    }
  }
  // ... 校验和默认值处理
}

function resolveField(raw: string, aliasMap: Map<string, number>): number {
  // "1" → 0 (index)
  // "IP" → aliasMap["ip"] (alias, case-insensitive)
  const asNum = parseInt(raw.split(',')[0], 10);
  if (!isNaN(asNum)) return asNum - 1;
  return aliasMap.get(raw.toLowerCase()) ?? -1;
}
```

核心变更：
- `-n` 收集别名映射，后续引用时按别名查索引
- `-f` 支持可选正则，`FilterRule` 结构包含字段索引和可选正则
- `resolveField` 统一处理数字索引和别名查找

### 3. completionProvider.ts

更新 `!pivot` 补全文档，强调重复参数语法：

```typescript
{
  label: '!pivot',
  detail: '数据透视表（行×列交叉统计）',
  documentation: '对当前行集做交叉统计，输出二维表格。\n' +
    '用法：\n' +
    '  !pivot -p <正则> -r <N> [-r <N>]… -c <N> [-c <N>]… [-v <N>]… [-f <N>]…\n\n' +
    '流程：\n' +
    '  1. -p 正则用捕获组定义字段（每个()对应一个字段）\n' +
    '  2. -r / -c / -v / -f 重复使用，每次添加一个字段\n\n' +
    '参数（可重复）：\n' +
    '  -r <N>       第 N 个捕获组作为行标签（首次=外层，后续=内层）\n' +
    '  -c <N>       第 N 个捕获组作为列标题\n' +
    '  -v <N>       第 N 个捕获组作为聚合值\n' +
    '  -f <N>       第 N 个捕获组作为筛选器（非空行才保留）\n' +
    '  -func <F>    聚合函数 count|sum|avg|min|max\n\n' +
    '其他参数：\n' +
    '  -p <正则>    带多个捕获组的正则，定义字段结构\n' +
    '  -fill <文本> 空单元格填充\n' +
    '  -sort rows|cols|both|none  排序（默认 none）\n\n' +
    '示例：\n' +
    '  !pivot -p (\\d+\\.\\d+\\.\\d+\\.\\d+).*?(\\d{2}): -r 1 -c 2 -func count\n' +
    '  !pivot -p (\\d+\\.\\d+\\.\\d+\\.\\d+).*?(\\d{2}):.*?(\\d+) -r 1 -c 2 -v 3 -func avg\n' +
    '  !pivot -p (...) -r 1 -r 2 -c 3 -func count',
}
```

`PARAM_COMPLETIONS` 更新 `-r`, `-c`, `-v`, `-f` 的文档说明支持重复使用。

### 4. 文档更新

- `README.md` — 命令表新增 `!pivot`
- `docs/design.md` — 命令表新增 `!pivot`
- `CHANGELOG.md` — 新增 v0.0.7 条目

## 向后兼容

- 已有 .lf 文件不受影响，`!pivot` 是新命令
- 不修改任何已有命令的行为
- 不影响语法高亮
- 不影响已有测试

## 未纳入 v0.0.7 的潜在扩展

- **总计行/列**：行尾/列尾增加合计（类似 Excel 的"总计"功能）
- **图表输出**：将透视结果可视化（非纯文本范畴）
