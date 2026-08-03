import * as vscode from 'vscode';
import { validateLfContent } from './parser';

export class LfCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    const errorsByLine = new Map<number, string>();
    for (const err of validateLfContent(document.getText())) {
      errorsByLine.set(err.lineIndex, err.message);
    }
    console.log(
      `[LogFilterPro][CodeLens] file=${document.uri.fsPath} lineCount=${document.lineCount} errors=${JSON.stringify(Array.from(errorsByLine))}`
    );

    let patternIndex = 0;
    for (let line = 0; line < document.lineCount; line++) {
      const text = document.lineAt(line).text.trim();
      if (text === '' || text.startsWith('#') || text.startsWith('-')) continue;

      const range = new vscode.Range(line, 0, line, 0);
      const error = errorsByLine.get(line);
      if (error) {
        console.log(`[LogFilterPro][CodeLens] line ${line}: error lens -> "${error}"`);
        lenses.push(
          new vscode.CodeLens(range, {
            title: `💡 ${invalidCommandText()}`,
            command: 'logFilterPro.showLfError',
            arguments: [error],
          })
        );
      } else {
        console.log(`[LogFilterPro][CodeLens] line ${line}: filter lens patternIndex=${patternIndex}`);
        lenses.push(
          new vscode.CodeLens(range, {
            title: '▶ Filter (Ctrl+Enter)',
            command: 'logFilterPro.filterUpToLine',
            arguments: [{ patternIndex, lfUri: document.uri }],
          })
        );

        // 命令行额外显示 Editor 按钮
        if (text.startsWith('!')) {
          const cmdMatch = text.match(/^!\s*(\S+)/);
          if (cmdMatch) {
            const cmd = cmdMatch[1].toLowerCase();
            console.log(`[LogFilterPro][CodeLens] line ${line}: editor lens command="${cmd}"`);
            lenses.push(
              new vscode.CodeLens(range, {
                title: 'Editor',
                command: 'logFilterPro.openCommandEditor',
                arguments: [{ command: cmd, line, lfUri: document.uri }],
              })
            );
          }
        }
      }
      patternIndex++;
    }

    console.log(`[LogFilterPro][CodeLens] total lenses created: ${lenses.length}`);
    return lenses;
  }
}

function invalidCommandText(): string {
  return vscode.env.language.toLowerCase().startsWith('zh') ? '无效命令' : 'Invalid command';
}
