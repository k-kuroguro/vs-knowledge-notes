import * as vscode from 'vscode';
import * as path from 'path';
import { FileSystemProvider, File } from './fileSystemProvider';
import { Config } from './config';
import { extensionName } from './constants';
import { DisplayMode } from './types';

export class TreeDataProvider implements vscode.TreeDataProvider<File> {

   private _onDidChangeTreeData: vscode.EventEmitter<File | undefined | void> = new vscode.EventEmitter<File | undefined | void>();
   readonly onDidChangeTreeData: vscode.Event<File | undefined | void> = this._onDidChangeTreeData.event;

   private notesDir?: vscode.Uri;

   constructor(private readonly fileSystemProvider: FileSystemProvider) {
      this.notesDir = Config.notesDir;
   }

   refresh(): void {
      this.notesDir = Config.notesDir;
      this._onDidChangeTreeData.fire();
   }

   getTreeItem(element: File): vscode.TreeItem {
      return element;
   }

   async getChildren(element?: File): Promise<File[]> {
      if (!this.notesDir) return [];
      if (!this.fileSystemProvider.exists(this.notesDir)) {
         vscode.window.showErrorMessage(`${this.notesDir.fsPath} is invalid path.`);
         return [];
      }

      if (element) {
         const children = await this.fileSystemProvider.readDirectory(element.uri);
         children.sort((a, b) => {
            if (a[1] === b[1]) {
               return a[0].localeCompare(b[0]);
            }
            return a[1] === vscode.FileType.Directory ? -1 : 1;
         });
         return children.map(([name, type]) => new File(vscode.Uri.file(name), type));
      }

      const children = await this.fileSystemProvider.readDirectory(this.notesDir);
      children.sort((a, b) => {
         if (a[1] === b[1]) {
            return a[0].localeCompare(b[0]);
         }
         return a[1] === vscode.FileType.Directory ? -1 : 1;
      });

      if (!children.length) await vscode.commands.executeCommand('setContext', `${extensionName}.isEmptyNotesDir`, true);
      else await vscode.commands.executeCommand('setContext', `${extensionName}.isEmptyNotesDir`, false);

      return children.map(([name, type]) => new File(vscode.Uri.file(name), type));
   }

}

export class NoteExplorer {

   private watcherDisposer: vscode.Disposable;
   private readonly treeDataProvider: TreeDataProvider;
   private readonly treeView: vscode.TreeView<File>;

   constructor(context: vscode.ExtensionContext, private readonly fileSystemProvider: FileSystemProvider) {
      this.treeDataProvider = new TreeDataProvider(fileSystemProvider);
      this.treeView = vscode.window.createTreeView(`${extensionName}.noteExplorer`, { treeDataProvider: this.treeDataProvider, showCollapseAll: true });
      if (Config.notesDir && this.fileSystemProvider.exists(Config.notesDir)) {
         this.watcherDisposer = this.fileSystemProvider.watch(Config.notesDir, { recursive: true, excludes: [] });
      } else {
         this.watcherDisposer = { dispose: () => { } }
      }

      context.subscriptions.push(
         this.treeView,
         vscode.workspace.registerFileSystemProvider(`${extensionName}.noteExplorer`, this.fileSystemProvider, { isCaseSensitive: true }),
         Config.onDidChangeConfig(e => {
            if (!e || e === Config.ConfigItem.notesDir) {
               this.treeDataProvider.refresh();
               this.updateWatcher();
            }
         }),
         this.fileSystemProvider.onDidChangeFile(() => {
            this.treeDataProvider.refresh();
         })
      );

      this.registerCommands(context);
   }

   disposeWatcher(): void {
      this.watcherDisposer.dispose();
   }

   private updateWatcher(): void {
      this.watcherDisposer.dispose();
      if (Config.notesDir && this.fileSystemProvider.exists(Config.notesDir)) {
         this.watcherDisposer = this.fileSystemProvider.watch(Config.notesDir, { recursive: true, excludes: [] });
      } else {
         this.watcherDisposer = { dispose: () => { } }
      }
   }

   /* commands */

   private registerCommands(context: vscode.ExtensionContext): void {
      context.subscriptions.push(
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.openFile`, (uri) => this.openFile(uri)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.refresh`, () => this.refresh()),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.newFile`, (fileOrUndefined) => this.createNewFile(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.newFolder`, (fileOrUndefined) => this.createNewFolder(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.findInFolder`, (fileOrUndefined) => this.findInFolder(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.cut`, (fileOrUndefined) => this.cut(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.copy`, (fileOrUndefined) => this.copy(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.paste`, (fileOrUndefined) => this.paste(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.copyPath`, (fileOrUndefined) => this.copyPath(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.copyRelativePath`, (fileOrUndefined) => this.copyRelativePath(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.rename`, (fileOrUndefined) => this.rename(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.delete`, (fileOrUndefined) => this.delete(fileOrUndefined))
      );
   }

   private async showFileNameInputBox(dirname?: vscode.Uri): Promise<string | undefined> {
      const input = await vscode.window.showInputBox({
         prompt: 'Enter a name for the file.',
         validateInput: value => {
            if (value == '') return 'Please input any string.';
            if (/[/\\:?*"<>|]/.test(value)) return 'File name may not contain /\\:?*"<>|';
            if (dirname && this.fileSystemProvider.exists(vscode.Uri.joinPath(dirname, value))) return `${value} is already exists.`;
            return undefined;
         }
      });
      if (input && dirname) return input && dirname ? path.join(dirname.fsPath, input) : input;
   }

   private async openFile(uri: vscode.Uri): Promise<void> {
      if (!uri) return;
      if (Config.displayMode === DisplayMode.edit || path.extname(uri.fsPath) != '.md') {
         await vscode.commands.executeCommand('vscode.open', uri);
         await vscode.commands.executeCommand('workbench.action.focusSideBar');
         return;
      }
      switch (Config.previewEngine) {
         case 'enhanced':
            await vscode.commands.executeCommand('vscode.open', uri);
            await vscode.commands.executeCommand('markdown-preview-enhanced.openPreviewToTheSide', uri);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            if (Config.singlePreview) Config.singlePreview = false; // allow multiple preview
            break;
         case 'default':
         default:
            await vscode.commands.executeCommand('markdown.showPreview', uri);
            await vscode.commands.executeCommand('markdown.preview.toggleLock'); // allow multiple preview
            break;
      }
      setTimeout(() => { vscode.commands.executeCommand('workbench.action.focusSideBar'); }, 300); // Focus tree view after rendering markdown
   }

   private refresh(): void {
      this.treeDataProvider.refresh();
   }

   private async createNewFile(file?: File): Promise<void> {
      if (!Config.notesDir) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(Config.notesDir, vscode.FileType.Directory);
      const dirname: vscode.Uri = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri : vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));

      const input = await this.showFileNameInputBox(dirname);
      if (!input) return;
      const filename = vscode.Uri.file(input);

      this.fileSystemProvider.writeFile(filename, new Uint8Array(), { create: true, overwrite: false });

      this.openFile(filename);
   }

   private async createNewFolder(file?: File): Promise<void> {
      if (!Config.notesDir) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(Config.notesDir, vscode.FileType.Directory);
      const dirname: vscode.Uri = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri : vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));

      const input = await this.showFileNameInputBox(dirname);
      if (!input) return;
      const filename = vscode.Uri.file(input);

      this.fileSystemProvider.createDirectory(filename);
   }

   private findInFolder(file?: File): void {
      if (!Config.notesDir) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(Config.notesDir, vscode.FileType.Directory);
      const dirname: vscode.Uri = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri : vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));
      vscode.commands.executeCommand('workbench.action.findInFiles', {
         query: '',
         replace: '',
         filesToInclude: path.resolve(Config.notesDir.fsPath, dirname.fsPath),
         filesToExclude: ""
      });
   }

   private cut(file?: File): void {
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];
      this.fileSystemProvider.setClipboard(selectedFile.uri, true);
   }

   private copy(file?: File): void {
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];
      this.fileSystemProvider.setClipboard(selectedFile.uri, false);
   }

   private paste(file?: File): void {
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];

      const clipboard = this.fileSystemProvider.getClipboard();
      if (!clipboard) {
         vscode.window.showErrorMessage('Clipboard is empty.');
         return;
      }

      const destParent = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri.fsPath : path.dirname(selectedFile.uri.fsPath);
      const destBase = path.basename(clipboard.uri.fsPath);
      let count = 1;
      let filePath: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(destParent), destBase);
      while (this.fileSystemProvider.exists(filePath)) {
         if (count == 1) {
            filePath = vscode.Uri.joinPath(vscode.Uri.file(destParent), `${destBase} copy`);
            count++;
         } else {
            filePath = vscode.Uri.joinPath(vscode.Uri.file(destParent), `${destBase} copy ${count++}`);
         }
         if (count > 100) {
            vscode.window.showErrorMessage('File named "{filename} copy n" has reached copying limit. Please delete these files.');
            return;
         }
      }

      // check subdirectory
      if (new RegExp(`^${clipboard.uri.fsPath.replace(/\\/g, '\\\\')}.*\\\\.*$`).test(filePath.fsPath)) {
         vscode.window.showErrorMessage(`Cannot ${clipboard.cut ? 'cut' : 'copy'} "${clipboard.uri.fsPath}" to a subdirectory of itself, "${filePath.fsPath}".`);
         return;
      }

      if (clipboard.cut) {
         this.fileSystemProvider.move(clipboard.uri, filePath, { overwrite: false });
         this.fileSystemProvider.setClipboard();
      } else {
         this.fileSystemProvider.copy(clipboard.uri, filePath, { overwrite: false });
      }
   }

   private copyPath(file?: File): void {
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];
      vscode.env.clipboard.writeText(selectedFile.uri.fsPath);
   }

   private copyRelativePath(file?: File): void {
      if (!Config.notesDir) return;
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];
      vscode.env.clipboard.writeText(path.relative(Config.notesDir.fsPath, selectedFile.uri.fsPath));
   }

   private async rename(file?: File): Promise<void> {
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];

      const dirname = vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));
      const input = await this.showFileNameInputBox(dirname);
      if (!input) return;

      this.fileSystemProvider.rename(selectedFile.uri, vscode.Uri.file(input), { overwrite: false });
   }

   private async delete(file?: File): Promise<void> {
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];
      if (Config.confirmDelete) {
         const input = await vscode.window.showWarningMessage(`Are you sure you want to delete "${path.basename(selectedFile.uri.fsPath)}"?`, 'Delete', 'Cancel', 'Do not ask me again');
         if (input == 'Cancel') return;
         if (input == 'Do not ask me again') Config.confirmDelete = false;
      }
      this.fileSystemProvider.delete(selectedFile.uri, { recursive: true });
   }

}