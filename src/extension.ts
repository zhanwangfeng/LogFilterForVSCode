import * as vscode from 'vscode';
import * as path from 'path';
import { parseLfFile, Rule } from './parser';
import { applyFilter } from './filterEngine';
import { LfCodeLensProvider } from './codelensProvider';
import { LfCompletionProvider } from './completionProvider';

const previewPanels = new Map<string, vscode.WebviewPanel>();

function buildPreviewHtml(resultLines: string[], appliedCount: number, totalCount: number): string {
  const config = vscode.workspace.getConfiguration('editor');
  const fontFamily = config.get<string>('fontFamily') || 'Consolas, monospace';
  const fontSize = config.get<number>('fontSize') || 14;
  const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
                 vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;

  const bg = isDark ? '#1e1e1e' : '#ffffff';
  const fg = isDark ? '#d4d4d4' : '#000000';
  const resultText = resultLines.join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    margin: 0;
    padding: 16px;
    background-color: ${bg};
    color: ${fg};
    font-family: ${fontFamily};
    font-size: ${fontSize}px;
    line-height: 1.5;
  }
  .header {
    margin-bottom: 12px;
    padding: 8px 12px;
    background-color: ${isDark ? '#2d2d2d' : '#f0f0f0'};
    border-radius: 4px;
    font-size: ${fontSize - 2}px;
    opacity: 0.8;
  }
  pre {
    margin: 0;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: inherit;
    font-size: inherit;
  }
</style>
</head>
<body>
<div class="header">${appliedCount} rule(s) applied (of ${totalCount}) · ${resultLines.length} line(s)</div>
<pre>${escapeHtml(resultText)}</pre>
</body>
</html>`;
}

function showPreview(logFileName: string, resultLines: string[], appliedCount: number, totalCount: number) {
  const existing = previewPanels.get(logFileName);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Beside, true);
    existing.webview.html = buildPreviewHtml(resultLines, appliedCount, totalCount);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'logFilterPro.preview',
    `${logFileName} (Preview)`,
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: false }
  );
  panel.webview.html = buildPreviewHtml(resultLines, appliedCount, totalCount);
  panel.onDidDispose(() => previewPanels.delete(logFileName));
  previewPanels.set(logFileName, panel);
}

export function activate(context: vscode.ExtensionContext) {
  function getLfFileUri(): vscode.Uri | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') return undefined;
    const filePath = editor.document.uri.fsPath;
    const dir = path.dirname(filePath);
    const baseName = path.basename(filePath, path.extname(filePath));
    return vscode.Uri.file(path.join(dir, baseName + '.lf'));
  }

  function getLogFileUri(): vscode.Uri | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== 'file') return undefined;
    return editor.document.uri;
  }

  function lfToLogUri(lfUri: vscode.Uri): vscode.Uri {
    const dir = path.dirname(lfUri.fsPath);
    const baseName = path.basename(lfUri.fsPath, path.extname(lfUri.fsPath));
    return vscode.Uri.file(path.join(dir, baseName + '.log'));
  }

  async function lfFileExists(): Promise<boolean> {
    const lfUri = getLfFileUri();
    if (!lfUri) return false;
    try {
      await vscode.workspace.fs.stat(lfUri);
      return true;
    } catch {
      return false;
    }
  }

  async function refreshLfContext(): Promise<void> {
    const exists = await lfFileExists();
    await vscode.commands.executeCommand('setContext', 'logFilterPro:lfFileExists', exists);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => refreshLfContext())
  );

  refreshLfContext();

  context.subscriptions.push(
    vscode.commands.registerCommand('logFilterPro.createLogFilterPro', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
      }

      const lfUri = getLfFileUri();
      if (!lfUri) return;

      if (await lfFileExists()) {
        await refreshLfContext();
        return;
      }

      try {
        await vscode.workspace.fs.writeFile(lfUri, new Uint8Array());
        vscode.window.showInformationMessage(`Created ${path.basename(lfUri.fsPath)}`);
        await refreshLfContext();
        await vscode.commands.executeCommand('vscode.open', lfUri);
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to create .lf file: ${err}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logFilterPro.openPreview', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
      }

      if (!(await lfFileExists())) {
        await refreshLfContext();
        return;
      }

      const lfUri = getLfFileUri()!;
      const logUri = getLogFileUri()!;

      let lfContent: string;
      let logContent: string;
      try {
        lfContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(lfUri));
        logContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(logUri));
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to read file: ${err}`);
        return;
      }

      let rules: Rule[];
      try {
        rules = parseLfFile(lfContent);
      } catch (err) {
        vscode.window.showErrorMessage(`${err}`);
        return;
      }

      if (rules.length === 0) {
        vscode.window.showWarningMessage('.lf file is empty — no filters to apply');
        return;
      }

      const logLines = logContent.replace(/\r\n/g, '\n').split('\n');
      const filteredLines = applyFilter(logLines, rules);
      const fileName = path.basename(logUri.fsPath);

      showPreview(fileName, filteredLines, rules.length, rules.length);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logFilterPro.filterUpToLine', async (args: { patternIndex: number; lfUri: vscode.Uri }) => {
      const { patternIndex, lfUri } = args;
      const logUri = lfToLogUri(lfUri);

      let lfContent: string;
      let logContent: string;
      try {
        lfContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(lfUri));
        logContent = new TextDecoder().decode(await vscode.workspace.fs.readFile(logUri));
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to read file: ${err}`);
        return;
      }

      let rules: Rule[];
      try {
        rules = parseLfFile(lfContent);
      } catch (err) {
        vscode.window.showErrorMessage(`${err}`);
        return;
      }

      if (patternIndex < 0 || patternIndex >= rules.length) return;

      const activeRules = rules.slice(0, patternIndex + 1);
      const logLines = logContent.replace(/\r\n/g, '\n').split('\n');
      const filteredLines = applyFilter(logLines, activeRules);
      const fileName = path.basename(logUri.fsPath);

      showPreview(fileName, filteredLines, activeRules.length, rules.length);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logFilterPro.filterCurrentLine', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'lf') {
        vscode.window.showErrorMessage('No active .lf file found');
        return;
      }

      const document = editor.document;
      const currentLine = editor.selection.active.line;

      let targetLine = currentLine;
      while (targetLine >= 0) {
        const text = document.lineAt(targetLine).text.trim();
        if (text !== '' && !text.startsWith('#') && !text.startsWith('-')) break;
        targetLine--;
      }

      if (targetLine < 0) {
        vscode.window.showWarningMessage('No valid filter line found');
        return;
      }

      let patternIndex = 0;
      for (let line = 0; line <= targetLine; line++) {
        const text = document.lineAt(line).text.trim();
        if (text !== '' && !text.startsWith('#') && !text.startsWith('-')) {
          if (line === targetLine) break;
          patternIndex++;
        }
      }

      const lfUri = document.uri;
      await vscode.commands.executeCommand('logFilterPro.filterUpToLine', { patternIndex, lfUri });
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider('lf', new LfCodeLensProvider())
  );

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider('lf', new LfCompletionProvider(), '!', '-')
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function deactivate() {}
