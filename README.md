# LogFilter

[![Visual Studio Marketplace Version](https://vsmarketplacebadges.dev/version-short/logfilter.LogFilter.svg)](https://marketplace.visualstudio.com/items?itemName=logfilter.LogFilter)
[![Visual Studio Marketplace Installs](https://vsmarketplacebadges.dev/installs/logfilter.LogFilter.svg)](https://marketplace.visualstudio.com/items?itemName=logfilter.LogFilter)

A VS Code extension for pipeline-based log filtering. Write `.lf` rule files to filter, extract, and deduplicate log file content, then preview results directly in VS Code.

## Features

- **Pipeline filtering**: Each rule's output feeds into the next, enabling progressive refinement
- **Regex filtering**: Keep lines matching a regex, or extract capture groups
- **Deduplication**: Remove duplicate lines globally or consecutively
- **Preview panel**: View filtered results in a dedicated webview panel
- **Step-by-step execution**: Click `▶ Filter (Ctrl+Enter)` on any rule to run from the start up to that rule
- **Quick execution**: Press `Ctrl+Enter` on any line to run the nearest valid rule above the cursor
- **Syntax highlighting**: `.lf` files have full syntax highlighting and comment toggling (`Ctrl+/`)

## Quick Start

### Step 1: Create a .lf file

Open any `.log` file and click the **CreateLogFilter** button in the editor title bar. This creates a `.lf` file with the same name in the same directory.

### Step 2: Write filter rules

Edit the `.lf` file with rules:

```lf
# Lines starting with # are comments

# Plain regex — keeps matching lines
ERROR

# Capture groups — extracts only captured content
\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]

# Commands starting with !
!dedupe
```

### Step 3: Preview results

Go back to the `.log` file and click **OpenPreview** in the editor title bar. For step-by-step execution, click `▶ Filter (Ctrl+Enter)` on any line in the `.lf` file, or press `Ctrl+Enter` with the cursor on that line.

## Rule Syntax

### Comments

```
# This is a comment (line must start with `#` followed by a space)
```

### Regex patterns

Each line is a JavaScript regex applied to every line of the current set:

| Case | Behavior |
|------|----------|
| No match | Line is discarded |
| Match, no capture group `()` | Full line passes to next stage |
| Match, with capture group `()` | Only captured content is extracted, one group per line |

```lf
# Keep lines containing ERROR (plain filter)
ERROR

# Extract IP addresses (capture group extraction)
\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]

# Global flag g — multiple matches per line
(\w+)
```

### Commands

Lines starting with `!` operate on the entire current line set:

| Command | Description |
|---------|-------------|
| `!dedupe` | Remove duplicate lines globally, keep first occurrence |
| `!dedupe-consecutive` | Remove consecutive duplicate lines (like `uniq`) |
| `!count` | Merge duplicate lines, append repetition count `(N)` to each line |
| `!count-consecutive` | Count consecutive duplicate lines (like `uniq -c`) |
| `!sort` | Sort lines ascending (`-desc` descending, `-regex <pattern>` sort by captured content, `-int` numeric sort) |

```lf
ERROR
\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]
!dedupe
```

## Pipeline Mechanism

Each rule's output serves as the input for the next rule:

```
Raw log → Rule 1 → Result 1 → Rule 2 → Result 2 → ... → Preview
```

Example execution:

```
Raw log:
  ERROR [192.168.1.1] timeout
  INFO [10.0.0.5] heartbeat
  ERROR [192.168.1.1] retry

Rule 1: ERROR
  → Keeps lines with ERROR (2 lines)

Rule 2: \[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]
  → Extracts IP addresses (2 lines: 192.168.1.1 / 192.168.1.1)

Rule 3: !dedupe
  → Deduplicates (1 line: 192.168.1.1)
```

## Editor Features

### .log file operations

- **CreateLogFilter**: Creates a `.lf` file (button in editor title bar)
- **OpenPreview**: Applies all rules from the `.lf` file and shows preview

### .lf file operations

- **`▶ Filter (Ctrl+Enter)`**: CodeLens button above each rule, runs from rule 1 to that line
- **`Ctrl+Enter`**: Run the nearest valid rule above the cursor (skips comments and blank lines)
- **Syntax highlighting**: Comments (green), commands (purple), regex (default)
- **`Ctrl+/`**: Toggle line comment

## Installation

Install from [VS Code Marketplace](https://marketplace.visualstudio.com/manage) or build locally:

```bash
npm install
npm run compile
```

Press F5 in VS Code to launch an Extension Development Host for testing.

## Examples

### Example 1: Extract error IPs

`app.log`:
```
2024-01-15 ERROR [10.0.0.1] Connection refused
2024-01-15 INFO [10.0.0.2] Health check OK
2024-01-15 ERROR [10.0.0.1] Retry failed
```

`app.lf`:
```lf
ERROR
\[(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]
!dedupe
```

Preview result:
```
10.0.0.1
```

### Example 2: Extract timestamps

```lf
(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})
```

### Example 3: Multiple capture groups

```lf
(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})[^\[]+\[(\w+)\]
```

Input `192.168.1.1 - admin [ERROR]` produces:
```
192.168.1.1
ERROR
```

## License

MIT
