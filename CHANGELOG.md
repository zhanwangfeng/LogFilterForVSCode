## v0.0.9

- Chore: reduce .vsix package size from ~4.4MB to ~50KB by excluding unused icon sizes in `.vscodeignore`

## v0.0.8

- Feat: multi-line command parameters — `-` flags can be written on continuation lines
- Feat: `-` continuation lines auto-merge to the preceding `!` command during parsing
- Feat: completion for `-` on continuation lines, based on the nearest `!` command above
- Feat: CodeLens and `Ctrl+Enter` skip `-` continuation lines

## v0.0.7

- Feat: add `!pivot` command — Excel-style pivot table for log data
- Feat: `-p <regex>` define fields via capture groups
- Feat: `-n <N>:<alias>` field aliases for readable references
- Feat: `-r`, `-c`, `-v` repeatable for multi-level rows, columns, and values
- Feat: `-f <field> [regex]` filter rows (non-null check or regex match)
- Feat: `-func count|sum|avg|min|max` aggregation functions
- Feat: `-sort rows|cols|both|none` sort row/column labels
- Feat: `-fill <text>` custom empty cell filler

## v0.0.6

- Feat: add extension icon to package — icons/icon-128.png displayed on Marketplace

## v0.0.5

- Feat: add `!sort` command — sort lines ascending / descending
- Feat: add `-desc` flag for descending sort
- Feat: add `-regex <pattern>` flag to sort by captured content
- Feat: add `-int` flag for numeric sort (can combine with `-regex`)
- Feat: command parameter system — `!` commands now support `-flag` style parameters

## v0.0.4

- Feat: add `Ctrl+Enter` shortcut — execute the nearest valid filter rule above the cursor
- Feat: CodeLens now shows `▶ Filter (Ctrl+Enter)` to indicate the keyboard shortcut
- Feat: add `logFilter.filterCurrentLine` command

## v0.0.3

- Feat: add `!count` command — merge and count duplicate lines
- Feat: add `!count-consecutive` command — count consecutive duplicate lines (like `uniq -c`)
- Feat: add auto-completion for `!` commands in `.lf` files

## v0.0.2

- Fix: README.md now displayed correctly on Marketplace

## v0.0.1

Initial release of LogFilter — a VS Code extension for pipeline-based log filtering.

### Features

- **Pipeline filtering** — write `.lf` rule files to progressively filter log content
- **Regex matching** — keep matching lines or extract capture groups
- **Deduplication** — remove duplicate lines (`!dedupe`) or consecutive duplicates (`!dedupe-consecutive`)
- **Preview panel** — view filtered results in a dedicated webview panel
- **Step-by-step execution** — click `▶ Filter` on any rule to run up to that line
- **Syntax highlighting** — `.lf` files with full syntax support and `Ctrl+/` comment toggle
