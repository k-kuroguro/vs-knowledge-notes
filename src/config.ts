import { ConfigurationTarget, ExtensionContext, Uri, workspace, WorkspaceConfiguration } from "vscode";
import { extensionName } from "./constants";

export class Config {

   private static config: WorkspaceConfiguration;

   constructor(context: ExtensionContext) {
      context.subscriptions.push(workspace.onDidChangeConfiguration(() => Config.load()));
   }

   static load(): void {
      this.config = workspace.getConfiguration(extensionName);
   }

   static get notesDir(): Uri | undefined {
      const notesDir = this.config.get<string>('notesDir');
      return notesDir ? Uri.file(notesDir) : undefined;
   }

   static set notesDir(uri: Uri | undefined) {
      this.config.update('notesDir', uri?.fsPath, ConfigurationTarget.Global);
   }

}

Config.load();