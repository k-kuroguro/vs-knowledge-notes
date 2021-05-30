import * as vscode from 'vscode';
import { NoteExplorer } from './noteExplorer';
import { registerCommands } from './commands';
import { Config } from './config';
import { StatusBar } from './statusBar';
import { FileSystemProvider } from './fileSystemProvider';
import { TagView } from './tagView';

let noteExplorer: NoteExplorer;
let tagView: TagView;
let fileSystemProvider: FileSystemProvider;

export function activate(context: vscode.ExtensionContext) {
	Config.getInstance().setListener(context);
	fileSystemProvider = new FileSystemProvider();
	noteExplorer = new NoteExplorer(context, fileSystemProvider);
	tagView = new TagView(context, fileSystemProvider);
	new StatusBar(context);

	registerCommands(context);
}

export function deactivate() {
	noteExplorer.disposeWatcher();
	tagView.disposeWatcher();
}