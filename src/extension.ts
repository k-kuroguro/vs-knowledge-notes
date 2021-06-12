import * as vscode from 'vscode';
import { NoteExplorer } from './noteExplorer';
import { registerCommands } from './commands';
import { Config } from './config';
import { StatusBar } from './statusBar';
import { FileSystemProvider } from './fileSystemProvider';
import { TagView } from './tagView';
import { Watcher } from './watcher';

export function activate(context: vscode.ExtensionContext) {
   const fileSystemProvider = new FileSystemProvider();
   const watcher = Watcher.getInstance();
   watcher.watch(fileSystemProvider);

   context.subscriptions.push(
      watcher,
      Config.getInstance().setListener(),
      new NoteExplorer(fileSystemProvider),
      new StatusBar(),
      new TagView(fileSystemProvider),
      ...registerCommands()
   );
}

export function deactivate() { }
