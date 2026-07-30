import * as vscode from 'vscode';

interface CompletionEntry {
  label: string;
  detail: string;
  documentation: string;
}

const COMMAND_COMPLETIONS: CompletionEntry[] = [
  {
    label: '!dedupe',
    detail: '去除全局重复行',
    documentation: '去除当前行集中的重复行，保留每条首次出现。',
  },
  {
    label: '!dedupe-consecutive',
    detail: '去除连续重复行',
    documentation: '去除连续重复行（类似 Unix `uniq`），只保留相邻重复中的第一条。',
  },
  {
    label: '!count',
    detail: '统计重复次数',
    documentation: '合并重复行，在行尾以 (N) 形式标注每条的重复次数。',
  },
  {
    label: '!count-consecutive',
    detail: '统计连续重复行',
    documentation: '统计连续重复行的出现次数，在行尾以 (N) 形式标注（类似 uniq -c）。',
  },
  {
    label: '!sort',
    detail: '升序排序',
    documentation: '对当前行集按字母排序（默认升序）。支持参数：\n- `-desc` 降序\n- `-regex <正则>` 按捕获组提取内容排序\n- `-int` 按整数排序（可与 `-regex` 组合）',
  },
  {
    label: '!pivot',
    detail: '数据透视表（行×列交叉统计）',
    documentation: '对当前行集做交叉统计，输出二维表格。\n' +
      '用法：\n' +
      '  !pivot -p <正则> -r <字段> [-r <字段>]… -c <字段> [-c <字段>]… [-v <字段>]… [-f <字段> [正则]]…\n\n' +
      '流程：\n' +
      '  1. -p 正则用捕获组定义字段（每个()对应一个字段）\n' +
      '  2. -n <N>:<别名> 为字段设置别名（可选）\n' +
      '  3. -r / -c / -v / -f 引用字段（索引或别名），重复使用添加多个\n\n' +
      '参数：\n' +
      '  -p <正则>    带多个捕获组的正则，定义字段结构\n' +
      '  -n <N>:<别名> 为第 N 个捕获组设置别名\n' +
      '  -r <字段>    行标签（可重复，首次=外层，后续=内层）\n' +
      '  -c <字段>    列标题（可重复）\n' +
      '  -v <字段>    聚合值（可重复）\n' +
      '  -f <字段> [正则]  筛选器，可选正则匹配\n' +
      '  -func <F>    聚合函数 count|sum|avg|min|max（可重复）\n' +
      '  -fill <文本> 空单元格填充\n' +
      '  -sort rows|cols|both|none  排序\n\n' +
      '示例：\n' +
      '  !pivot -p (\\d+\\.\\d+\\.\\d+\\.\\d+).*?(\\d{2}): -n 1:IP -n 2:Hour -r IP -c Hour -func count\n' +
      '  !pivot -p ... -r 1 -r 2 -c 3 -v 4 -func avg -f 1 ERROR',
  },
];

const PARAM_COMPLETIONS: (CompletionEntry & { command: string })[] = [
  {
    command: 'sort',
    label: '-desc',
    detail: '降序排序',
    documentation: '对当前行集按字母降序排序。',
  },
  {
    command: 'sort',
    label: '-regex <正则>',
    detail: '按正则提取内容排序',
    documentation: '按正则第一个捕获组 `()` 提取的内容作为排序键。\n示例：`!sort -regex (\\d+)`',
  },
  {
    command: 'sort',
    label: '-int',
    detail: '按整数排序',
    documentation: '将排序键转为整数再比较，适用于数字排序。\n可与 `-regex` 组合使用。',
  },
  {
    command: 'pivot',
    label: '-p <正则>',
    detail: '字段定义（必填）',
    documentation: '带多个捕获组的正则，每个 () 定义一个字段。\n各字段按捕获组出现顺序编号（1-based）。',
  },
  {
    command: 'pivot',
    label: '-n <N>:<别名>',
    detail: '字段别名',
    documentation: '为第 N 个捕获组设置别名。后续可通过别名引用。\n例：-n 1:IP -n 2:Hour',
  },
  {
    command: 'pivot',
    label: '-r <字段>',
    detail: '行字段（可重复）',
    documentation: '指定行标签字段。可重复使用实现多层嵌套。\n值可以是数字索引或 -n 定义的别名。',
  },
  {
    command: 'pivot',
    label: '-c <字段>',
    detail: '列字段（可重复）',
    documentation: '指定列标题字段。可重复使用实现多层嵌套。\n值可以是数字索引或 -n 定义的别名。',
  },
  {
    command: 'pivot',
    label: '-v <字段>',
    detail: '值字段（可重复）',
    documentation: '指定聚合值字段。可重复使用添加多个值。\n值可以是数字索引或 -n 定义的别名。',
  },
  {
    command: 'pivot',
    label: '-f <字段> [正则]',
    detail: '筛选器（可重复）',
    documentation: '指定筛选字段。可选后跟正则，字段值必须匹配才保留。\n例：-f 1 ERROR  只保留字段1匹配ERROR的行',
  },
  {
    command: 'pivot',
    label: '-func count|sum|avg|min|max',
    detail: '聚合函数（可重复）',
    documentation: 'count:计数 sum:求和 avg:平均 min:最小值 max:最大值。\n可重复使用，与 -v 按顺序一一对应。默认 count。',
  },
  {
    command: 'pivot',
    label: '-fill <文本>',
    detail: '空单元格填充',
    documentation: '设置空白单元格的填充文本。count 默认 0，其他默认 -。',
  },
  {
    command: 'pivot',
    label: '-sort rows|cols|both|none',
    detail: '排序方式',
    documentation: 'rows:行标签排序 cols:列标签排序 both:行列均排序 none:按首次出现顺序。',
  },
];

export class LfCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);

    if (linePrefix.startsWith('!') && !/\s/.test(linePrefix.slice(1))) {
      const typed = linePrefix.slice(1).toLowerCase();
      return COMMAND_COMPLETIONS
        .filter(cmd => cmd.label.slice(1).startsWith(typed))
        .map(cmd => {
          const item = new vscode.CompletionItem(cmd.label, vscode.CompletionItemKind.Keyword);
          item.detail = cmd.detail;
          item.documentation = new vscode.MarkdownString(cmd.documentation);
          item.range = new vscode.Range(position.line, linePrefix.indexOf('!'), position.line, position.character);
          return item;
        });
    }

    const paramMatch = linePrefix.match(/^!(\S+)\s+-?$/);
    if (paramMatch) {
      const cmdName = paramMatch[1].toLowerCase();
      const typed = linePrefix.slice(linePrefix.lastIndexOf('-')).toLowerCase();
      return PARAM_COMPLETIONS
        .filter(p => p.command === cmdName && p.label.toLowerCase().startsWith(typed))
        .map(p => {
          const item = new vscode.CompletionItem(p.label, vscode.CompletionItemKind.Keyword);
          item.detail = p.detail;
          item.documentation = new vscode.MarkdownString(p.documentation);
          item.range = new vscode.Range(position.line, linePrefix.lastIndexOf('-'), position.line, position.character);
          return item;
        });
    }

    const trimmedPrefix = linePrefix.trim();
    if (trimmedPrefix.startsWith('-') && !trimmedPrefix.startsWith('!')) {
      const cmdName = findNearestCommand(document, position);
      if (cmdName) {
        const typed = trimmedPrefix.toLowerCase();
        return PARAM_COMPLETIONS
          .filter(p => p.command === cmdName && p.label.toLowerCase().startsWith(typed))
          .map(p => {
            const item = new vscode.CompletionItem(p.label, vscode.CompletionItemKind.Keyword);
            item.detail = p.detail;
            item.documentation = new vscode.MarkdownString(p.documentation);
            const dashPos = linePrefix.lastIndexOf('-');
            item.range = new vscode.Range(
              position.line,
              dashPos >= 0 ? dashPos : position.character,
              position.line,
              position.character
            );
            return item;
          });
      }
    }

    return [];
  }
}

function findNearestCommand(document: vscode.TextDocument, position: vscode.Position): string | null {
  for (let line = position.line - 1; line >= 0; line--) {
    const text = document.lineAt(line).text.trim();
    if (text.startsWith('!')) {
      const match = text.match(/^!(\w+)/);
      return match ? match[1].toLowerCase() : null;
    }
    if (text === '' || text.startsWith('#') || text.startsWith('-')) continue;
    return null;
  }
  return null;
}
