import * as vscode from 'vscode';
import * as path from 'path';
import { parseLfFile, Rule } from './parser';
import { applyFilter } from './filterEngine';
import { LfCodeLensProvider } from './codelensProvider';
import { LfCompletionProvider } from './completionProvider';

const previewPanels = new Map<string, vscode.WebviewPanel>();
let codeLensRegistered = false;

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
        // 只校验目标行及以上的命令；下方命令不会被执行，其错误不阻断过滤
        rules = parseLfFile(lfContent, patternIndex);
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
    vscode.commands.registerCommand('logFilterPro.showLfError', (error: string) => {
      console.log(`[LogFilterPro][showLfError] clicked, error="${error}"`);
      vscode.window.showWarningMessage(error);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('logFilterPro.openCommandEditor', async (args: { command: string; line: number; lfUri: vscode.Uri }) => {
      const { command, line, lfUri } = args;
      const document = await vscode.workspace.openTextDocument(lfUri);
      const lineText = document.lineAt(line).text;

      const applyEdit = async (newCommand: string) => {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(lfUri, new vscode.Range(line, 0, line, document.lineAt(line).text.length), newCommand);
        // 移除后续的 - 续行
        for (let i = line + 1; i < document.lineCount; i++) {
          const nextLine = document.lineAt(i).text.trim();
          if (nextLine.startsWith('-')) {
            edit.replace(lfUri, new vscode.Range(i, 0, i, document.lineAt(i).text.length), '');
          } else {
            break;
          }
        }
        await vscode.workspace.applyEdit(edit);
      };

      const createEditor = async (panelId: string, title: string, html: string) => {
        const panel = vscode.window.createWebviewPanel(panelId, title, vscode.ViewColumn.Active, { enableScripts: true });
        panel.webview.html = html;
        return panel;
      };

      let panel: vscode.WebviewPanel;

      switch (command) {
        case 'sort': {
          const params = parseSortParams(lineText);
          const html = buildSortEditorHtml(params, lineText);
          panel = await createEditor('logFilterPro.sortEditor', 'Sort Editor', html);
          panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'apply') {
              await applyEdit(buildSortCommand(message.params));
              panel.dispose();
            } else if (message.type === 'cancel') {
              panel.dispose();
            }
          });
          break;
        }

        case 'dedupe': {
          const html = buildDedupeEditorHtml();
          panel = await createEditor('logFilterPro.dedupeEditor', 'Dedupe Editor', html);
          panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'apply') {
              await applyEdit('!dedupe');
              panel.dispose();
            } else if (message.type === 'cancel') {
              panel.dispose();
            }
          });
          break;
        }

        case 'dedupe-consecutive': {
          const html = buildDedupeConsecutiveEditorHtml();
          panel = await createEditor('logFilterPro.dedupeConsecutiveEditor', 'Dedupe Consecutive Editor', html);
          panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'apply') {
              await applyEdit('!dedupe-consecutive');
              panel.dispose();
            } else if (message.type === 'cancel') {
              panel.dispose();
            }
          });
          break;
        }

        case 'count': {
          const html = buildCountEditorHtml();
          panel = await createEditor('logFilterPro.countEditor', 'Count Editor', html);
          panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'apply') {
              await applyEdit('!count');
              panel.dispose();
            } else if (message.type === 'cancel') {
              panel.dispose();
            }
          });
          break;
        }

        case 'count-consecutive': {
          const html = buildCountConsecutiveEditorHtml();
          panel = await createEditor('logFilterPro.countConsecutiveEditor', 'Count Consecutive Editor', html);
          panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'apply') {
              await applyEdit('!count-consecutive');
              panel.dispose();
            } else if (message.type === 'cancel') {
              panel.dispose();
            }
          });
          break;
        }

        case 'pivot': {
          const params = parsePivotParams(lineText);
          const html = buildPivotEditorHtml(params, lineText);
          panel = await createEditor('logFilterPro.pivotEditor', 'Pivot Editor', html);
          panel.webview.onDidReceiveMessage(async (message) => {
            if (message.type === 'apply') {
              await applyEdit(buildPivotCommand(message.params));
              panel.dispose();
            } else if (message.type === 'cancel') {
              panel.dispose();
            }
          });
          break;
        }

        default:
          vscode.window.showWarningMessage(`No editor available for command: !${command}`);
          return;
      }
    })
  );

  if (!codeLensRegistered) {
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider('lf', new LfCodeLensProvider())
    );
    codeLensRegistered = true;
  }

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

interface SortParams {
  desc: boolean;
  int: boolean;
  dropUnmatched: boolean;
  regex: string;
  skipLine: number;
}

function parseSortParams(lineText: string): SortParams {
  const parts = lineText.slice(1).trim().split(/\s+/);
  const desc = parts.includes('-desc');
  const int = parts.includes('-int');
  const dropUnmatched = parts.includes('-drop-unmatched');
  const regexIdx = parts.indexOf('-regex');
  const regex = regexIdx !== -1 && regexIdx + 1 < parts.length ? parts[regexIdx + 1] : '';
  const skipIdx = parts.indexOf('-skip-line');
  const skipLine = skipIdx !== -1 && skipIdx + 1 < parts.length ? Math.max(0, parseInt(parts[skipIdx + 1], 10) || 0) : 0;
  return { desc, int, dropUnmatched, regex, skipLine };
}

function buildSortCommand(params: SortParams): string {
  const parts: string[] = ['!sort'];
  if (params.desc) parts.push('-desc');
  if (params.int) parts.push('-int');
  if (params.regex) parts.push('-regex', params.regex);
  if (params.dropUnmatched) parts.push('-drop-unmatched');
  if (params.skipLine > 0) parts.push('-skip-line', String(params.skipLine));
  return parts.join(' ');
}

function buildSimpleEditorHtml(cmd: string, description: string, examples: string[]): string {
  const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
                 vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
  const bg = isDark ? '#1e1e1e' : '#ffffff';
  const fg = isDark ? '#d4d4d4' : '#000000';
  const previewBg = isDark ? '#252526' : '#f5f5f5';
  const examplesHtml = examples.map(ex => `<div class="ex">${escapeHtml(ex)}</div>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px;
    background: ${bg}; color: ${fg};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
  }
  h3 { margin: 0 0 8px 0; font-weight: 500; }
  .cmd {
    margin: 12px 0; padding: 10px 12px;
    background: ${previewBg}; border-radius: 4px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 14px;
  }
  .desc { line-height: 1.6; opacity: 0.9; margin-bottom: 12px; }
  .examples { margin: 12px 0; }
  .examples-title { font-weight: 500; margin-bottom: 6px; }
  .ex {
    padding: 6px 10px; margin: 4px 0;
    background: ${previewBg}; border-radius: 3px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 12px;
  }
  .buttons { display: flex; gap: 8px; margin-top: 16px; }
  .btn { padding: 6px 16px; border: none; border-radius: 3px; font-size: 13px; cursor: pointer; }
  .btn-primary { background: #007acc; color: #fff; }
  .btn-primary:hover { background: #005f9e; }
  .btn-secondary { background: ${isDark ? '#3c3c3c' : '#e0e0e0'}; color: ${fg}; }
  .btn-secondary:hover { background: ${isDark ? '#555' : '#ccc'}; }
</style>
</head>
<body>
  <h3>${escapeHtml(cmd)}</h3>
  <div class="cmd">${escapeHtml(cmd)}</div>
  <div class="desc">${escapeHtml(description)}</div>
  ${examples.length > 0 ? `<div class="examples"><div class="examples-title">Examples:</div>${examplesHtml}</div>` : ''}
  <div class="buttons">
    <button class="btn btn-primary" id="btn-apply">Apply</button>
    <button class="btn btn-secondary" id="btn-cancel">Cancel</button>
  </div>
<script>
(function() {
  const vscode = acquireVsCodeApi();
  document.getElementById('btn-apply').addEventListener('click', () => vscode.postMessage({ type: 'apply' }));
  document.getElementById('btn-cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
})();
</script>
</body>
</html>`;
}

function buildDedupeEditorHtml(): string {
  return buildSimpleEditorHtml('!dedupe', 'Removes all duplicate lines from the current result set. Only the first occurrence of each unique line is kept.', [
    '!dedupe',
    '# Input:  A, A, B, C, B  →  Output: A, B, C',
  ]);
}

function buildDedupeConsecutiveEditorHtml(): string {
  return buildSimpleEditorHtml('!dedupe-consecutive', 'Removes consecutive duplicate lines. Only the first occurrence of each run of identical lines is kept.', [
    '!dedupe-consecutive',
    '# Input:  A, A, B, B, A  →  Output: A, B, A',
  ]);
}

function buildCountEditorHtml(): string {
  return buildSimpleEditorHtml('!count', 'Counts occurrences of each unique line. Appends a (count) suffix to each line.', [
    '!count',
    '# Input:  A, A, B  →  Output: A (2), B (1)',
  ]);
}

function buildCountConsecutiveEditorHtml(): string {
  return buildSimpleEditorHtml('!count-consecutive', 'Counts consecutive occurrences of each line. Appends a (count) suffix to each line, resetting the count when the line changes.', [
    '!count-consecutive',
    '# Input:  A, A, B, B, A  →  Output: A (2), B (2), A (1)',
  ]);
}

function buildSortEditorHtml(params: SortParams, currentLine: string): string {
  const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
                 vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
  const bg = isDark ? '#1e1e1e' : '#ffffff';
  const fg = isDark ? '#d4d4d4' : '#000000';
  const inputBg = isDark ? '#3c3c3c' : '#f0f0f0';
  const inputBorder = isDark ? '#555' : '#ccc';
  const labelFg = isDark ? '#aaa' : '#666';
  const previewBg = isDark ? '#252526' : '#f5f5f5';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px;
    background: ${bg}; color: ${fg};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
  }
  .field { margin-bottom: 12px; }
  label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  label.disabled { opacity: 0.5; }
  input[type="checkbox"] { margin: 0; }
  input[type="text"], input[type="number"] {
    width: 100%; padding: 6px 8px;
    background: ${inputBg}; color: ${fg};
    border: 1px solid ${inputBorder}; border-radius: 3px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 13px;
  }
  input[type="text"]:focus, input[type="number"]:focus {
    outline: none; border-color: #007acc;
  }
  .label-text { min-width: 120px; color: ${labelFg}; }
  .hint { font-size: 11px; color: ${labelFg}; margin-left: 126px; margin-top: 2px; }
  .preview {
    margin: 16px 0;
    padding: 10px 12px;
    background: ${previewBg};
    border-radius: 4px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 13px;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .buttons { display: flex; gap: 8px; margin-top: 16px; }
  .btn {
    padding: 6px 16px; border: none; border-radius: 3px;
    font-size: 13px; cursor: pointer;
  }
  .btn-primary { background: #007acc; color: #fff; }
  .btn-primary:hover { background: #005f9e; }
  .btn-secondary { background: ${isDark ? '#3c3c3c' : '#e0e0e0'}; color: ${fg}; }
  .btn-secondary:hover { background: ${isDark ? '#555' : '#ccc'}; }
</style>
</head>
<body>
  <h3 style="margin:0 0 16px 0;font-weight:500;">!sort Parameters</h3>

  <div class="field">
    <label>
      <input type="checkbox" id="chk-desc" ${params.desc ? 'checked' : ''}>
      <span class="label-text">-desc</span>
      <span>Sort in descending order</span>
    </label>
  </div>

  <div class="field">
    <label>
      <input type="checkbox" id="chk-int" ${params.int ? 'checked' : ''}>
      <span class="label-text">-int</span>
      <span>Numeric sort (parse values as integers)</span>
    </label>
  </div>

  <div class="field">
    <label>
      <input type="checkbox" id="chk-drop" ${params.dropUnmatched ? 'checked' : ''}>
      <span class="label-text">-drop-unmatched</span>
      <span>Discard lines not matching regex</span>
    </label>
  </div>

  <div class="field">
    <label>
      <span class="label-text">-regex</span>
      <input type="text" id="txt-regex" value="${escapeHtml(params.regex)}" placeholder="e.g. ^(\\\\d+)" style="flex:1;">
    </label>
    <div class="hint">Sort by captured group content. Requires at least one capture group.</div>
  </div>

  <div class="field">
    <label>
      <span class="label-text">-skip-line</span>
      <input type="number" id="num-skip" value="${params.skipLine}" min="0" style="flex:1;">
    </label>
    <div class="hint">Keep first N lines untouched, sort the rest.</div>
  </div>

  <div class="preview" id="preview">${escapeHtml(buildSortCommand(params))}</div>

  <div class="buttons">
    <button class="btn btn-primary" id="btn-apply">Apply</button>
    <button class="btn btn-secondary" id="btn-cancel">Cancel</button>
  </div>

<script>
(function() {
  const vscode = acquireVsCodeApi();
  const chkDesc = document.getElementById('chk-desc');
  const chkInt = document.getElementById('chk-int');
  const chkDrop = document.getElementById('chk-drop');
  const txtRegex = document.getElementById('txt-regex');
  const numSkip = document.getElementById('num-skip');
  const preview = document.getElementById('preview');

  function getParams() {
    return {
      desc: chkDesc.checked,
      int: chkInt.checked,
      dropUnmatched: chkDrop.checked,
      regex: txtRegex.value,
      skipLine: parseInt(numSkip.value, 10) || 0
    };
  }

  function updatePreview() {
    const p = getParams();
    let cmd = '!sort';
    if (p.desc) cmd += ' -desc';
    if (p.int) cmd += ' -int';
    if (p.regex) cmd += ' -regex ' + p.regex;
    if (p.dropUnmatched) cmd += ' -drop-unmatched';
    if (p.skipLine > 0) cmd += ' -skip-line ' + p.skipLine;
    preview.textContent = cmd;
  }

  [chkDesc, chkInt, chkDrop, txtRegex, numSkip].forEach(el => {
    el.addEventListener('input', updatePreview);
  });

  document.getElementById('btn-apply').addEventListener('click', () => {
    vscode.postMessage({ type: 'apply', params: getParams() });
  });

  document.getElementById('btn-cancel').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });
})();
</script>
</body>
</html>`;
}

export function deactivate() {}

interface PivotParams {
  pattern: string;
  rows: string[];
  cols: string[];
  aliases: string[];
  valueFuncs: { value: string; func: string }[];
  sort: string;
  view: string;
  format: string;
  fill: string;
  filters: { field: string; regex: string }[];
}

function parsePivotParams(lineText: string): PivotParams {
  const parts = lineText.slice(1).trim().split(/\s+/);
  const params: PivotParams = {
    pattern: '', rows: [], cols: [], aliases: [], valueFuncs: [],
    sort: 'none', view: 'tree', format: 'compact',
    fill: '', filters: [],
  };
  for (let i = 0; i < parts.length; i++) {
    switch (parts[i]) {
      case '-p': params.pattern = parts[++i] || ''; break;
      case '-r': params.rows.push(parts[++i] || ''); break;
      case '-c': params.cols.push(parts[++i] || ''); break;
      case '-n': params.aliases.push(parts[++i] || ''); break;
      case '-v': {
        const value = parts[++i] || '';
        if (i + 1 < parts.length && parts[i + 1] === '-func') {
          i++;
          params.valueFuncs.push({ value, func: parts[++i] || 'count' });
        } else {
          params.valueFuncs.push({ value, func: 'count' });
        }
        break;
      }
      case '-func': {
        const func = parts[++i] || 'count';
        if (params.valueFuncs.length > 0) {
          params.valueFuncs[params.valueFuncs.length - 1].func = func;
        }
        break;
      }
      case '-sort': params.sort = parts[++i] || 'none'; break;
      case '-view': params.view = parts[++i] || 'tree'; break;
      case '-table-view-format': params.format = parts[++i] || 'compact'; break;
      case '-fill': params.fill = parts[++i] || ''; break;
      case '-f': {
        const field = parts[++i] || '';
        const regex = i + 1 < parts.length && !parts[i + 1].startsWith('-') ? parts[++i] : '';
        params.filters.push({ field, regex });
        break;
      }
    }
  }
  return params;
}

function buildPivotCommand(params: PivotParams): string {
  const parts: string[] = ['!pivot'];
  if (params.pattern) { parts.push('-p', params.pattern); }
  for (const r of params.rows) parts.push('-r', r);
  for (const c of params.cols) parts.push('-c', c);
  for (const a of params.aliases) parts.push('-n', a);
  for (const vf of params.valueFuncs) {
    parts.push('-v', vf.value);
    if (vf.func !== 'count') parts.push('-func', vf.func);
  }
  if (params.sort !== 'none') parts.push('-sort', params.sort);
  if (params.view !== 'tree') parts.push('-view', params.view);
  if (params.format !== 'compact') parts.push('-table-view-format', params.format);
  if (params.fill) parts.push('-fill', params.fill);
  for (const f of params.filters) {
    parts.push('-f', f.field);
    if (f.regex) parts.push(f.regex);
  }
  return parts.join(' ');
}

function buildPivotEditorHtml(params: PivotParams, currentLine: string): string {
  const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
                 vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrast;
  const bg = isDark ? '#1e1e1e' : '#ffffff';
  const fg = isDark ? '#d4d4d4' : '#000000';
  const inputBg = isDark ? '#3c3c3c' : '#f0f0f0';
  const inputBorder = isDark ? '#555' : '#ccc';
  const labelFg = isDark ? '#aaa' : '#666';
  const previewBg = isDark ? '#252526' : '#f5f5f5';

  const filtersHtml = params.filters.map((f, i) =>
    `<div class="pair-row">
      <input type="text" class="filter-field" value="${escapeHtml(f.field)}" placeholder="field index/alias">
      <input type="text" class="filter-regex" value="${escapeHtml(f.regex)}" placeholder="regex (optional)">
    </div>`
  ).join('');

  const valueFuncsHtml = params.valueFuncs.length > 0
    ? params.valueFuncs.map((vf, i) =>
        `<div class="pair-row">
          <input type="text" class="vf-value" value="${escapeHtml(vf.value)}" placeholder="field index/alias" style="flex:1;">
          <select class="vf-func" style="width:120px;">
            ${['count', 'sum', 'avg', 'min', 'max'].map(f => `<option value="${f}" ${vf.func === f ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>`
      ).join('')
    : `<div class="pair-row">
        <input type="text" class="vf-value" placeholder="field index/alias" style="flex:1;">
        <select class="vf-func" style="width:120px;">
          ${['count', 'sum', 'avg', 'min', 'max'].map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 20px;
    background: ${bg}; color: ${fg};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
  }
  h3 { margin: 0 0 16px 0; font-weight: 500; }
  .field { margin-bottom: 10px; }
  .field label { display: flex; align-items: center; gap: 8px; }
  .field label .label-text { min-width: 100px; color: ${labelFg}; }
  input[type="text"], input[type="number"], select, textarea {
    width: 100%; padding: 5px 7px;
    background: ${inputBg}; color: ${fg};
    border: 1px solid ${inputBorder}; border-radius: 3px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 13px;
  }
  input[type="text"]:focus, select:focus, textarea:focus { outline: none; border-color: #007acc; }
  select { font-family: inherit; }
  .hint { font-size: 11px; color: ${labelFg}; margin-left: 108px; margin-top: 2px; }
  .pair-row { display: flex; gap: 6px; margin-bottom: 4px; align-items: center; }
  .pair-row input { flex: 1; }
  .btn-add { font-size: 11px; padding: 2px 8px; background: none; border: 1px dashed ${inputBorder}; color: ${labelFg}; border-radius: 3px; cursor: pointer; margin-top: 2px; }
  .btn-add:hover { border-color: #007acc; color: #007acc; }
  .preview {
    margin: 16px 0; padding: 10px 12px;
    background: ${previewBg}; border-radius: 4px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 13px; white-space: pre-wrap; word-break: break-all;
  }
  .buttons { display: flex; gap: 8px; margin-top: 16px; }
  .btn { padding: 6px 16px; border: none; border-radius: 3px; font-size: 13px; cursor: pointer; }
  .btn-primary { background: #007acc; color: #fff; }
  .btn-primary:hover { background: #005f9e; }
  .btn-secondary { background: ${isDark ? '#3c3c3c' : '#e0e0e0'}; color: ${fg}; }
  .btn-secondary:hover { background: ${isDark ? '#555' : '#ccc'}; }
</style>
</head>
<body>
  <h3>!pivot Parameters</h3>

  <div class="field">
    <label><span class="label-text">-p (pattern)</span>
      <input type="text" id="txt-pattern" value="${escapeHtml(params.pattern)}" placeholder="e.g. ^(\\\\S+)\\\\s+(\\\\S+)" style="flex:1;">
    </label>
    <div class="hint">Regex with capture groups defining fields. Required.</div>
  </div>

  <div class="field">
    <label><span class="label-text">-r (rows)</span>
      <input type="text" id="txt-rows" value="${escapeHtml(params.rows.join(', '))}" placeholder="e.g. 1, 2  or  alias_a, alias_b" style="flex:1;">
    </label>
    <div class="hint">Row fields (comma-separated).</div>
  </div>

  <div class="field">
    <label><span class="label-text">-c (columns)</span>
      <input type="text" id="txt-cols" value="${escapeHtml(params.cols.join(', '))}" placeholder="e.g. 3" style="flex:1;">
    </label>
    <div class="hint">Column fields (comma-separated, optional).</div>
  </div>

  <div class="field">
    <label><span class="label-text">-n (aliases)</span>
      <input type="text" id="txt-aliases" value="${escapeHtml(params.aliases.join(', '))}" placeholder="e.g. 1:field1, 2:field2" style="flex:1;">
    </label>
    <div class="hint">Field aliases (comma-separated, format: N:alias).</div>
  </div>

  <div class="field">
    <label style="align-items: flex-start;"><span class="label-text">-v / -func</span></label>
    <div id="valuefuncs-container">
      ${valueFuncsHtml}
    </div>
    <button class="btn-add" id="btn-add-valuefunc">+ Add value</button>
  </div>

  <div class="field">
    <label><span class="label-text">-sort</span>
      <select id="sel-sort" style="flex:1;">
        ${['none', 'rows', 'cols', 'both'].map(s => `<option value="${s}" ${params.sort === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </label>
  </div>

  <div class="field">
    <label><span class="label-text">-view</span>
      <select id="sel-view" style="flex:1;">
        ${['tree', 'list', 'csv', 'tab'].map(v => `<option value="${v}" ${params.view === v ? 'selected' : ''}>${v}</option>`).join('')}
      </select>
    </label>
  </div>

  <div class="field">
    <label><span class="label-text">-table-view-format</span>
      <select id="sel-format" style="flex:1;">
        ${['compact', 'aligned'].map(f => `<option value="${f}" ${params.format === f ? 'selected' : ''}>${f}</option>`).join('')}
      </select>
    </label>
  </div>

  <div class="field">
    <label><span class="label-text">-fill</span>
      <input type="text" id="txt-fill" value="${escapeHtml(params.fill)}" placeholder="(empty cell filler)" style="flex:1;">
    </label>
  </div>

  <div class="field">
    <label style="align-items: flex-start;"><span class="label-text">-f (filters)</span></label>
    <div id="filters-container">
      ${filtersHtml}
    </div>
    <button class="btn-add" id="btn-add-filter">+ Add filter</button>
  </div>

  <div class="preview" id="preview">${escapeHtml(buildPivotCommand(params))}</div>

  <div class="buttons">
    <button class="btn btn-primary" id="btn-apply">Apply</button>
    <button class="btn btn-secondary" id="btn-cancel">Cancel</button>
  </div>

<script>
(function() {
  const vscode = acquireVsCodeApi();
  const funcOptions = ['count', 'sum', 'avg', 'min', 'max'].map(f => '<option value="' + f + '">' + f + '</option>').join('');

  function getParams() {
    const rows = document.getElementById('txt-rows').value.split(/\\s*,\\s*/).filter(Boolean);
    const cols = document.getElementById('txt-cols').value.split(/\\s*,\\s*/).filter(Boolean);
    const aliases = document.getElementById('txt-aliases').value.split(/\\s*,\\s*/).filter(Boolean);
    const valueFuncs = [];
    document.querySelectorAll('#valuefuncs-container .pair-row').forEach(row => {
      const value = row.querySelector('.vf-value').value.trim();
      if (value) valueFuncs.push({ value, func: row.querySelector('.vf-func').value });
    });
    const filters = [];
    document.querySelectorAll('#filters-container .pair-row').forEach(row => {
      const field = row.querySelector('.filter-field').value.trim();
      if (field) filters.push({ field, regex: row.querySelector('.filter-regex').value.trim() });
    });
    return {
      pattern: document.getElementById('txt-pattern').value,
      rows, cols, aliases, valueFuncs,
      sort: document.getElementById('sel-sort').value,
      view: document.getElementById('sel-view').value,
      format: document.getElementById('sel-format').value,
      fill: document.getElementById('txt-fill').value,
      filters,
    };
  }

  function updatePreview() {
    const p = getParams();
    let parts = ['!pivot'];
    if (p.pattern) parts.push('-p', p.pattern);
    p.rows.forEach(r => parts.push('-r', r));
    p.cols.forEach(c => parts.push('-c', c));
    p.aliases.forEach(a => parts.push('-n', a));
    p.valueFuncs.forEach(vf => { parts.push('-v', vf.value); if (vf.func !== 'count') parts.push('-func', vf.func); });
    if (p.sort !== 'none') parts.push('-sort', p.sort);
    if (p.view !== 'tree') parts.push('-view', p.view);
    if (p.format !== 'compact') parts.push('-table-view-format', p.format);
    if (p.fill) parts.push('-fill', p.fill);
    p.filters.forEach(f => { parts.push('-f', f.field); if (f.regex) parts.push(f.regex); });
    document.getElementById('preview').textContent = parts.join(' ');
  }

  document.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updatePreview));

  document.getElementById('btn-add-valuefunc').addEventListener('click', () => {
    const container = document.getElementById('valuefuncs-container');
    const row = document.createElement('div');
    row.className = 'pair-row';
    row.innerHTML = '<input type="text" class="vf-value" placeholder="field index/alias" style="flex:1;"><select class="vf-func" style="width:120px;">' + funcOptions + '</select>';
    container.appendChild(row);
    row.querySelectorAll('input, select').forEach(el => el.addEventListener('input', updatePreview));
    updatePreview();
  });

  document.getElementById('btn-add-filter').addEventListener('click', () => {
    const container = document.getElementById('filters-container');
    const row = document.createElement('div');
    row.className = 'pair-row';
    row.innerHTML = '<input type="text" class="filter-field" placeholder="field index/alias"><input type="text" class="filter-regex" placeholder="regex (optional)">';
    container.appendChild(row);
    row.querySelectorAll('input').forEach(el => el.addEventListener('input', updatePreview));
    updatePreview();
  });

  document.getElementById('btn-apply').addEventListener('click', () => {
    vscode.postMessage({ type: 'apply', params: getParams() });
  });
  document.getElementById('btn-cancel').addEventListener('click', () => {
    vscode.postMessage({ type: 'cancel' });
  });
})();
</script>
</body>
</html>`;
}
