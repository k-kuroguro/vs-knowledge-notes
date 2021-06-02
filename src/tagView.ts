import * as vscode from 'vscode';
import * as path from 'path';
import * as matter from 'gray-matter';
import { ripGrep as rg } from './ripgrep';
import { Config } from './config';
import { extensionName } from './constants';
import { File, FileSystemProvider } from './fileSystemProvider';
import { YAMLException } from 'js-yaml';

class Tag extends vscode.TreeItem {

   static readonly delimiter: string = '/';
   private readonly fileUris: Map<string, vscode.Uri> = new Map();
   private readonly children: Map<string, Tag> = new Map();

   constructor(
      public label: string,
      fileUris: vscode.Uri[] = [],
      children: Tag[] = []
   ) {
      super(label, vscode.TreeItemCollapsibleState.Collapsed);

      this.tooltip = label;
      this.description = false;
      this.contextValue = `${extensionName}.Tag`;
      this.iconPath = {
         light: path.join(__filename, '..', '..', 'resources', 'light', 'tag.svg'),
         dark: path.join(__filename, '..', '..', 'resources', 'dark', 'tag.svg')
      };
      this.addFileUris(...fileUris);
      this.addChildren(...children);
   }

   getFileUris(): vscode.Uri[] {
      return [...this.fileUris.values()];
   }

   addFileUris(...uris: vscode.Uri[]): void {
      for (const uri of uris) {
         this.fileUris.set(uri.fsPath, uri);
      }
   }

   getChildren(): Tag[] {
      return [...this.children.values()];
   }

   addChildren(...children: Tag[]): void {
      for (const child of children) {
         this.children.set(child.label, child);
      }
   }

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
         const result: TreeItem[] = [...element.getFileUris().map(uri => new File(uri, vscode.FileType.File, path.relative(this.config.notesDir.fsPath, uri.fsPath)))];
         const children = element.getChildren();
         for (const child of children) {
            const hasChild = child.label.indexOf('/') !== -1;
            const children = hasChild ? [new Tag(child.label.split('/').slice(1).join('/'), child.getFileUris())] : [];
            const label = child.label.split('/')[0];
            result.push(new Tag(label, child.getFileUris(), children));
         }
         return result;
      } else {
         if (!this.config.notesDir) return [];

         const matches = await rg(this.config.notesDir.fsPath, { multiline: true, regex: '---[\\s\\S]*?tags:[\\s\\S]*?---' });

         const results: Tag[] = [];
         for (const match of matches) {
            try {
               const tags: string[] | undefined = matter(match.submatches[0].match.text).data.tags;
               if (!tags) continue;
               for (const tag of tags) {
                  const hasChild = tag.indexOf('/') !== -1;
                  const children = hasChild ? [new Tag(tag.split('/').slice(1).join('/'), [vscode.Uri.file(match.path.text)])] : [];
                  const tagLabel = tag.split('/')[0];
                  const tagIndex = results.findIndex(r => r.label === tagLabel);
                  if (tagIndex === -1) {
                     results.push(new Tag(tagLabel, [vscode.Uri.file(match.path.text)], children));
                     continue;
                  }
                  results[tagIndex].addFileUris(vscode.Uri.file(match.path.text));
                  results[tagIndex].addChildren(...children);
               }
            } catch (e: unknown) {
               if (e instanceof YAMLException) {
                  vscode.window.showErrorMessage(`Duplicated YAML front matter key in ${matches[0].path.text}`);
               } else {
                  vscode.window.showErrorMessage(`${e} @ ${matches[0].path.text}`);
               }
               continue;
            }
         }
         this.config.isNothingTag = !results.length;
         results.sort((x, y) => x.label.localeCompare(y.label));
         return results;
      }
   }

}

export class TagView {

   private readonly treeDataProvider: TreeDataProvider;
   private readonly treeView: vscode.TreeView<TreeItem>;
   private readonly config: Config = Config.getInstance();
   private readonly disposables: vscode.Disposable[] = [];

   constructor(private readonly fileSystemProvider: FileSystemProvider) {
      this.treeDataProvider = new TreeDataProvider();
      this.treeView = vscode.window.createTreeView(`${extensionName}.tagView`, { treeDataProvider: this.treeDataProvider, showCollapseAll: true });

      this.disposables.push(
         this.treeView,
         this.config.onDidChangeConfig(e => {
            if (e && e.indexOf(Config.ConfigItem.notesDir) !== -1) {
               this.treeDataProvider.refresh();
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
         vscode.commands.registerCommand(`${extensionName}.tagView.refresh`, () => this.refresh())
      ];
   }

   private refresh(): void {
      this.treeDataProvider.refresh();
   }

   //#endregion

}