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

    return [];
  }
}
