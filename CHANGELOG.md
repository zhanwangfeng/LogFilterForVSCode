## v0.0.19

- Fix: `.lf` file each rule line shows 2 `▶ Filter (Ctrl+Enter)` buttons — CodeLens provider now registers only once even if the extension activates multiple times

## v0.0.18

- Feat: invalid `!` commands / invalid regex lines now show a 💡 lightbulb + one-line error message inline in place of the Filter button; clicking the lightbulb still shows the full error
- Feat: clicking `▶ Filter` / `Ctrl+Enter` now only validates commands at and above the target line — errors below (which never execute) no longer block filtering; `openPreview` still validates the whole file
- Fix: `-` continuation line merging keeps line numbers aligned (placeholder lines), fixing error-to-line misalignment that made the lightbulb never appear
- Chore: declare CodeLens command `logFilterPro.showLfError` in package.json so the editor renders the lightbulb CodeLens
- Chore: add `[LogFilterPro]` debug logs and nls titles for the new command

## v0.0.17

- Feat: preview panel now reuses one tab per log filename — re-running a filter on the same file refreshes the existing preview tab instead of opening a new one

## v0.0.16

- Chore: rename extension identifier `logfilterpro` → `logfilterpro` (Marketplace ID: `zhanwangfeng.logfilterpro`)
- Chore: rename brand `LogFilterPro` → `LogFilterPro` (display name, language alias, tmLanguage name, command titles)
- Chore: rename command prefix `logFilterPro.*` → `logFilterPro.*` (e.g. `logFilterPro.openPreview`, `logFilterPro.createLogFilterPro`)
- Chore: rename context key `logFilterPro:lfFileExists` → `logFilterPro:lfFileExists`
- Chore: rename vsix output `logfilterpro-{ver}.vsix` → `logfilterpro-{ver}.vsix`
- Chore: update README marketplace badges and links to new publisher + extension name

## v0.0.15

- Chore: update extension publisher from `logfilterpro` to `zhanwangfeng` (Marketplace URL, badge links, README docs all updated)
- Chore: bump version to 0.0.15

## v0.0.14

- Feat: `!pivot -view tree|list|csv|tab` — display modes (tree = hierarchical subtotals, list = flat, csv/tab = delimited export)
- Feat: `!pivot -table-view-format compact|aligned` — compact (default) or aligned columns with `┿` separator line
- Feat: `!pivot -n <别名>` — auto-numbered aliases when the index is omitted (`-n a -n b` = `-n 1:a -n 2:b`)
- Feat: `!pivot` multi-value column headers show `-v 参数(函数)` (e.g. `copy_id(sum)`, `1(count)`) to identify each value column
- Feat: `!sort -skip-line <N>` — keep the first N lines untouched, sort the rest
- Fix: `!pivot` no longer requires `-c` — row-only aggregation (`-r`) produces a single-column summary
- Fix: `!pivot` reports `no matching rows` instead of rendering an empty table
- Fix: log lines split with `\r\n` preserved (CRLF files) so commands match correctly

## v0.0.13

- Feat: README 添加演示 GIF（`docs/usage_show.gif`），直观展示过滤流程

## v0.0.12

- Feat: `.lf` syntax highlighting now colors `-` parameter flags (e.g. `-desc`, `-regex`, `-drop-unmatched`) with a distinct color

## v0.0.11

- Feat: `!sort` add `-drop-unmatched` flag — discard lines that don't match `-regex` pattern

## v0.0.10

- Fix: `!pivot` separator line alignment — `┿` now correctly aligns with `│` in header/data rows

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
- Feat: add `logFilterPro.filterCurrentLine` command

## v0.0.3

- Feat: add `!count` command — merge and count duplicate lines
- Feat: add `!count-consecutive` command — count consecutive duplicate lines (like `uniq -c`)
- Feat: add auto-completion for `!` commands in `.lf` files

## v0.0.2

- Fix: README.md now displayed correctly on Marketplace

## v0.0.1

Initial release of LogFilterPro — a VS Code extension for pipeline-based log filtering.

### Features

- **Pipeline filtering** — write `.lf` rule files to progressively filter log content
- **Regex matching** — keep matching lines or extract capture groups
- **Deduplication** — remove duplicate lines (`!dedupe`) or consecutive duplicates (`!dedupe-consecutive`)
- **Preview panel** — view filtered results in a dedicated webview panel
- **Step-by-step execution** — click `▶ Filter` on any rule to run up to that line
- **Syntax highlighting** — `.lf` files with full syntax support and `Ctrl+/` comment toggle
