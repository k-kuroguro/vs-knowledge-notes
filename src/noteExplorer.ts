import * as vscode from 'vscode';
import * as path from 'path';
import { FileSystemProvider, File } from './fileSystemProvider';
import { Config } from './config';
import { extensionName } from './constants';

export class NoteExplorer {

   private watcherDisposer: vscode.Disposable;
   private readonly fileSystemProvider: FileSystemProvider;
   private readonly treeView: vscode.TreeView<File>;

   constructor(context: vscode.ExtensionContext) {
      this.fileSystemProvider = new FileSystemProvider();
      this.watcherDisposer = this.fileSystemProvider.watch(vscode.Uri.file(Config.get(Config.Sections.notesDir)), { recursive: true, excludes: [] });
      this.treeView = vscode.window.createTreeView(`${extensionName}.noteExplorer`, { treeDataProvider: this.fileSystemProvider });

      context.subscriptions.push(
         this.treeView,
         vscode.workspace.registerFileSystemProvider(`${extensionName}.noteExplorer`, this.fileSystemProvider, { isCaseSensitive: true }),
         vscode.workspace.onDidChangeConfiguration(() => {
            this.fileSystemProvider.refresh();
            this.updateWatcher();
         }),
      );

      this.registerCommands(context);
   }

   disposeWatcher(): void {
      this.watcherDisposer.dispose();
   }

   private updateWatcher(): void {
      this.watcherDisposer.dispose();
      this.watcherDisposer = this.fileSystemProvider.watch(vscode.Uri.file(Config.get(Config.Sections.notesDir)), { recursive: true, excludes: [] });
   }

   /* commands */

   private registerCommands(context: vscode.ExtensionContext): void {
      context.subscriptions.push(
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.openFile`, (uri) => this.openFile(uri)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.refresh`, () => this.refresh()),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.newFile`, (fileOrUndefined) => this.createNewFile(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.newFolder`, (fileOrUndefined) => this.createNewFolder(fileOrUndefined)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.findInFolder`, (file) => this.findInFolder(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.cut`, (file) => this.cut(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.copy`, (file) => this.copy(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.paste`, (file) => this.paste(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.copyPath`, (file) => this.copyPath(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.copyRelativePath`, (file) => this.copyRelativePath(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.rename`, (file) => this.rename(file)),
         vscode.commands.registerCommand(`${extensionName}.noteExplorer.delete`, (file) => this.delete(file))
      );
   }

   private openFile(uri: vscode.Uri): void {
      if (!uri) return;
      vscode.commands.executeCommand('vscode.open', uri);
   }

   private refresh(): void {
      this.fileSystemProvider.refresh();
   }

   private createNewFile(): void;
   private createNewFile(file: File): void;
   private createNewFile(file?: File): void {
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(vscode.Uri.file(Config.get(Config.Sections.notesDir)), vscode.FileType.Directory);
      const dirPath: vscode.Uri = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri : vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));

      let count = 1;
      let filePath: vscode.Uri = vscode.Uri.joinPath(dirPath, 'New file');
      while (this.fileSystemProvider.exists(filePath)) {
         filePath = vscode.Uri.joinPath(dirPath, `New file (${count++})`);
         if (count > 100) {
            vscode.window.showErrorMessage('File named "New file (n)" has reached creation limit. Please delete these files.');
            return;
         }
      }

      this.fileSystemProvider.writeFile(filePath, new Uint8Array(), { create: true, overwrite: false });

      this.openFile(filePath);
   }

   private createNewFolder(): void;
   private createNewFolder(file: File): void;
   private createNewFolder(file?: File): void {
      const selectedFile: File = file ? file : this.treeView.selection.length ? this.treeView.selection[0] : new File(vscode.Uri.file(Config.get(Config.Sections.notesDir)), vscode.FileType.Directory);
      const dirPath: vscode.Uri = selectedFile.type === vscode.FileType.Directory ? selectedFile.uri : vscode.Uri.file(path.dirname(selectedFile.uri.fsPath));

      let count = 1;
      let filePath: vscode.Uri = vscode.Uri.joinPath(dirPath, 'New folder');
      while (this.fileSystemProvider.exists(filePath)) {
         filePath = vscode.Uri.joinPath(dirPath, `New folder (${count++})`);
         if (count > 100) {
            vscode.window.showErrorMessage('Folder named "New folder (n)" has reached creation limit. Please delete these folders.');
            return;
         }
      }

      this.fileSystemProvider.createDirectory(filePath);
   }

   private findInFolder(file: File): void {
      if (!file) return;
      //TODO: add search web view
   }

   private cut(file: File): void {
      if (!file) return;
      this.fileSystemProvider.setClipboard(file.uri, true);
   }

   private copy(file: File): void {
      if (!file) return;
      this.fileSystemProvider.setClipboard(file.uri, false);
   }

   private paste(file: File): void {
      if (!file) return;

      const clipboard = this.fileSystemProvider.getClipboard();
      if (!clipboard) {
         vscode.window.showErrorMessage('Clipboard is empty.');
         return;
      }

      const destParent = file.type === vscode.FileType.Directory ? file.uri.fsPath : path.dirname(file.uri.fsPath);
      const destBase = path.basename(clipboard.uri.fsPath);
      let count = 1;
      let filePath: vscode.Uri = vscode.Uri.joinPath(vscode.Uri.file(destParent), destBase);
      while (this.fileSystemProvider.exists(filePath)) {
         if (count == 1) {
            filePath = vscode.Uri.joinPath(file.uri, `${destBase} copy`);
            count++;
         } else {
            filePath = vscode.Uri.joinPath(file.uri, `${destBase} copy ${count++}`);
         }
         if (count > 100) {
            vscode.window.showErrorMessage('File named "{filename} copy n" has reached copying limit. Please delete these files.');
            return;
         }
      }

      if (clipboard.cut) {
         this.fileSystemProvider.move(clipboard.uri, filePath, { overwrite: false });
         this.fileSystemProvider.setClipboard();
      } else {
         this.fileSystemProvider.copy(clipboard.uri, filePath, { overwrite: false });
      }
   }

   private copyPath(file: File): void {
      if (!file) return;
      vscode.env.clipboard.writeText(file.uri.fsPath);
   }

   private copyRelativePath(file: File): void {
      if (!file) return;
      vscode.env.clipboard.writeText(path.relative(Config.get(Config.Sections.notesDir), file.uri.fsPath));
   }

   private async rename(file: File): Promise<void> {
      if (!file) return;

      const dirname = vscode.Uri.file(path.dirname(file.uri.fsPath));
      const input = await vscode.window.showInputBox({
         prompt: 'Enter a name for the file.',
         validateInput: value => {
            if (value == '') return 'Please input any string.';
            if (/[/\\:?*"<>|]/.test(value)) return 'File name may not contain /\\:?*"<>|';
            if (this.fileSystemProvider.exists(vscode.Uri.joinPath(dirname, value))) return `${value} is already exists.`;
            return;
         }
      });
      if (!input) return;

      this.fileSystemProvider.rename(file.uri, vscode.Uri.joinPath(dirname, input), { overwrite: false });
   }

   private async delete(file: File): Promise<void> {
      if (!file) return;
      if (await vscode.window.showWarningMessage(`Are you sure you want to delete "${path.basename(file.uri.fsPath)}"?`, 'Delete', 'Cancel') === 'Cancel') return;
      this.fileSystemProvider.delete(file.uri, { recursive: true });
   }

}