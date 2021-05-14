import * as vscode from "vscode";
import * as fs from "fs";
import { extensionName } from "./constants";
import { DisplayMode } from "./types";

export class Config {

   private static _onDidChangeConfig: vscode.EventEmitter<Config.ConfigItem | undefined | void> = new vscode.EventEmitter<Config.ConfigItem | undefined | void>();
   static readonly onDidChangeConfig: vscode.Event<Config.ConfigItem | undefined | void> = Config._onDidChangeConfig.event;

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
      Config._onDidChangeConfig.fire(Config.ConfigItem.notesDir);
   }

   static get confirmDelete(): boolean {
      return this.config.get('confirmDelete') ?? false;
   }

   static set confirmDelete(confirm: boolean) {
      this.config.update('confirmDelete', confirm, vscode.ConfigurationTarget.Global);
      Config._onDidChangeConfig.fire(Config.ConfigItem.confirmDelete);
   }

   static get previewEngine(): Config.PreviewEngine {
      return this.config.get('previewEngine') ?? "default";
   }

   static set previewEngine(engine: Config.PreviewEngine) {
      this.config.update('previewEngine', engine, vscode.ConfigurationTarget.Global);
      Config._onDidChangeConfig.fire(Config.ConfigItem.previewEngine);
   }

   static get singlePreview(): boolean {
      return vscode.workspace.getConfiguration('markdown-preview-enhanced').get('singlePreview') ?? true;
   }

   static set singlePreview(singlePreview: boolean) {
      vscode.workspace.getConfiguration('markdown-preview-enhanced').update('singlePreview', singlePreview, vscode.ConfigurationTarget.Global);
      Config._onDidChangeConfig.fire(Config.ConfigItem.singlePreview);
   }

   private static _displayMode: DisplayMode = DisplayMode.edit;

   static get displayMode(): DisplayMode {
      return Config._displayMode;
   }

   static set displayMode(mode: DisplayMode) {
      Config._displayMode = mode;
      Config._onDidChangeConfig.fire(Config.ConfigItem.displayMode);
   }

}

export namespace Config {

   export const ConfigItem = {
      notesDir: 1,
      confirmDelete: 2,
      previewEngine: 3,
      singlePreview: 4,
      displayMode: 5
   } as const;
   export type ConfigItem = typeof ConfigItem[keyof typeof ConfigItem];
   export type PreviewEngine = 'default' | 'enhanced';

}

Config.load();