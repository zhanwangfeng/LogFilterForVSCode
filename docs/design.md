# LogFilter - VS Code 扩展设计文档

## 需求

1. 名称：LogFilter
2. 若当前文件为 `.log` 文件，则编辑器右上角显示按钮
3. 按钮逻辑：
   - 读取 `当前文件名.lf`，若该文件存在 → 显示 **OpenPreview** 按钮
   - 若该文件不存在 → 显示 **CreateLogFilter** 按钮
4. 点击 **CreateLogFilter** → 在当前文件同目录下创建 `当前文件名.lf` 文件，自动打开 `.lf` 文件
5. 点击 **OpenPreview** → 读取 `.lf` 中的全部规则，按流水线方式层层筛选/提取，在新标签页中预览结果
6. 若当前文件为 `.lf` 文件，每行规则上方显示 **▶ Filter (Ctrl+Enter)** CodeLens 按钮
7. 点击某行 **▶ Filter (Ctrl+Enter)** → 从 `.lf` 第 1 条规则执行到该行止，对同目录下同名 `.log` 文件进行筛选，预览结果；也可按 `Ctrl+Enter` 快捷键直接触发
8. 按钮状态始终与磁盘上 `.lf` 文件的实际存在状态保持一致：
   - CreateLogFilter 时若 `.lf` 已存在 → 不创建，直接刷新按钮为 OpenPreview
   - OpenPreview 时若 `.lf` 已不存在 → 取消预览，刷新按钮为 CreateLogFilter

## .lf 文件语法

### 规则类型

- 空行被忽略
- 行首 `#` 表示注释，该行被忽略
- 支持 `Ctrl+/` 切换行注释
- 每一行是一条规则，按从上到下的顺序依次执行

规则分为两种类型：

| 类型 | 标识 | 示例 |
|------|------|------|
| **正则筛选** | 不以 `!` 开头的行 | `ERROR` |
| **命令** | 以 `!` 开头的行 | `!dedupe` |

### 语言配置

`language-configuration.json`：

```json
{
  "comments": {
    "lineComment": "#"
  }
}
```

通过 `package.json` 的 `contributes.languages[].configuration` 关联此文件，VS Code 自动启用 `Ctrl+/` 注释切换。

### 正则筛选

每行一个正则表达式，支持捕获组 `()` 作为提取符号。

对当前行集的每一行执行正则匹配：

| 情况 | 行为 |
|------|------|
| 不匹配 | 该行被丢弃 |
| 匹配，**无**捕获组 | 该行完整保留到下一阶段 |
| 匹配，**有**捕获组 | 仅提取捕获组内容，每组捕获内容作为一行输出 |

多捕获组规则：一行匹配产生多行输出（每个捕获组一行）。

正则默认使用 JavaScript `RegExp`，全局匹配（`g` 标志），一行中所有匹配位置均参与提取。非捕获组 `(?:...)` 不作为提取符号。

### 命令

以 `!` 开头的行为命令，作用于当前行集整体，不涉及正则匹配。

| 命令 | 参数 | 说明 |
|------|------|------|
| `!dedupe` | 无 | 去除当前行集中的重复行，保留每条首次出现 |
| `!dedupe-consecutive` | 无 | 去除连续重复行（类似 Unix `uniq`），只保留相邻重复中的第一条 |
| `!count` | 无 | 合并重复行，在行尾以 `(xxx)` 形式标注每条的重复次数 |
| `!count-consecutive` | 无 | 统计连续重复行的出现次数，在行尾以 `(xxx)` 形式标注（类似 `uniq -c`） |
| `!sort` | `-desc` / `-regex <正则>` / `-int` | 对当前行集按字母排序，默认升序；`-desc` 降序；`-regex` 按捕获组提取内容排序；`-int` 按整数排序 |

命令在流水线中占一个步骤编号，CodeLens 同样显示在其上方。命令不区分大小写（`!DEDUPE`、`!Dedupe` 均合法）。

### 自动补全

在 `.lf` 文件中输入 `!` 后，VS Code 自动弹出补全下拉列表，列出所有支持的命令及其说明。持续输入字母可进一步筛选命令列表。

### 完整示例

原始 `app.log`：

```
2024-01-15 10:00:00 ERROR [192.168.1.1] Connection timeout
2024-01-15 10:00:01 INFO [10.0.0.5] Heartbeat received
2024-01-15 10:00:02 ERROR [192.168.1.1] Retry succeeded
2024-01-15 10:00:03 ERROR [192.168.1.1] Timeout again
```

`app.lf`：

```lf
# 筛选出包含 ERROR 的行
ERROR

# 从结果中提取 IP 地址
\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]

# 统计每条 IP 的出现次数
!count

# 从 IP 中提取最后一段
(\d+)$
```

流水线执行过程：

```
Step 0（原始）:
  2024-01-15 10:00:00 ERROR [192.168.1.1] Connection timeout
  2024-01-15 10:00:01 INFO [10.0.0.5] Heartbeat received
  2024-01-15 10:00:02 ERROR [192.168.1.1] Retry succeeded
  2024-01-15 10:00:03 ERROR [192.168.1.1] Timeout again

Step 1（正则：ERROR → 保留整行）:
  2024-01-15 10:00:00 ERROR [192.168.1.1] Connection timeout
  2024-01-15 10:00:02 ERROR [192.168.1.1] Retry succeeded
  2024-01-15 10:00:03 ERROR [192.168.1.1] Timeout again

Step 2（正则：提取 IP）:
  192.168.1.1
  192.168.1.1
  192.168.1.1

Step 3（命令：!count）:
  192.168.1.1 (3)

Step 4（正则：提取最后一段）:
  1
```

## 筛选流水线算法

```
输入: 原始 .log 文件内容（行数组）, .lf 文件中定义的 N 条规则, 截止行号 M (1 ≤ M ≤ N)
输出: 应用前 M 条规则后的结果（行数组）

步骤:
  当前行集 = 原始文件所有行

  对 .lf 中每条规则 (i = 1 到 M):
    if 规则是命令:
      switch 命令:
         case '!dedupe':
           当前行集 = 去重（保留首次出现）
         case '!dedupe-consecutive':
           当前行集 = 去除连续重复行（保留每条连续段的首行）
         case '!count':
            当前行集 = 统计重复次数，每条唯一行后追加 ` (N)`
         case '!count-consecutive':
            当前行集 = 统计连续重复行次数，每条行后追加 ` (N)`
    else:
      regex = new RegExp(规则, 'g')
      hasCapture = 规则中含捕获组
      新行集 = 空数组
      遍历 当前行集 的每一行:
        对该行执行正则匹配
        if 不匹配 → 跳过
        if 匹配:
          if hasCapture:
            将每个捕获组的内容作为一行追加到 新行集
          else:
            将整行追加到 新行集
      当前行集 = 新行集

  返回 当前行集
```

## 技术栈

- TypeScript + VS Code Extension API（Webview API、CodeLens API、CompletionItemProvider API）
- `yo generator-code` 脚手架初始化

## 开发步骤

### Step 1：项目初始化
- 使用 `yo generator-code` 创建 TypeScript 扩展项目
- 名称：`LogFilter`
- 发布者：自定义

### Step 2：注册命令与激活条件（package.json）
- 命令 ID：
  - `logFilter.openPreview` — 完整预览
  - `logFilter.createLogFilter` — 创建 .lf 文件
  - `logFilter.filterUpToLine` — 从 .lf 的某行执行筛选到指定位置
- 标题：
  - `LogFilter: Open Preview`
  - `LogFilter: Create LogFilter File`
  - `LogFilter: Filter Up to This Line`
- activationEvents：
  - `onCommand:logFilter.openPreview`
  - `onCommand:logFilter.createLogFilter`
  - `onLanguage:lf`（编辑 .lf 文件时激活，用于 CodeLens）
- contributes.languages：注册 `.lf` 文件的语言 ID 为 `lf`
- contributes.menus.editor/title：配置 .log 文件的按钮

### Step 3：实现编辑器标题栏按钮（动态切换）
- 通过 `package.json` 的 `menus.editor/title` 贡献点注册两个按钮
- 通过 `setContext` 设置 `logFilter:lfFileExists` 上下文键值，用于 `when` 条件切换
- 仅 .log 文件显示按钮

### Step 4：实现 CreateLogFilter 命令（extension.ts）
1. 获取当前激活编辑器，构造同目录下 `{filename}.lf` 路径
2. 若 `.lf` 已存在 → 跳过，刷新按钮为 OpenPreview
3. 若不存在 → 创建空文件，提示成功，刷新按钮，自动打开 `.lf` 文件

### Step 5：注册 .lf 语言（package.json）

```json
"contributes": {
  "languages": [{
    "id": "lf",
    "extensions": [".lf"],
    "aliases": ["LogFilter"],
    "configuration": "./language-configuration.json"
  }]
}
```

### Step 6：实现 CodeLens 提供者（codelensProvider.ts）
- 注册 `vscode.languages.registerCodeLensProvider`，语言范围为 `lf`
- 对 `.lf` 文件的每一非空、非注释行（无论正则还是命令），在其上方创建一个 CodeLens：
  - `title`: `▶ Filter (Ctrl+Enter)`
  - `command`: `logFilter.filterUpToLine`
  - `arguments`: `[{lineIndex, lfUri, logUri}]` — 当前行号、.lf 文件 URI、对应 .log 文件 URI
- 当 `.lf` 文件内容变更时自动刷新 CodeLens（`onDidChangeEvent`）

### Step 7：实现 filterUpToLine 命令（extension.ts）
1. 从命令参数中获取 `{lineIndex, lfUri, logUri}`
2. 读取 `.lf` 文件内容，解析为规则对象数组
3. 截取前 `lineIndex + 1` 条规则
4. 读取 `.log` 文件内容（行数组）
5. 调用筛选引擎 `applyFilter(logLines, rules.slice(0, lineIndex + 1))`
6. 在新标签页中预览结果
7. 预览顶部注明 "前 N 条规则已应用（共 M 条）"

### Step 8：实现 .lf 解析器（parser.ts）
- 解析为规则对象数组
- 每条规则解析为 `{ type: 'regex', pattern: string }` 或 `{ type: 'command', command: string }`
- 忽略空行和 `#` 注释行
- 正则规则校验合法性（`new RegExp()` 是否抛出异常）
- 命令规则校验是否支持该命令

### Step 9：实现筛选引擎（filterEngine.ts）
- 函数 `applyFilter(lines: string[], rules: Rule[]): string[]`
- 按规则类型分发：
  - `regex` → 正则逻辑（无捕获组过滤保留整行，有捕获组提取捕获内容）
  - `command` → 根据命令名执行对应操作
- 命令操作实现：
  - `dedupe`：用 `Set` 记录已见行，只保留首次出现的行
  - `dedupe-consecutive`：只保留与前一行不同的行
  - `count`：用 `Map` 统计每行出现次数，输出时在行尾追加 ` (N)`
  - `count-consecutive`：统计连续相同行的出现次数，输出时在行尾追加 ` (N)`

### Step 10：实现 OpenPreview 命令（extension.ts）
1. 检查 `.lf` 文件是否存在（不存在则刷新按钮并取消）
2. 读取 `.lf` 文件内容，解析为规则数组
3. 读取 `.log` 文件内容（行数组）
4. 调用筛选引擎 `applyFilter(logLines, rules)` 得到最终行集
5. 将结果渲染到 webview 的 HTML 中（`<pre>` 标签原样展示）
6. 在预览标题上方注明 "N 条规则已应用"

### Step 11：语法高亮（syntaxes/lf.tmLanguage.json）
- 创建 TextMate grammar 文件，对 `.lf` 文件中的三种类型着色：
  - `#` 注释 → 绿色（comment.line.lf）
  - `!` 命令 → 紫色（keyword.control.lf）
  - 正则表达式 → 默认文本色
- 在 `package.json` 的 `contributes.grammars` 中注册

### Step 12：适配主题与样式
- 读取 `vscode.ColorThemeKind`，应用对应 CSS（深色/浅色）
- 使用 `editor.fontFamily`、`editor.fontSize` 配置保持与原编辑器字体一致

### Step 13：打包与调试
- 按 F5 启动 Extension Development Host
- 打开 `.log` 文件 → 验证右上角按钮出现（根据 `.lf` 文件是否存在显示不同按钮）
- 点击 CreateLogFilter → 验证 `.lf` 文件已创建，按钮切换为 OpenPreview
- 点击 OpenPreview → 验证预览标签页已创建
- 打开 `.lf` 文件 → 验证每行上方出现 ▶ Filter 按钮
- 点击某行 ▶ Filter → 验证预览结果只应用到该行

### Step 14：实现命令自动补全（completionProvider.ts）
- 注册 `vscode.languages.registerCompletionItemProvider`，语言范围为 `lf`，触发字符为 `!`
- 在 `.lf` 文件中输入 `!` 后自动弹出补全列表，列出所有支持的命令
- 每项补全附带说明文字（detail）和详细文档（documentation）
- 持续输入字母可进一步筛选匹配的命令

### Step 15：实现 filterCurrentLine 命令（extension.ts）
- 注册命令 `logFilter.filterCurrentLine`，绑定快捷键 `Ctrl+Enter`
- 获取当前光标所在行号
- 从当前行向上查找最近的**非空、非注释**行（跳过空行和 `#` 注释行）
- 计算该行对应的 `patternIndex`（从文件开头到目标行之间的有效规则数）
- 调用 `filterUpToLine` 执行过滤
- 在 `package.json` 中注册快捷键 `ctrl+enter`，限定 `when: editorLangId == lf`
- CodeLens 标题更新为 `▶ Filter (Ctrl+Enter)` 以示提示

## 目录结构

```
LogFilter/
├── .vscode/
├── src/
│   ├── extension.ts            # 主入口
│   ├── parser.ts               # .lf 文件解析器（支持命令）
│   ├── filterEngine.ts         # 筛选引擎（支持命令）
│   ├── codelensProvider.ts     # CodeLens 提供者
│   └── completionProvider.ts   # 命令自动补全
├── syntaxes/
│   └── lf.tmLanguage.json      # 语法高亮
├── language-configuration.json # 注释配置
├── package.json
├── tsconfig.json
└── README.md
```

## 界面示意

### .lf 文件编辑器

```
┌──────────────────────────────────────────────┐
│  app.lf                                       │
│                                               │
│  ▶ Filter (Ctrl+Enter)                        │
│  # 筛选出包含 ERROR 的行                      │
│  ERROR                                        │
│                                               │
│  ▶ Filter (Ctrl+Enter)                        │
│  # 从结果中提取 IP 地址                       │
│  \[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]    │
│                                               │
│  ▶ Filter (Ctrl+Enter)                        │
│  # 统计出现次数                                │
│  !count                                       │
│                                               │
│  ▶ Filter (Ctrl+Enter)                        │
│  # 从 IP 中提取最后一段                       │
│  (\d+)$                                       │
└──────────────────────────────────────────────┘
```

### 预览标签页（点击 !count 所在行的 ▶ Filter）

```
┌──────────────────────────────────────────────┐
│  app.log (Preview) - 3 rule(s) applied       │
│                                              │
│  192.168.1.1 (3)                             │
└──────────────────────────────────────────────┘
```

### 原日志文件与预览（OpenPreview）

```
┌─────────────────────────┬─────────────────────────────┐
│  原日志文件 (log)        │  预览标签页 (Preview)       │
│                         │                             │
│  175.21.110.90 ...     │  192.168.1.1                 │
│  121.41.14.193 ...     │  192.168.1.1                 │
│  175.24.112.201 ...    │  ─── 筛选后结果 ───          │
│  ...                    │  ...                        │
└─────────────────────────┴─────────────────────────────┘
         ← 左右分栏对比 →
```

## 备注

- 仅 `.log` 文件在编辑器标题栏显示 OpenPreview / CreateLogFilter 按钮
- 按钮根据 `当前文件名.lf` 是否存在动态切换，状态始终与磁盘实际状态对齐
- 编辑 `.lf` 文件时，每行规则上方显示 ▶ Filter (Ctrl+Enter) CodeLens
- 点击某行 ▶ Filter (Ctrl+Enter) 或按 `Ctrl+Enter`，从原文件开始执行第 1 条到该行的全部规则，输出最终结果到预览窗口
- OpenPreview 始终执行全部规则
- 筛选流水线：每条规则的输出作为下一条规则的输入
- 无捕获组 → 纯过滤（保留整行）；有捕获组 → 提取（仅保留捕获内容）
- 以 `!` 开头的行为命令，作用于当前行集整体，不逐行匹配
- `!dedupe` 去除全局重复，`!dedupe-consecutive` 仅去连续重复，`!count` 在去重基础上于行尾标注重复次数 `(N)`，`!count-consecutive` 统计连续重复行次数并在行尾标注 `(N)`
- 命令不区分大小写，扩展方便
- `.lf` 文件修改后 CodeLens 自动刷新；修改后需重新点击 OpenPreview 生效（不监听文件变更）
