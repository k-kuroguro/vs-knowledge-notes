import * as vscode from 'vscode';
import { NoteExplorer } from './noteExplorer';
import { registerCommands } from './commands';
import { Config } from './config';
import { StatusBar } from './statusBar';

let noteExplorer: NoteExplorer;

export function activate(context: vscode.ExtensionContext) {
	new Config(context);
	noteExplorer = new NoteExplorer(context);
	new StatusBar(context);

	registerCommands(context);
}

export function deactivate() {
	noteExplorer.disposeWatcher();
}