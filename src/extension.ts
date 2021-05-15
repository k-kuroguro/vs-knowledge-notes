import * as vscode from 'vscode';
import { NoteExplorer } from './noteExplorer';
import { registerCommands } from './commands';
import { Config } from './config';
import { StatusBar } from './statusBar';
import { FileSystemProvider } from './fileSystemProvider';

let noteExplorer: NoteExplorer;
let fileSystemProvider: FileSystemProvider;

export function activate(context: vscode.ExtensionContext) {
	new Config(context);
	fileSystemProvider = new FileSystemProvider();
	noteExplorer = new NoteExplorer(context, fileSystemProvider);
	new StatusBar(context);

	registerCommands(context);
}

export function deactivate() {
	noteExplorer.disposeWatcher();
}