import * as vscode from 'vscode';
import * as path from 'path';
import { FileSystemProvider, File } from './fileSystemProvider';
import { FileAccess } from './fileAccess';
import { Config } from './config';
import { extensionName } from './constants';
import { DisplayMode } from './types';
import { isChild } from './utils';

type Clipboard = { uris: vscode.Uri[], cut: boolean };

class TreeDataProvider implements vscode.TreeDataProvider<File> {

   private _onDidChangeTreeData: vscode.EventEmitter<File | undefined | void> = new vscode.EventEmitter<File | undefined | void>();
   readonly onDidChangeTreeData: vscode.Event<File | undefined | void> = this._onDidChangeTreeData.event;

   private config: Config = Config.getInstance();

   constructor(private readonly fileSystemProvider: FileSystemProvider) { }

   refresh(): void {
      this._onDidChangeTreeData.fire();
   }

   getTreeItem(element: File): vscode.TreeItem {
      return element;
   }

   async getChildren(element?: File): Promise<File[]> {
      if (!this.config.notesDir) return [];
      if (!this.fileSystemProvider.exists(this.config.notesDir)) {
         vscode.window.showErrorMessage(`${this.config.notesDir.fsPath} is invalid path.`);
         this.config.notesDir = undefined;
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

      const children = await this.fileSystemProvider.readDirectory(this.config.notesDir);
      children.sort((a, b) => {
         if (a[1] === b[1]) {
            return a[0].localeCompare(b[0]);
         }
         return a[1] === vscode.FileType.Directory ? -1 : 1;
      });

      this.config.isEmptyNotesDir = !children.length;

      return children.map(([name, type]) => new File(vscode.Uri.file(name), type));
   }

}

export class NoteExplorer {

   private readonly treeDataProvider: TreeDataProvider;
   private readonly treeView: vscode.TreeView<File>;
   private readonly config: Config = Config.getInstance();
   private readonly disposables: vscode.Disposable[] = [];
   private clipboard?: Clipboard;

   constructor(private readonly fileSystemProvider: FileSystemProvider) {
      this.treeDataProvider = new TreeDataProvider(fileSystemProvider);
      this.treeView = vscode.window.createTreeView(`${extensionName}.noteExplorer`, { treeDataProvider: this.treeDataProvider, canSelectMany: true, showCollapseAll: true });

      this.disposables.push(
         this.treeView,
         this.config.onDidChangeConfig(e => {
            if (e && e.indexOf(Config.ConfigItem.NotesDir) !== -1) {
               this.treeDataProvider.refresh();
            }
            if (e && e.indexOf(Config.ConfigItem.DisplayMode) !== -1) {
               //if activeEditor is file in notesDir, change file access
               if (this.config.notesDir && vscode.window.activeTextEditor && isChild(this.config.notesDir.fsPath, vscode.window.activeTextEditor.document.fileName)) {
                  if (this.config.displayMode === DisplayMode.Edit) FileAccess.makeWritable(vscode.window.activeTextEditor.document.uri);
                  else FileAccess.makeReadonly(vscode.window.activeTextEditor.document.uri);
               }
            }
         }),
         vscode.workspace.onDidChangeTextDocument(e => {
            //if changed document is file in notesDir, change file access
            if (this.config.notesDir && isChild(this.config.notesDir.fsPath, e.document.fileName)) {
               if (this.config.displayMode === DisplayMode.Edit) FileAccess.makeWritable(e.document.uri);
               else FileAccess.makeReadonly(e.document.uri);
            }
         }),
         this.fileSystemProvider.onDidChangeFile(() => {
            this.treeDataProvider.refresh();
         }),
         ...this.registerCommands()
      );
   }

   dispose(): void {
      for (const disposable of this.disposables) {
         disposable.dispose();
      }
   }

   //#region commands

   private registerCommands(): vscode.Disposable[] {
      return [
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.openFile`, (uri?: vscode.Uri) => this.openFile(uri)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.refresh`, () => this.refresh()),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.newFile`, (file?: File) => this.createNewFile(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.newFolder`, (file?: File) => this.createNewFolder(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.findInFolder`, (file?: File) => this.findInFolder(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.cut`, (file?: File) => this.cut(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.copy`, (file?: File) => this.copy(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.paste`, (file?: File) => this.paste(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.copyPath`, (file?: File) => this.copyPath(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.copyRelativePath`, (file?: File) => this.copyRelativePath(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.rename`, (file?: File) => this.rename(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.delete`, (file?: File) => this.delete(file))
      ];
   }

   private async showFileNameInputBox(dirname?: vscode.Uri, initialValue?: string): Promise<string | undefined> {
      const input = await vscode.window.showInputBox({
         value: initialValue,
         prompt: 'Enter a name for the file.',
         validateInput: value => {
            if (value === '') return 'Please input any string.';
            if (/[/\\:?*"<>|]/.test(value)) return 'File name may not contain /\\:?*"<>|';
            if (dirname && this.fileSystemProvider.exists(vscode.Uri.joinPath(dirname, value))) return `${value} is already exists.`;
            return undefined;
         }
      });
      return input && dirname ? path.join(dirname.fsPath, input) : input;
   }

   private geSelectedFiles(rightClickedFile?: File): File[] | undefined {
      if (!this.config.notesDir) return undefined;
      if (!rightClickedFile) return this.treeView.selection.length ? this.treeView.selection : [new File(this.config.notesDir, vscode.FileType.Directory)];
      if (!this.treeView.selection.length) return [rightClickedFile];
      if (this.treeView.selection.findIndex(selectedFile => selectedFile.uri.fsPath === rightClickedFile.uri.fsPath) === -1) return [rightClickedFile];
      else return this.treeView.selection;
   }

   private async openFile(uri?: vscode.Uri): Promise<void> {
      if (!uri) return;

      const isEditMode = this.config.displayMode === DisplayMode.Edit;
      if (isEditMode) FileAccess.makeWritable(uri);
      else FileAccess.makeReadonly(uri);

      if (isEditMode || this.config.previewEngine === Config.PreviewEngine.Disuse || path.extname(uri.fsPath) !== '.md') {
         await vscode.commands.executeCommand('vscode.open', uri);
         await vscode.commands.executeCommand('workbench.action.focusSideBar');
         return;
      }

      switch (this.config.previewEngine) {
         case 'enhanced':
            await vscode.commands.executeCommand('vscode.open', uri);
            await vscode.commands.executeCommand('markdown-preview-enhanced.openPreviewToTheSide', uri);
            if (this.config.singlePreview) this.config.singlePreview = false; //allow multiple preview
            break;
         case 'default':
         default:
            await vscode.commands.executeCommand('markdown.showPreview', uri);
            await vscode.commands.executeCommand('markdown.preview.toggleLock'); //allow multiple preview
            break;
      }
      await vscode.commands.executeCommand('workbench.action.focusSideBar');
   }

   private refresh(): void {
      this.treeDataProvider.refresh();
   }

   private async createNewFile(file?: File): Promise<void> {
      if (!this.config.notesDir) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(this.config.notesDir, vscode.FileType.Directory);
      const dirname: vscode.Uri = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri : vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));

      const input = await this.showFileNameInputBox(dirname);
      if (!input) return;
      const filename = vscode.Uri.file(input);

      this.fileSystemProvider.writeFile(filename, new Uint8Array(), { create: true, overwrite: false });

      this.openFile(filename);
   }

   private async createNewFolder(file?: File): Promise<void> {
      if (!this.config.notesDir) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(this.config.notesDir, vscode.FileType.Directory);
      const dirname: vscode.Uri = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri : vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));

      const input = await this.showFileNameInputBox(dirname);
      if (!input) return;
      const filename = vscode.Uri.file(input);

      this.fileSystemProvider.createDirectory(filename);
   }

   private findInFolder(file?: File): void {
      if (!this.config.notesDir) return;
      const selectedFiles = this.geSelectedFiles(file);
      if (!selectedFiles) return;
      //@ts-ignore type inference of `this.config.notesDir` does not work.
      const dirnames: string[] = selectedFiles.map(selectedFile => path.resolve(this.config.notesDir.fsPath, selectedFile.type === vscode.FileType.Directory ? selectedFile.uri.fsPath : path.dirname(selectedFile.uri.fsPath)));
      vscode.commands.executeCommand('workbench.action.findInFiles', {
         query: '',
         replace: '',
         filesToInclude: dirnames.join(','),
         filesToExclude: ''
      });
   }

   private cut(file?: File): void {
      if (!file && !this.treeView.selection.length) return;
      const selectedUris: vscode.Uri[] = file ? [file.uri] : this.treeView.selection.map(file => file.uri);
      this.clipboard = { uris: selectedUris, cut: true };
   }

   private copy(file?: File): void {
      if (!file && !this.treeView.selection.length) return;
      const selectedUris: vscode.Uri[] = file ? [file.uri] : this.treeView.selection.map(file => file.uri);
      this.clipboard = { uris: selectedUris, cut: false };
   }

   private paste(file?: File): void {
      if (!this.config.notesDir) return;
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(this.config.notesDir, vscode.FileType.Directory);

      if (!this.clipboard) {
         vscode.window.showErrorMessage('Clipboard is empty.');
         return;
      }

      for (const uri of this.clipboard.uris) {
         const destParent = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri.fsPath : path.dirname(selectedFile.uri.fsPath);
         const destExt = path.extname(uri.fsPath);
         const destBase = path.basename(uri.fsPath, destExt);
         let count = 1;
         let filePath: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(destParent), `${destBase}${destExt}`);
         while (this.fileSystemProvider.exists(filePath) && count <= 100) {
            if (count === 1) {
               filePath = vscode.Uri.joinPath(vscode.Uri.file(destParent), `${destBase} copy${destExt}`);
               count++;
            } else {
               filePath = vscode.Uri.joinPath(vscode.Uri.file(destParent), `${destBase} copy${count++}${destExt}`);
            }
         }

         if (count > 100) {
            vscode.window.showErrorMessage(`File named "${path.join(destParent), `${destBase} copy{n}${destExt}`}" has reached copying limit. Please delete these files.`);
            continue;
         }

         //check subdirectory
         if (isChild(uri.fsPath, filePath.fsPath)) {
            vscode.window.showErrorMessage(`Cannot ${this.clipboard.cut ? 'cut' : 'copy'} "${uri.fsPath}" to a subdirectory of itself, "${filePath.fsPath}".`);
            continue;
         }

         if (this.clipboard.cut) {
            this.fileSystemProvider.move(uri, filePath, { overwrite: false });
         } else {
            this.fileSystemProvider.copy(uri, filePath, { overwrite: false });
         }
      }

      if (this.clipboard.cut) this.clipboard = undefined;
   }

   private copyPath(file?: File): void {
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];
      vscode.env.clipboard.writeText(selectedFile.uri.fsPath);
   }

   private copyRelativePath(file?: File): void {
      if (!this.config.notesDir) return;
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];
      vscode.env.clipboard.writeText(path.relative(this.config.notesDir.fsPath, selectedFile.uri.fsPath));
   }

   private async rename(file?: File): Promise<void> {
      if (!file && !this.treeView.selection.length) return;
      const selectedFile: File = file ? file : this.treeView.selection[0];

      const dirname = vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));
      const input = await this.showFileNameInputBox(dirname, path.basename(selectedFile.uri.fsPath));
      if (!input) return;

      this.fileSystemProvider.rename(selectedFile.uri, vscode.Uri.file(input), { overwrite: false });
   }

   private async delete(file?: File): Promise<void> {
      if (!file && !this.treeView.selection.length) return;
      const selectedUris: vscode.Uri[] | undefined = this.geSelectedFiles(file)?.map(file => file.uri);
      if (!selectedUris) return;
      for (const uri of selectedUris) {
         if (this.config.confirmDelete) {
            const input = await vscode.window.showWarningMessage(`Are you sure you want to delete "${path.basename(uri.fsPath)}"?`, 'Delete', 'Cancel', 'Do not ask me again');
            if (input === 'Cancel') return;
            if (input === 'Do not ask me again') this.config.confirmDelete = false;
         }
         this.fileSystemProvider.delete(uri, { recursive: true });
      }
   }

   //#endregion

}
