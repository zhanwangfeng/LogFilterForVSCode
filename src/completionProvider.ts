import * as vscode from 'vscode';

const COMMAND_COMPLETIONS: { label: string; detail: string; documentation: string }[] = [
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
];

export class LfCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _token: vscode.CancellationToken,
    _context: vscode.CompletionContext
  ): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position).text.slice(0, position.character);

    if (!linePrefix.startsWith('!')) return [];

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
}
