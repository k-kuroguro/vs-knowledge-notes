import * as vscode from 'vscode';
import { Config } from './config';
import { FileSystemProvider } from './fileSystemProvider';

const emptyDisposable: vscode.Disposable = { dispose: () => { } };

export class Watcher {

   private static instance: Watcher = new Watcher();
   private readonly config: Config = Config.getInstance();
   private disposables: { watcher: vscode.Disposable, event: vscode.Disposable } = { watcher: emptyDisposable, event: emptyDisposable };
   private fileSystemProvider?: FileSystemProvider;

   private constructor() { }

   static getInstance(): Watcher {
      return Watcher.instance;
   }

   watch(fileSystemProvider: FileSystemProvider): void {
      this.fileSystemProvider = fileSystemProvider;
      this.disposables.event = this.config.onDidChangeConfig(e => {
         if (e && e.indexOf(Config.ConfigItem.notesDir) !== -1) this.update();
      });
      this.update();
   }

   update(): boolean {
      if (!this.fileSystemProvider) return false;
      if (this.config.notesDir && this.fileSystemProvider.exists(this.config.notesDir)) {
         this.disposables.watcher = this.fileSystemProvider.watch(this.config.notesDir, { recursive: true, excludes: [] });
         return true;
      }
      this.disposables.watcher = emptyDisposable;
      return false;
   }

   dispose() {
      this.disposables.event.dispose();
      this.disposables.watcher.dispose();
   }

}