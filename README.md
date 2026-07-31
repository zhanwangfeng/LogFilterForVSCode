# LogFilter

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/logfilter.LogFilter.svg)](https://marketplace.visualstudio.com/items?itemName=logfilter.LogFilter)
[![Installs](https://vsmarketplacebadges.dev/installs/logfilter.LogFilter.svg)](https://marketplace.visualstudio.com/items?itemName=logfilter.LogFilter)

**English** | [中文](README.zh-CN.md)

Pipeline-based log filtering for VS Code. Write `.lf` rule files to filter, extract, and deduplicate log content — preview results instantly.

- GitHub: https://github.com/zhanwangfeng/LogFilterForVSCode
- VSCode: https://marketplace.visualstudio.com/items?itemName=logfilter.logfilter

## Quick Start

1. Open any `.log` file and click **CreateLogFilter** in the editor title bar
2. Edit the `.lf` file with rules:

```lf
# Comments start with #
ERROR                                    # Keep lines matching regex
\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\] # Extract capture groups
!dedupe                                  # Commands start with !
```

3. Go back to the `.log` file and click **OpenPreview**, or press `Ctrl+Enter` on any rule in the `.lf` file

## Rule Syntax

| Type | Description |
|------|-------------|
| `# comment` | Line must start with `#` followed by a space |
| `regex` | Keep matching lines; if capture groups `()`, extract only captured content |
| `!command` | Operate on the entire line set |

### Commands

| Command | Description |
|---------|-------------|
| `!dedupe` | Remove duplicate lines globally |
| `!dedupe-consecutive` | Remove consecutive duplicates (`uniq`) |
| `!count` | Merge duplicates, append count `(N)` |
| `!count-consecutive` | Count consecutive duplicates (`uniq -c`) |
| `!sort` | Sort lines (`-desc`, `-regex <pattern>`, `-int`) |
| `!pivot` | Cross-tabulation (`-p` pattern, `-r` rows, `-c` cols, `-v` values, `-f` filter, `-func` aggregator) |

Parameters can span continuation lines (indented lines starting with `-`):

```lf
!pivot -p (\d+\.\d+\.\d+\.\d+).*?(\d{2}):
  -n 1:IP
  -n 2:Hour
  -r IP
  -c Hour
  -func count
```

## Pipeline

Each rule's output feeds into the next:

```
Raw log → Rule 1 → Rule 2 → ... → Preview
```

Example — extract unique error IPs:

```
Input:
  ERROR [192.168.1.1] timeout
  INFO  [10.0.0.5]   heartbeat
  ERROR [192.168.1.1] retry

Rule 1: ERROR                        → 2 lines (ERROR only)
Rule 2: \[(\d{1,3}\.\d+\.\d+\.\d+)\] → 2 lines (192.168.1.1, 192.168.1.1)
Rule 3: !dedupe                      → 1 line  (192.168.1.1)
```

## Editor Features

- **CreateLogFilter** — Create `.lf` from current `.log` (editor title button)
- **OpenPreview** — Run all rules and show preview
- **`▶ Filter (Ctrl+Enter)`** — Run from rule 1 to the current line
- **`Ctrl+Enter`** (any line) — Run nearest valid rule above cursor
- **`Ctrl+/`** — Toggle comment
- **Syntax highlighting** — Comments (green), commands (purple), regex (default)

## Install

```bash
npm install
npm run compile
```

Press `F5` in VS Code to launch an Extension Dev Host.

Or install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=logfilter.logfilter).

## License

MIT
