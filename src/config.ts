import * as vscode from "vscode";
import { extensionName } from "./constants";
import { DisplayMode } from "./types";

export class Config {

   private _onDidChangeConfig: vscode.EventEmitter<Config.ConfigItems | undefined | void> = new vscode.EventEmitter<Config.ConfigItems | undefined | void>();
   readonly onDidChangeConfig: vscode.Event<Config.ConfigItems | undefined | void> = this._onDidChangeConfig.event;

   private static instance: Config = new Config();
   private workspaceConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration(extensionName);
   private hasSetListener: boolean = false;

   private constructor() { }

   static getInstance(): Config {
      return Config.instance;
   }

   setListener(): vscode.Disposable {
      if (this.hasSetListener) return { dispose: () => { } };
      this.hasSetListener = true;
      return vscode.workspace.onDidChangeConfiguration(() => {
         this.loadWorkspaceConfig();
         this._onDidChangeConfig.fire([Config.ConfigItem.notesDir, Config.ConfigItem.confirmDelete, Config.ConfigItem.previewEngine, Config.ConfigItem.singlePreview]);
      });
   }

   loadWorkspaceConfig(): void {
      this.workspaceConfig = vscode.workspace.getConfiguration(extensionName);
   }

   //#region workspaceConfig

   get notesDir(): vscode.Uri | undefined {
      const notesDir = this.workspaceConfig.get<string>('notesDir');
      return notesDir ? vscode.Uri.file(notesDir) : undefined;
   }

   set notesDir(uri: vscode.Uri | undefined) {
      this.workspaceConfig.update('notesDir', uri?.fsPath, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.notesDir]);
   }

   get confirmDelete(): boolean {
      return this.workspaceConfig.get('confirmDelete') ?? false;
   }

   set confirmDelete(confirm: boolean) {
      this.workspaceConfig.update('confirmDelete', confirm, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.confirmDelete]);
   }

   get previewEngine(): Config.PreviewEngine {
      return this.workspaceConfig.get('previewEngine') ?? "default";
   }

   set previewEngine(engine: Config.PreviewEngine) {
      this.workspaceConfig.update('previewEngine', engine, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.previewEngine]);
   }

   get singlePreview(): boolean {
      return vscode.workspace.getConfiguration('markdown-preview-enhanced').get('singlePreview') ?? true;
   }

   set singlePreview(singlePreview: boolean) {
      vscode.workspace.getConfiguration('markdown-preview-enhanced').update('singlePreview', singlePreview, vscode.ConfigurationTarget.Global);
      this._onDidChangeConfig.fire([Config.ConfigItem.singlePreview]);
   }

   //#endregion

   private _displayMode: DisplayMode = DisplayMode.edit;
   private _isNothingTag: boolean = true;
   private _isEmptyNotesDir: boolean = true;

   get displayMode(): DisplayMode {
      return this._displayMode;
   }

   set displayMode(mode: DisplayMode) {
      this._displayMode = mode;
      this._onDidChangeConfig.fire([Config.ConfigItem.displayMode]);
   }

   get isNothingTag(): boolean {
      return this._isNothingTag;
   }

   set isNothingTag(isNothing: boolean) {
      this._isNothingTag = isNothing;
      vscode.commands.executeCommand('setContext', `${extensionName}.isNothingTag`, isNothing);
      this._onDidChangeConfig.fire([Config.ConfigItem.isNothingTag]);
   }

   get isEmptyNotesDir(): boolean {
      return this._isEmptyNotesDir;
   }

   set isEmptyNotesDir(isEmpty: boolean) {
      this._isEmptyNotesDir = isEmpty;
      vscode.commands.executeCommand('setContext', `${extensionName}.isEmptyNotesDir`, isEmpty);
      this._onDidChangeConfig.fire([Config.ConfigItem.isEmptyNotesDir]);
   }

}

export namespace Config {

   export const ConfigItem = {
      notesDir: 1,
      confirmDelete: 2,
      previewEngine: 3,
      singlePreview: 4,
      displayMode: 5,
      isNothingTag: 6,
      isEmptyNotesDir: 7
   } as const;
   export const PreviewEngine = {
      default: 'default',
      enhanced: 'enhanced',
      disuse: 'disuse'
   } as const;
   export type ConfigItem = typeof ConfigItem[keyof typeof ConfigItem];
   export type ConfigItems = ConfigItem[];
   export type PreviewEngine = typeof PreviewEngine[keyof typeof PreviewEngine];

}