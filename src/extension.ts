import * as vscode from 'vscode';
import { NoteExplorer } from './noteExplorer';
import { registerCommands } from './commands';
import { Config } from './config';
import { StatusBar } from './statusBar';
import { FileSystemProvider } from './fileSystemProvider';
import { TagExplorer } from './tagExplorer';
import { Watcher } from './watcher';
import { Search } from './search';

export function activate(context: vscode.ExtensionContext) {
   const fileSystemProvider = new FileSystemProvider();
   const watcher = Watcher.getInstance();
   watcher.watch(fileSystemProvider);

   context.subscriptions.push(
      watcher,
      Config.getInstance().setListener(),
      new NoteExplorer(fileSystemProvider),
      new StatusBar(),
      new TagExplorer(fileSystemProvider),
      new Search(),
      ...registerCommands()
   );
}

export function deactivate() { }
