import * as vscode from 'vscode';
import { NoteExplorer } from './noteExplorer';
import { registerCommands } from './commands';
import { Config } from './config';
import { StatusBar } from './statusBar';
import { FileSystemProvider } from './fileSystemProvider';
import { TagView } from './tagView';
import { Watcher } from './watcher';

export function activate(context: vscode.ExtensionContext) {
	Config.getInstance().setListener(context);
	const fileSystemProvider = new FileSystemProvider();
	const watcher = Watcher.getInstance()
	watcher.watch(fileSystemProvider);
	new NoteExplorer(context, fileSystemProvider);
	new TagView(context, fileSystemProvider);
	new StatusBar(context);

	context.subscriptions.push(watcher);

	registerCommands(context);
}

export function deactivate() {
}