import * as vscode from 'vscode';
import * as path from 'path';
import * as matter from 'gray-matter';
import { ripGrep as rg } from './ripgrep';
import { Config } from './config';
import { extensionName } from './constants';
import { File, FileSystemProvider } from './fileSystemProvider';
import { YAMLException } from 'js-yaml';

class Tag extends vscode.TreeItem {

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

   addFileUris(...uris: vscode.Uri[]): Tag {
      for (const uri of uris) {
         this.fileUris.set(uri.fsPath, uri);
      }
      return this;
   }

   getChildren(): Tag[] {
      return [...this.children.values()];
   }

   addChildren(...children: Tag[]): Tag {
      for (const child of children) {
         this.children.set(child.label, this.children.get(child.label)?.addFileUris(...child.getFileUris()) ?? child);
      }
      return this;
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
         const results: Tag[] = [];
         for (const child of element.getChildren()) {
            this.pushUniqueTags(results, child);
         }
         //@ts-ignore type inference of `this.config.notesDir` does not work.
         return this.sort([...results, ...element.getFileUris().map(uri => new File(uri, vscode.FileType.File, path.relative(this.config.notesDir.fsPath, uri.fsPath)))]);
      } else {
         if (!this.config.notesDir) return [];

         const matches = await rg(this.config.notesDir.fsPath, { multiline: true, regex: '---[\\s\\S]*?tags:[\\s\\S]*?---' });

         const results: Tag[] = [];
         for (const match of matches) {
            try {
               const labels: string[] | undefined = matter(match.submatches[0].match.text).data.tags;
               if (!labels) continue;
               const fileUris = [vscode.Uri.file(match.path.text)];
               for (const label of labels) {
                  this.pushUniqueTags(results, label, fileUris);
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
         return this.sort(results);
      }
   }

   private sort(elements: TreeItem[]): TreeItem[] {
      return elements.sort((x, y) => {
         if (x instanceof Tag && y instanceof Tag || x instanceof File && y instanceof File) {
            return x.label.localeCompare(y.label);
         }
         return x instanceof Tag ? -1 : 1;
      });
   }

   private parseTieredTag(label: string): [parent: string, child: string | undefined] {
      return [label.split(this.config.tagDelimiter)[0], label.indexOf(this.config.tagDelimiter) !== -1 ? label.split(this.config.tagDelimiter).slice(1).join(this.config.tagDelimiter) : undefined];
   }

   private pushUniqueTags(tagArray: Tag[], tag: Tag): Tag[];
   private pushUniqueTags(tagArray: Tag[], label: string, fileUris: vscode.Uri[]): Tag[];
   private pushUniqueTags(tagArray: Tag[], tagOrLabel: Tag | string, fileUris?: vscode.Uri[]): Tag[] {
      const [label, uris] = tagOrLabel instanceof Tag ? [tagOrLabel.label, tagOrLabel.getFileUris()] : [tagOrLabel, fileUris ?? []];
      const [parentLabel, childLabel] = this.parseTieredTag(label);
      const children = childLabel ? [new Tag(childLabel, uris)] : [];
      const tagIndex = tagArray.findIndex(r => r.label === parentLabel);
      if (tagIndex === -1) {
         tagArray.push(new Tag(parentLabel, uris, children));
      } else {
         tagArray[tagIndex].addFileUris(...uris);
         tagArray[tagIndex].addChildren(...children);
      }
      return tagArray;
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
            if (e && (e.indexOf(Config.ConfigItem.NotesDir) !== -1 || e.indexOf(Config.ConfigItem.TagDelimiter) !== -1)) {
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