import * as vscode from "vscode";
import * as fs from "fs";
import { extensionName } from "./constants";
import { DisplayMode } from "./types";

export class Config {

   private static _onDidChangeConfig: vscode.EventEmitter<undefined | void> = new vscode.EventEmitter<undefined | void>();
   static readonly onDidChangeConfig: vscode.Event<undefined | void> = Config._onDidChangeConfig.event;

   private static config: vscode.WorkspaceConfiguration;

   constructor(context: vscode.ExtensionContext) {
      context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => {
         Config.load();
         Config._onDidChangeConfig.fire();
      }));
   }

   static load(): void {
      this.config = vscode.workspace.getConfiguration(extensionName);
   }

   static get notesDir(): vscode.Uri | undefined {
      const notesDir = this.config.get<string>('notesDir');
      return notesDir ? vscode.Uri.file(notesDir) : undefined;
   }

   static set notesDir(uri: vscode.Uri | undefined) {
      this.config.update('notesDir', uri?.fsPath, vscode.ConfigurationTarget.Global);
      Config._onDidChangeConfig.fire();
   }

   static get confirmDelete(): boolean {
      return this.config.get('confirmDelete') ?? false;
   }

   static set confirmDelete(confirm: boolean) {
      this.config.update('confirmDelete', confirm, vscode.ConfigurationTarget.Global);
      Config._onDidChangeConfig.fire();
   }

   static get previewEngine(): Config.PreviewEngine {
      return this.config.get('previewEngine') ?? "default";
   }

   static set previewEngine(engine: Config.PreviewEngine) {
      this.config.update('previewEngine', engine, vscode.ConfigurationTarget.Global);
      Config._onDidChangeConfig.fire();
   }

   static get singlePreview(): boolean {
      return vscode.workspace.getConfiguration('markdown-preview-enhanced').get('singlePreview') ?? true;
   }

   static set singlePreview(singlePreview: boolean) {
      vscode.workspace.getConfiguration('markdown-preview-enhanced').update('singlePreview', singlePreview, vscode.ConfigurationTarget.Global);
   }

   private static _displayMode: DisplayMode = DisplayMode.edit;

   static get displayMode(): DisplayMode {
      return Config._displayMode;
   }

   static set displayMode(mode: DisplayMode) {
      Config._displayMode = mode;
      Config._onDidChangeConfig.fire();
   }

}

export namespace Config {

   export type PreviewEngine = "default" | "enhanced";

}

Config.load();