/// <reference types="node" />

import * as path from 'path';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as vscode from 'vscode';

const outputChannel = vscode.window.createOutputChannel('Asymptote Export');
let refreshSidebarView: () => void = () => undefined;
const exportOptions = [
  { label: 'Preview PDF in VS Code', value: 'pdf', open: true, extraArgs: [] as string[] },
  { label: 'Export PDF without preview', value: 'pdf', open: false, extraArgs: [] as string[] },
  { label: 'Export SVG without preview', value: 'svg', open: false, extraArgs: [] as string[] },
  { label: 'Export PNG without preview', value: 'png', open: false, extraArgs: [] as string[] },
  { label: 'Export EPS without preview', value: 'eps', open: false, extraArgs: [] as string[] },
  {
    label: 'Ultra-HD Images',
    description: 'Best for lighting, surfaces, and shading',
    value: 'pdf',
    open: true,
    extraArgs: ['-noV', '-render=4'],
  },
  {
    label: 'Maximum Crispness for Printing',
    description: 'Highest render quality for PDF output',
    value: 'pdf',
    open: true,
    extraArgs: ['-noV', '-render=8'],
  },
  {
    label: 'Pure Mathematical Vector',
    description: 'Best for flat lines, math grids, and text',
    value: 'pdf',
    open: true,
    extraArgs: ['-noV', '-render=0'],
  },
];

type SidebarItemKind = 'file' | 'section' | 'action' | 'info';

type BuildState = 'idle' | 'success' | 'failure';

interface BuildSnapshot {
  state: BuildState;
  filePath?: string;
  outputFormat?: string;
  timestamp?: Date;
  message?: string;
}

const buildSnapshots = new Map<string, BuildSnapshot>();

class AsymptoteSidebarItem extends vscode.TreeItem {
  constructor(
    public readonly labelText: string,
    public readonly kind: SidebarItemKind,
    collapsibleState: vscode.TreeItemCollapsibleState,
    command?: vscode.Command,
    public readonly children?: AsymptoteSidebarItem[],
    tooltipText?: string,
    descriptionText?: string,
  ) {
    super(labelText, collapsibleState);
    this.command = command;
    this.tooltip = tooltipText ?? labelText;
    this.description = descriptionText;

    switch (kind) {
      case 'file':
        this.iconPath = new vscode.ThemeIcon('file-code');
        break;
      case 'section':
        this.iconPath = getSectionIcon(labelText);
        break;
      case 'action':
        this.iconPath = getActionIcon(labelText, command);
        break;
      case 'info':
        this.iconPath = new vscode.ThemeIcon('info');
        break;
    }
  }
}

function getSectionIcon(labelText: string): vscode.ThemeIcon {
  const normalized = labelText.toLowerCase();

  if (normalized.includes('build')) {
    return new vscode.ThemeIcon('tools');
  }
  if (normalized.includes('log')) {
    return new vscode.ThemeIcon('output');
  }
  if (normalized.includes('navigate')) {
    return new vscode.ThemeIcon('layout-sidebar-left');
  }
  if (normalized.includes('preset') || normalized.includes('palette')) {
    return new vscode.ThemeIcon('symbol-color');
  }
  if (normalized.includes('structure')) {
    return new vscode.ThemeIcon('list-tree');
  }
  if (normalized.includes('workspace')) {
    return new vscode.ThemeIcon('files');
  }
  if (normalized.includes('document outline')) {
    return new vscode.ThemeIcon('symbol-namespace');
  }

  return new vscode.ThemeIcon('folder-opened');
}

function getActionIcon(labelText: string, command?: vscode.Command): vscode.ThemeIcon {
  const normalized = labelText.toLowerCase();
  const commandId = command?.command ?? '';

  if (normalized.includes('render') || commandId.includes('exportPdfAndOpen')) {
    return new vscode.ThemeIcon('play');
  }
  if (normalized.includes('export') || commandId.includes('exportWithOptions') || commandId.includes('runPresetExport')) {
    return new vscode.ThemeIcon('save-as');
  }
  if (normalized.includes('show output') || commandId.includes('showSidebar')) {
    return new vscode.ThemeIcon('output');
  }
  if (normalized.includes('reveal')) {
    return new vscode.ThemeIcon('folder-opened');
  }
  if (normalized.includes('copy')) {
    return new vscode.ThemeIcon('copy');
  }
  if (normalized.includes('open')) {
    return new vscode.ThemeIcon('open-preview');
  }
  if (normalized.includes('draw')) {
    return new vscode.ThemeIcon('edit');
  }
  if (normalized.includes('label')) {
    return new vscode.ThemeIcon('tag');
  }

  return new vscode.ThemeIcon('circle-small-filled');
}

class AsymptoteSidebarProvider implements vscode.TreeDataProvider<AsymptoteSidebarItem> {
  private readonly changeEmitter = new vscode.EventEmitter<AsymptoteSidebarItem | undefined | void>();

  readonly onDidChangeTreeData = this.changeEmitter.event;
  private workspaceAsyFiles: vscode.Uri[] = [];

  // viewType: 'commands' | 'structure' | 'symbols' determines which section this provider renders
  constructor(
    private readonly viewType: 'commands' | 'structure' | 'symbols',
    private readonly getActiveFilePath: () => string | undefined,
    context: vscode.ExtensionContext,
  ) {
    this.initFileWatcher(context);
  }

  private initFileWatcher(context: vscode.ExtensionContext) {
    vscode.workspace.findFiles('**/*.asy', '**/{node_modules,.git,out}/**', 50).then((files) => {
      this.workspaceAsyFiles = files;
      this.refresh();
    });

    const watcher = vscode.workspace.createFileSystemWatcher('**/*.asy');
    context.subscriptions.push(watcher);
    watcher.onDidCreate(uri => {
      if (!this.workspaceAsyFiles.some(f => f.fsPath === uri.fsPath)) {
        this.workspaceAsyFiles.push(uri);
        this.refresh();
      }
    });
    watcher.onDidDelete(uri => {
      this.workspaceAsyFiles = this.workspaceAsyFiles.filter(f => f.fsPath !== uri.fsPath);
      this.refresh();
    });
  }

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(element: AsymptoteSidebarItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: AsymptoteSidebarItem): Thenable<AsymptoteSidebarItem[]> {
    if (element) {
      return Promise.resolve(element.children ?? []);
    }

    const activeFilePath = this.getActiveFilePath();

    // If no active file, show a hint item for each view
    if (!activeFilePath) {
      const hint = new AsymptoteSidebarItem(
        'Open an .asy file to enable this view',
        'info',
        vscode.TreeItemCollapsibleState.None,
        undefined,
        undefined,
        'The view becomes interactive once an Asymptote file is active.',
      );
      return Promise.resolve([hint]);
    }

    if (this.viewType === 'commands') {
      const buildStatusSection = this.createBuildStatusSection(activeFilePath);

      const buildActionsSection = new AsymptoteSidebarItem(
        'Build Asymptote project',
        'section',
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        [
          this.createActionItem('Render PDF', 'asymptoteBuild.exportPdfAndOpen', 'Render the current file as PDF and open it.'),
          this.createActionItem('Detailed Export...', 'asymptoteBuild.exportWithOptions', 'Choose a format or quality preset.'),
        ],
        'Build and export commands',
      );

      const logSection = new AsymptoteSidebarItem(
        'View log messages',
        'section',
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        [
          this.createActionItem('Show output channel', 'asymptoteBuild.showSidebar', 'Focus the Asymptote activity-bar view.'),
          this.createActionItem('Reveal Output File', 'asymptoteBuild.revealOutputFile', 'Open the generated file location in the file explorer.'),
        ],
        'Recent build status and logs',
      );

      const navigateSection = new AsymptoteSidebarItem(
        'Navigate, select, and edit',
        'section',
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        [
          this.createActionItem('Open Output Folder', 'asymptoteBuild.openOutputFolder', 'Open the folder containing the generated output.'),
          this.createActionItem('Copy Output Path', 'asymptoteBuild.copyOutputPath', 'Copy the generated output path to the clipboard.'),
        ],
        'Utility commands for generated files',
      );

      const exportPresetsSection = new AsymptoteSidebarItem(
        'Export presets',
        'section',
        vscode.TreeItemCollapsibleState.Expanded,
        undefined,
        [
          this.createPresetItem('Preview PDF in VS Code', 'pdf', true, []),
          this.createPresetItem('Export SVG without preview', 'svg', false, []),
          this.createPresetItem('Export PNG without preview', 'png', false, []),
          this.createPresetItem('Export EPS without preview', 'eps', false, []),
          this.createPresetItem('Ultra-HD Images', 'pdf', true, ['-noV', '-render=4']),
          this.createPresetItem('Maximum Crispness for Printing', 'pdf', true, ['-noV', '-render=8']),
          this.createPresetItem('Pure Mathematical Vector', 'pdf', true, ['-noV', '-render=0']),
        ],
        'Quality and format shortcuts',
      );

      return Promise.resolve([buildStatusSection, buildActionsSection, logSection, navigateSection, exportPresetsSection]);
    }

    if (this.viewType === 'structure') {
      // Workspace files limited to current file folder
      const folderChildren = this.workspaceAsyFiles
        .filter((u) => path.dirname(u.fsPath) === path.dirname(activeFilePath))
        .map((file) => this.createWorkspaceFileItem(file, activeFilePath))
        .sort((a, b) => a.labelText.localeCompare(b.labelText));

      if (folderChildren.length === 0) {
        folderChildren.push(
          new AsymptoteSidebarItem('No .asy files in current folder', 'info', vscode.TreeItemCollapsibleState.None, undefined, undefined, 'Place .asy files beside the active file.'),
        );
      }

      const outlineChildren = parseOutlineForFile(activeFilePath).map((o) => new AsymptoteSidebarItem(o.label, 'file', vscode.TreeItemCollapsibleState.None, {
        command: 'vscode.open',
        title: 'Open location',
        arguments: [vscode.Uri.file(activeFilePath), { selection: o.range }],
      }, undefined, undefined, o.detail));

      const workspaceSection = new AsymptoteSidebarItem('Workspace files (current folder)', 'section', vscode.TreeItemCollapsibleState.Expanded, undefined, folderChildren, 'Files in the active file folder');
      const docOutline = new AsymptoteSidebarItem('Document Outline', 'section', vscode.TreeItemCollapsibleState.Expanded, undefined, outlineChildren, 'Functions, paths and labels in current .asy');

      return Promise.resolve([workspaceSection, docOutline]);
    }

    // symbols view
    if (this.viewType === 'symbols') {
      const symbols = getSymbolsList().map((s) => new AsymptoteSidebarItem(s.label, 'action', vscode.TreeItemCollapsibleState.None, {
        command: 'asymptoteSymbols.insertSymbol',
        title: 'Insert symbol',
        arguments: [s.snippet],
      }, undefined, s.description));

      const categories = new AsymptoteSidebarItem('Palette', 'section', vscode.TreeItemCollapsibleState.Expanded, undefined, symbols, 'Common commands and math symbols');
      return Promise.resolve([categories]);
    }

    return Promise.resolve([]);
  }

  private createBuildStatusSection(activeFilePath: string): AsymptoteSidebarItem {
    const lines: AsymptoteSidebarItem[] = [];
    const snapshot = buildSnapshots.get(activeFilePath) || { state: 'idle' };

    if (snapshot.state === 'idle') {
      lines.push(
        new AsymptoteSidebarItem(
          'No build run yet',
          'info',
          vscode.TreeItemCollapsibleState.None,
          undefined,
          undefined,
          'Run a render to track status here.',
        ),
      );
    } else {
      lines.push(
        new AsymptoteSidebarItem(
          snapshot.state === 'success' ? 'Last build succeeded' : 'Last build failed',
          snapshot.state === 'success' ? 'action' : 'info',
          vscode.TreeItemCollapsibleState.None,
          snapshot.state === 'success'
            ? {
                command: 'asymptoteBuild.exportPdfAndOpen',
                title: 'Render again',
              }
            : undefined,
          undefined,
          snapshot.message ?? 'Most recent render status',
          snapshot.timestamp ? snapshot.timestamp.toLocaleString() : undefined,
        ),
      );

      if (snapshot.outputFormat) {
        lines.push(
          new AsymptoteSidebarItem(
            `Output: ${snapshot.outputFormat.toUpperCase()}`,
            'info',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            undefined,
            'Format from the most recent build.',
          ),
        );
      }
    }

    return new AsymptoteSidebarItem(
      'Build Status',
      'section',
      vscode.TreeItemCollapsibleState.Expanded,
      undefined,
      lines,
      `Tracks the last render for ${path.basename(activeFilePath)}`,
    );
  }

  

  private createWorkspaceFileItem(file: vscode.Uri, activeFilePath: string): AsymptoteSidebarItem {
    const isActive = file.fsPath === activeFilePath;
    const item = new AsymptoteSidebarItem(
      path.basename(file.fsPath),
      'file',
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'vscode.open',
        title: 'Open file',
        arguments: [file],
      },
      undefined,
      file.fsPath,
      isActive ? 'Active file' : undefined,
    );

    if (isActive) {
      item.iconPath = new vscode.ThemeIcon('file-code', new vscode.ThemeColor('charts.green'));
    }

    return item;
  }

  private createActionItem(labelText: string, commandId: string, tooltipText: string): AsymptoteSidebarItem {
    return new AsymptoteSidebarItem(
      labelText,
      'action',
      vscode.TreeItemCollapsibleState.None,
      {
        command: commandId,
        title: labelText,
      },
      undefined,
      tooltipText,
    );
  }

  private createPresetItem(labelText: string, outputFormat: string, openOutput: boolean, extraArgs: string[]): AsymptoteSidebarItem {
    const description = `${outputFormat.toUpperCase()}${openOutput ? ' + preview' : ''}`;
    return new AsymptoteSidebarItem(
      labelText,
      'action',
      vscode.TreeItemCollapsibleState.None,
      {
        command: 'asymptoteBuild.runPresetExport',
        title: labelText,
        arguments: [outputFormat, openOutput, extraArgs],
      },
      undefined,
      labelText,
      description,
    );
  }
}

export function activate(context: vscode.ExtensionContext) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'asymptoteBuild.exportPdfAndOpen';
  statusBarItem.text = '$(play) Asymptote Render';
  statusBarItem.tooltip = 'Render the active Asymptote file as PDF';

  const commandsProvider = new AsymptoteSidebarProvider('commands', () => resolveBuildTarget(), context);
  const structureProvider = new AsymptoteSidebarProvider('structure', () => resolveBuildTarget(), context);
  const symbolsProvider = new AsymptoteSidebarProvider('symbols', () => resolveBuildTarget(), context);

  refreshSidebarView = () => {
    commandsProvider.refresh();
    structureProvider.refresh();
    symbolsProvider.refresh();
  };

  const exportPdfCommand = vscode.commands.registerCommand('asymptoteBuild.exportPdfAndOpen', async (resource?: vscode.Uri) => {
    const targetFilePath = resolveBuildTarget(resource);

    if (!targetFilePath) {
      vscode.window.showErrorMessage('Open or select an Asymptote file before exporting.');
      return;
    }

    const configuration = vscode.workspace.getConfiguration('asymptoteBuild');
    const executablePath = configuration.get<string>('executablePath', 'asy');
    const extraArgs = configuration.get<string[]>('extraArgs', []);

    await exportAsymptoteFile(executablePath, 'pdf', extraArgs, targetFilePath, true);
  });

  const exportOptionsCommand = vscode.commands.registerCommand('asymptoteBuild.exportWithOptions', async (resource?: vscode.Uri) => {
    const targetFilePath = resolveBuildTarget(resource);

    if (!targetFilePath) {
      vscode.window.showErrorMessage('Open or select an Asymptote file before exporting.');
      return;
    }

    const format = await vscode.window.showQuickPick(exportOptions, {
      title: 'Choose an Asymptote export option',
      placeHolder: 'Select preview, export format, or a render-quality preset',
    });

    if (!format) {
      return;
    }

    const configuration = vscode.workspace.getConfiguration('asymptoteBuild');
    const executablePath = configuration.get<string>('executablePath', 'asy');
    const extraArgs = configuration.get<string[]>('extraArgs', []);

    await exportAsymptoteFile(executablePath, format.value, [...extraArgs, ...format.extraArgs], targetFilePath, format.open);
  });

  const showSidebarCommand = vscode.commands.registerCommand('asymptoteBuild.showSidebar', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.asymptoteBuildContainer');
  });

  const runPresetExportCommand = vscode.commands.registerCommand(
    'asymptoteBuild.runPresetExport',
    async (outputFormat: string, openOutput: boolean, presetArgs: string[] = []) => {
      const targetFilePath = resolveBuildTarget();

      if (!targetFilePath) {
        vscode.window.showErrorMessage('Open or select an Asymptote file before exporting.');
        return;
      }

      const configuration = vscode.workspace.getConfiguration('asymptoteBuild');
      const executablePath = configuration.get<string>('executablePath', 'asy');
      const extraArgs = configuration.get<string[]>('extraArgs', []);

      await exportAsymptoteFile(executablePath, outputFormat, [...extraArgs, ...presetArgs], targetFilePath, openOutput);
    },
  );

  const exportAsSvgCommand = vscode.commands.registerCommand('asymptoteBuild.exportAsSvg', async (resource?: vscode.Uri) => {
    const targetFilePath = resolveBuildTarget(resource);

    if (!targetFilePath) {
      vscode.window.showErrorMessage('Open or select an Asymptote file before exporting.');
      return;
    }

    const configuration = vscode.workspace.getConfiguration('asymptoteBuild');
    const executablePath = configuration.get<string>('executablePath', 'asy');
    const extraArgs = configuration.get<string[]>('extraArgs', []);

    await exportAsymptoteFile(executablePath, 'svg', extraArgs, targetFilePath, false);
  });

  const exportAsPngCommand = vscode.commands.registerCommand('asymptoteBuild.exportAsPng', async (resource?: vscode.Uri) => {
    const targetFilePath = resolveBuildTarget(resource);

    if (!targetFilePath) {
      vscode.window.showErrorMessage('Open or select an Asymptote file before exporting.');
      return;
    }

    const configuration = vscode.workspace.getConfiguration('asymptoteBuild');
    const executablePath = configuration.get<string>('executablePath', 'asy');
    const extraArgs = configuration.get<string[]>('extraArgs', []);

    await exportAsymptoteFile(executablePath, 'png', extraArgs, targetFilePath, false);
  });

  const exportAsEpsCommand = vscode.commands.registerCommand('asymptoteBuild.exportAsEps', async (resource?: vscode.Uri) => {
    const targetFilePath = resolveBuildTarget(resource);

    if (!targetFilePath) {
      vscode.window.showErrorMessage('Open or select an Asymptote file before exporting.');
      return;
    }

    const configuration = vscode.workspace.getConfiguration('asymptoteBuild');
    const executablePath = configuration.get<string>('executablePath', 'asy');
    const extraArgs = configuration.get<string[]>('extraArgs', []);

    await exportAsymptoteFile(executablePath, 'eps', extraArgs, targetFilePath, false);
  });

  const previewToRightCommand = vscode.commands.registerCommand('asymptoteBuild.previewToRight', async (resource?: vscode.Uri) => {
    const targetFilePath = resolveBuildTarget(resource);

    if (!targetFilePath) {
      vscode.window.showErrorMessage('Open or select an Asymptote file before previewing.');
      return;
    }

    const configuration = vscode.workspace.getConfiguration('asymptoteBuild');
    const extraArgs = configuration.get<string[]>('extraArgs', []);
    const outputFilePath = resolveOutputFilePath(targetFilePath, 'pdf', extraArgs);

    await openPdfPreviewInSplit(outputFilePath);
  });

  const revealOutputFileCommand = vscode.commands.registerCommand('asymptoteBuild.revealOutputFile', async () => {
    const targetFilePath = resolveBuildTarget();

    if (!targetFilePath) {
      vscode.window.showErrorMessage('Open or select an Asymptote file before revealing output.');
      return;
    }

    const configuration = vscode.workspace.getConfiguration('asymptoteBuild');
    const extraArgs = configuration.get<string[]>('extraArgs', []);
    const outputFilePath = resolveOutputFilePath(targetFilePath, 'pdf', extraArgs);
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(outputFilePath));
  });

  const openOutputFolderCommand = vscode.commands.registerCommand('asymptoteBuild.openOutputFolder', async () => {
    const targetFilePath = resolveBuildTarget();

    if (!targetFilePath) {
      vscode.window.showErrorMessage('Open or select an Asymptote file before opening the output folder.');
      return;
    }

    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(path.dirname(targetFilePath)));
  });

  const copyOutputPathCommand = vscode.commands.registerCommand('asymptoteBuild.copyOutputPath', async () => {
    const targetFilePath = resolveBuildTarget();

    if (!targetFilePath) {
      vscode.window.showErrorMessage('Open or select an Asymptote file before copying the output path.');
      return;
    }

    const configuration = vscode.workspace.getConfiguration('asymptoteBuild');
    const extraArgs = configuration.get<string[]>('extraArgs', []);
    const outputFilePath = resolveOutputFilePath(targetFilePath, 'pdf', extraArgs);
    await vscode.env.clipboard.writeText(outputFilePath);
    vscode.window.showInformationMessage(`Copied ${path.basename(outputFilePath)} to the clipboard.`);
  });

  
  const updateStatusBar = () => updateStatusBarForActiveFile(statusBarItem);
  // register symbol insert command
  const insertSymbolCommand = vscode.commands.registerCommand('asymptoteSymbols.insertSymbol', async (snippet: string) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    await editor.insertSnippet(new vscode.SnippetString(snippet));
  });

  context.subscriptions.push(
    exportPdfCommand,
    exportOptionsCommand,
    showSidebarCommand,
    runPresetExportCommand,
    revealOutputFileCommand,
    openOutputFolderCommand,
    copyOutputPathCommand,
    exportAsSvgCommand,
    exportAsPngCommand,
    exportAsEpsCommand,
    previewToRightCommand,
    insertSymbolCommand,
    outputChannel,
    statusBarItem,
    vscode.window.registerTreeDataProvider('asymptoteCommandsView', commandsProvider),
    vscode.window.registerTreeDataProvider('asymptoteStructureView', structureProvider),
    vscode.window.registerTreeDataProvider('asymptoteSymbolsView', symbolsProvider),
    vscode.window.onDidChangeActiveTextEditor(() => {
      refreshSidebarView();
      updateStatusBar();
    }),
    vscode.workspace.onDidSaveTextDocument(() => {
      refreshSidebarView();
      updateStatusBar();
    }),
    vscode.workspace.onDidOpenTextDocument(() => {
      refreshSidebarView();
      updateStatusBar();
    }),
  );

  refreshSidebarView();
  updateStatusBar();
}

export function deactivate() {
  outputChannel.dispose();
}

function resolveBuildTarget(resource?: vscode.Uri): string | undefined {
  if (resource) {
    if (resource.scheme !== 'file') {
      return undefined;
    }

    return path.extname(resource.fsPath).toLowerCase() === '.asy' ? resource.fsPath : undefined;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const document = editor.document;
  if (document.isUntitled) {
    return undefined;
  }

  return document.languageId === 'asy' || path.extname(document.fileName).toLowerCase() === '.asy'
    ? document.fileName
    : undefined;
}

async function exportAsymptoteFile(
  executablePath: string,
  outputFormat: string,
  extraArgs: string[],
  targetFilePath: string,
  openOutput: boolean,
): Promise<void> {
  const configuration = vscode.workspace.getConfiguration('asymptoteBuild');
  const showOutputOnBuild = configuration.get<boolean>('showOutputOnBuild', true);
  
  outputChannel.clear();
  if (showOutputOnBuild) {
    outputChannel.show(true);
  }
  outputChannel.appendLine(`Exporting ${targetFilePath} as ${outputFormat.toUpperCase()}`);

  try {
    const timeoutMs = configuration.get<number>('timeout', 30000);
    const renderArgs = outputFormat === 'pdf' ? ['-noV', ...extraArgs] : extraArgs;
    const result = await runAsymptoteBuild(executablePath, outputFormat, renderArgs, targetFilePath, timeoutMs);
    if (result.stdout) {
      outputChannel.append(result.stdout);
    }
    if (result.stderr) {
      outputChannel.append(result.stderr);
    }

    vscode.window.showInformationMessage(`Asymptote export completed: ${path.basename(targetFilePath)} (${outputFormat})`);
    buildSnapshots.set(targetFilePath, {
      state: 'success',
      filePath: targetFilePath,
      outputFormat: outputFormat,
      timestamp: new Date(),
      message: `Rendered ${path.basename(targetFilePath)} successfully.`,
    });

    if (openOutput) {
      const outputFilePath = resolveOutputFilePath(targetFilePath, outputFormat, extraArgs);
      await openPdfPreviewInSplit(outputFilePath);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(message);
    vscode.window.showErrorMessage(`Asymptote export failed: ${message}`);
    buildSnapshots.set(targetFilePath, {
      state: 'failure',
      filePath: targetFilePath,
      outputFormat: outputFormat,
      timestamp: new Date(),
      message: message,
    });
  }

  refreshSidebarView();
}

function runAsymptoteBuild(
  executablePath: string,
  outputFormat: string,
  extraArgs: string[],
  filePath: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = ['-f', outputFormat, ...extraArgs, filePath];
    const workingDirectory = path.dirname(filePath);

    const execOptions = { cwd: workingDirectory, timeout: timeoutMs > 0 ? timeoutMs : undefined };
    execFile(executablePath, args, execOptions, (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        if ((error as any).code === 'ENOENT') {
          reject(new Error(`Asymptote executable not found: '${executablePath}'. Please install Asymptote and ensure it is in your PATH, or configure 'asymptoteBuild.executablePath' in settings.`));
          return;
        }
        const detail = stderr || stdout || error.message;
        reject(new Error(detail.trim()));
        return;
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

function resolveOutputFilePath(filePath: string, outputFormat: string, extraArgs?: string[]): string {
  if (extraArgs) {
    for (let i = 0; i < extraArgs.length; i++) {
      if ((extraArgs[i] === '-o' || extraArgs[i] === '-outname' || extraArgs[i] === '--outname') && i + 1 < extraArgs.length) {
        let outPath = extraArgs[i + 1];
        if (!path.isAbsolute(outPath)) {
          outPath = path.join(path.dirname(filePath), outPath);
        }
        if (!path.extname(outPath)) {
          outPath += `.${outputFormat}`;
        }
        return outPath;
      }
    }
  }

  const directory = path.dirname(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));

  return path.join(directory, `${baseName}.${outputFormat}`);
}

async function openPdfPreviewInSplit(outputFilePath: string): Promise<void> {
  const uri = vscode.Uri.file(outputFilePath);

  await vscode.commands.executeCommand('vscode.open', uri, { viewColumn: vscode.ViewColumn.Beside, preview: false });
}

function parseOutlineForFile(filePath: string): Array<{ label: string; range: vscode.Range; detail?: string }> {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    const items: Array<{ label: string; range: vscode.Range; detail?: string }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // simple heuristics: detect function declarations, path declarations, label usages
      const funcMatch = line.match(/^(?:void|pair|path)\s+([A-Za-z0-9_]+)\s*\(/);
      if (funcMatch) {
        items.push({ label: `func: ${funcMatch[1]}`, range: new vscode.Range(i, 0, i, line.length), detail: lines[i].trim() });
        continue;
      }

      const pathMatch = line.match(/^path\s+([A-Za-z0-9_]+)/);
      if (pathMatch) {
        items.push({ label: `path: ${pathMatch[1]}`, range: new vscode.Range(i, 0, i, line.length) });
        continue;
      }

      const labelMatch = line.match(/label\(/);
      if (labelMatch) {
        items.push({ label: `label @ ${i + 1}`, range: new vscode.Range(i, 0, i, line.length) });
        continue;
      }
    }

    return items;
  } catch (e) {
    return [];
  }
}

function getSymbolsList(): Array<{ label: string; snippet: string; description?: string }> {
  return [
    { label: 'draw(path)', snippet: 'draw(${1:path});', description: 'Draw a path' },
    { label: 'label(string)', snippet: 'label("${1:text}", ${2:position});', description: 'Insert a label' },
    { label: 'path example', snippet: 'path p = (${1:(0,0)}..${2:(1,1)});', description: 'Create a path' },
    { label: '→ (arrow)', snippet: '->', description: 'Arrow operator' },
    { label: 'α (alpha)', snippet: 'alpha', description: 'Greek alpha' },
    { label: 'β (beta)', snippet: 'beta', description: 'Greek beta' },
  ];
}

function updateStatusBarForActiveFile(statusBarItem: vscode.StatusBarItem): void {
  const activeTarget = resolveBuildTarget();

  if (activeTarget) {
    statusBarItem.tooltip = `Render ${path.basename(activeTarget)} as PDF`;
    statusBarItem.show();
    return;
  }

  statusBarItem.hide();
}
