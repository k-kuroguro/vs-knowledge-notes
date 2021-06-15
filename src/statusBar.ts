import * as vscode from 'vscode';
import { Config } from './config';
import { extensionName } from './constants';
import { DisplayMode } from './types';

export class StatusBar {

   private statusBarItem: vscode.StatusBarItem;
   private readonly config: Config = Config.getInstance();
   private readonly disposables: vscode.Disposable[] = [];

   constructor() {
      this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
      this.statusBarItem.text = this.config.displayMode === DisplayMode.Edit ? '$(pencil) (Edit Mode)' : '$(book) (View Mode)';
      this.statusBarItem.command = `${extensionName}.toggleDisplayMode`;
      this.statusBarItem.show();

      this.disposables.push(
         this.statusBarItem,
         this.config.onDidChangeConfig(e => {
            if (e && e.indexOf(Config.ConfigItem.DisplayMode) !== -1) {
               this.update();
            }
         })
      );
   }

   dispose(): void {
      for (const disposable of this.disposables) {
         disposable.dispose();
      }
   }

   private update(): void {
      this.statusBarItem.text = this.config.displayMode === DisplayMode.Edit ? '$(pencil) (Edit Mode)' : '$(book) (View Mode)';
   }

}