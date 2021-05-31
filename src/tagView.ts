import * as vscode from 'vscode';
import * as path from 'path';
import * as matter from 'gray-matter';
import { ripGrep as rg } from './ripgrep';
import { Config } from './config';
import { extensionName } from './constants';
import { File, FileSystemProvider } from './fileSystemProvider';
import { YAMLException } from 'js-yaml';

class Tag extends vscode.TreeItem {

   constructor(
      public readonly name: string,
      public readonly fileUris: vscode.Uri[]
   ) {
      super(name, vscode.TreeItemCollapsibleState.Collapsed);

      this.tooltip = name;
      this.description = false;
      this.contextValue = `${extensionName}.Tag`;
   }

   iconPath = {
      light: path.join(__filename, '..', '..', 'resources', 'light', 'tag.svg'),
      dark: path.join(__filename, '..', '..', 'resources', 'dark', 'tag.svg')
   };

}

type TreeItem = Tag | File;

class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {

   private _onDidChangeTreeData: vscode.EventEmitter<TreeItem | undefined | void> = new vscode.EventEmitter<TreeItem | undefined | void>();
   readonly onDidChangeTreeData: vscode.Event<TreeItem | undefined | void> = this._onDidChangeTreeData.event;

   private readonly config: Config = Config.getInstance();

   constructor() { }

   refresh(): void {
      this._onDidChangeTreeData.fire();
   }

   getTreeItem(element: TreeItem): vscode.TreeItem {
      return element;
   }

   async getChildren(element?: TreeItem): Promise<TreeItem[]> {
      if (element) {
         if (!(element instanceof Tag) || !this.config.notesDir) return [];
         //@ts-ignore type inference of `this.config.notesDir` does not work.
         return element.fileUris.map(uri => new File(uri, vscode.FileType.File, path.relative(this.config.notesDir.fsPath, uri.fsPath)));
      } else {
         if (!this.config.notesDir) return [];
         const matches = await rg(this.config.notesDir.fsPath, { multiline: true, regex: '---[\\s\\S]*?tags:[\\s\\S]*?---' });
         const results: Tag[] = [];
         for (const match of matches) {
            try {
               const tags: string[] | undefined = matter(match.submatches[0].match.text).data.tags;
               if (!tags) continue;
               for (const tag of tags) {
                  const tagIndex = results.findIndex(r => r.name == tag);
                  if (tagIndex == -1) {
                     results.push(new Tag(tag, [vscode.Uri.file(match.path.text)]));
                     continue;
                  }
                  results[tagIndex].fileUris.push(vscode.Uri.file(match.path.text));
               }
            } catch (e: unknown) {
               if (e instanceof YAMLException) {
                  vscode.window.showErrorMessage(`Duplicated YAML front matter key in ${matches[0].path.text}`);
                  continue;
               } else {
                  vscode.window.showErrorMessage(`${e} @ ${matches[0].path.text}`);
                  continue;
               }
            }
         }
         results.sort((x, y) => x.name.localeCompare(y.name));
         return results;
      }
   }

}

export class TagView {

   private watcherDisposer: vscode.Disposable;
   private readonly treeDataProvider: TreeDataProvider;
   private readonly treeView: vscode.TreeView<TreeItem>;
   private readonly config: Config = Config.getInstance();

   constructor(context: vscode.ExtensionContext, private readonly fileSystemProvider: FileSystemProvider) {
      this.treeDataProvider = new TreeDataProvider();
      this.treeView = vscode.window.createTreeView(`${extensionName}.tagView`, { treeDataProvider: this.treeDataProvider, showCollapseAll: true });

      if (this.config.notesDir && this.fileSystemProvider.exists(this.config.notesDir)) {
         this.watcherDisposer = this.fileSystemProvider.watch(this.config.notesDir, { recursive: true, excludes: [] });
      } else {
         this.watcherDisposer = { dispose: () => { } }
      }

      context.subscriptions.push(
         this.treeView,
         this.config.onDidChangeConfig(e => {
            if (e && e.indexOf(Config.ConfigItem.notesDir) != -1) {
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
      if (this.config.notesDir && this.fileSystemProvider.exists(this.config.notesDir)) {
         this.watcherDisposer = this.fileSystemProvider.watch(this.config.notesDir, { recursive: true, excludes: [] });
      } else {
         this.watcherDisposer = { dispose: () => { } }
      }
   }

   //#region commands

   private registerCommands(context: vscode.ExtensionContext): void {
      context.subscriptions.push(
         vscode.commands.registerCommand(`${extensionName}.tagView.refresh`, () => this.refresh())
      );
   }

   private refresh(): void {
      this.treeDataProvider.refresh();
   }

   //#endregion

}