import * as vscode from 'vscode';
import { Config } from './config';
import { FileSystemProvider } from './fileSystemProvider';

const emptyDisposer: vscode.Disposable = { dispose: () => { } };

export class Watcher {

   private static instance: Watcher = new Watcher();
   private readonly config: Config = Config.getInstance();
   private disposers: { watcher: vscode.Disposable, event: vscode.Disposable } = { watcher: emptyDisposer, event: emptyDisposer };
   private fileSystemProvider?: FileSystemProvider;

   private constructor() { }

   static getInstance(): Watcher {
      return Watcher.instance;
   }

   watch(fileSystemProvider: FileSystemProvider): void {
      this.fileSystemProvider = fileSystemProvider;
      this.disposers.event = this.config.onDidChangeConfig(e => {
         if (e && e.indexOf(Config.ConfigItem.notesDir) != -1) this.update();
      });
      this.update();
   }

   update(): boolean {
      if (!this.fileSystemProvider) return false;
      if (this.config.notesDir && this.fileSystemProvider.exists(this.config.notesDir)) {
         this.disposers.watcher = this.fileSystemProvider.watch(this.config.notesDir, { recursive: true, excludes: [] });
         return true;
      }
      this.disposers.watcher = emptyDisposer;
      return false;
   }

   dispose() {
      this.disposers.event.dispose();
      this.disposers.watcher.dispose();
   }

}