/// <reference types="node" />

import * as path from 'path';
import { execFile } from 'child_process';
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
        this.iconPath = new vscode.ThemeIcon('folder-opened');
        break;
      case 'action':
        this.iconPath = new vscode.ThemeIcon('play');
        break;
      case 'info':
        this.iconPath = new vscode.ThemeIcon('info');
        break;
    }
  }
}

class AsymptoteSidebarProvider implements vscode.TreeDataProvider<AsymptoteSidebarItem> {
  private readonly changeEmitter = new vscode.EventEmitter<AsymptoteSidebarItem | undefined | void>();

  readonly onDidChangeTreeData = this.changeEmitter.event;
  private workspaceAsyFiles: vscode.Uri[] = [];

  constructor(private readonly getActiveFilePath: () => string | undefined, context: vscode.ExtensionContext) {
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
    if (!activeFilePath) {
      return Promise.resolve([
        new AsymptoteSidebarItem(
          'Open an .asy file to enable builds',
          'info',
          vscode.TreeItemCollapsibleState.None,
          undefined,
          undefined,
          'The sidebar becomes fully interactive once an Asymptote file is active.',
        ),
      ]);
    }

    const activeFileItem = new AsymptoteSidebarItem(
      path.basename(activeFilePath),
      'file',
      vscode.TreeItemCollapsibleState.Expanded,
      undefined,
      [
        new AsymptoteSidebarItem(
          activeFilePath,
          'info',
          vscode.TreeItemCollapsibleState.None,
          undefined,
          undefined,
          activeFilePath,
        ),
      ],
      activeFilePath,
      'Current Asymptote document',
    );

    const buildStatusSection = this.createBuildStatusSection(activeFilePath);
    const workspaceFilesSection = this.createWorkspaceFilesSection(activeFilePath);

    const quickBuildSection = new AsymptoteSidebarItem(
      'Quick Build',
      'section',
      vscode.TreeItemCollapsibleState.Expanded,
      undefined,
      [
        this.createActionItem('Render PDF', 'asymptoteBuild.exportPdfAndOpen', 'Render the current file as PDF and open it.'),
        this.createActionItem('Detailed Export...', 'asymptoteBuild.exportWithOptions', 'Choose a format or quality preset.'),
        this.createActionItem('Open Sidebar View', 'asymptoteBuild.showSidebar', 'Focus the Asymptote activity-bar view.'),
      ],
      'Primary export actions',
    );

    const exportPresetsSection = new AsymptoteSidebarItem(
      'Export Presets',
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

    const toolsSection = new AsymptoteSidebarItem(
      'Tools',
      'section',
      vscode.TreeItemCollapsibleState.Expanded,
      undefined,
      [
        this.createActionItem('Reveal Output File', 'asymptoteBuild.revealOutputFile', 'Open the generated file location in the file explorer.'),
        this.createActionItem('Open Output Folder', 'asymptoteBuild.openOutputFolder', 'Open the folder containing the generated output.'),
        this.createActionItem('Copy Output Path', 'asymptoteBuild.copyOutputPath', 'Copy the generated output path to the clipboard.'),
      ],
      'Extra utility commands',
    );

    return Promise.all([buildStatusSection, workspaceFilesSection]).then(([statusItem, filesSection]) => [
      statusItem,
      activeFileItem,
      filesSection,
      quickBuildSection,
      exportPresetsSection,
      toolsSection,
    ]);
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

  private createWorkspaceFilesSection(activeFilePath: string): Thenable<AsymptoteSidebarItem> {
    const children = this.workspaceAsyFiles
      .map((file) => this.createWorkspaceFileItem(file, activeFilePath))
      .sort((left, right) => left.labelText.localeCompare(right.labelText));

    if (children.length === 0) {
      children.push(
        new AsymptoteSidebarItem(
          'No .asy files found in workspace',
          'info',
          vscode.TreeItemCollapsibleState.None,
          undefined,
          undefined,
          'Add Asymptote files to the workspace to populate this list.',
        ),
      );
    }

    return Promise.resolve(new AsymptoteSidebarItem(
      'Workspace Files',
      'section',
      vscode.TreeItemCollapsibleState.Expanded,
      undefined,
      children,
      'All Asymptote files discovered in the current workspace',
    ));
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

  const sidebarProvider = new AsymptoteSidebarProvider(() => resolveBuildTarget(), context);
  refreshSidebarView = () => sidebarProvider.refresh();

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

  const refreshSidebar = () => sidebarProvider.refresh();
  const updateStatusBar = () => updateStatusBarForActiveFile(statusBarItem);

  context.subscriptions.push(
    exportPdfCommand,
    exportOptionsCommand,
    showSidebarCommand,
    runPresetExportCommand,
    revealOutputFileCommand,
    openOutputFolderCommand,
    copyOutputPathCommand,
    outputChannel,
    statusBarItem,
    vscode.window.registerTreeDataProvider('asymptoteBuildSidebar', sidebarProvider),
    vscode.window.onDidChangeActiveTextEditor(() => {
      refreshSidebar();
      updateStatusBar();
    }),
    vscode.workspace.onDidSaveTextDocument(() => {
      refreshSidebar();
      updateStatusBar();
    }),
    vscode.workspace.onDidOpenTextDocument(() => {
      refreshSidebar();
      updateStatusBar();
    }),
  );

  refreshSidebar();
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
    const result = await runAsymptoteBuild(executablePath, outputFormat, extraArgs, targetFilePath, timeoutMs);
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
      await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(outputFilePath));
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

function updateStatusBarForActiveFile(statusBarItem: vscode.StatusBarItem): void {
  const activeTarget = resolveBuildTarget();

  if (activeTarget) {
    statusBarItem.tooltip = `Render ${path.basename(activeTarget)} as PDF`;
    statusBarItem.show();
    return;
  }

  statusBarItem.hide();
}
