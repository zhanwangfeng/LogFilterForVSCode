import * as vscode from 'vscode';

export class LfCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    let patternIndex = 0;

    for (let line = 0; line < document.lineCount; line++) {
      const text = document.lineAt(line).text.trim();
      if (text === '' || text.startsWith('#') || text.startsWith('-')) continue;

      lenses.push(
        new vscode.CodeLens(
          new vscode.Range(line, 0, line, 0),
          {
            title: '▶ Filter (Ctrl+Enter)',
            command: 'logFilter.filterUpToLine',
            arguments: [{ patternIndex, lfUri: document.uri }],
          }
        )
      );
      patternIndex++;
    }

    return lenses;
  }
}
