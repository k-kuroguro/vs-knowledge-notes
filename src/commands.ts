import * as vscode from 'vscode';
import { Config } from './config';
import { extensionName } from './constants'

async function setNotesDir() {
   const selectedUris = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
   });
   if (!selectedUris) return;
   const selectedDir = selectedUris[0];
   Config.notesDir = selectedDir;
}

export function registerCommands(context: vscode.ExtensionContext): void {
   context.subscriptions.push(
      vscode.commands.registerCommand(`${extensionName}.setNotesDir`, () => setNotesDir())
   );
}