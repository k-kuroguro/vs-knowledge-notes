import * as vscode from 'vscode';
import { Config } from './config';
import { extensionName } from './constants';
import { DisplayMode } from './types';

export class StatusBar {

   private statusBarItem: vscode.StatusBarItem;

   constructor(context: vscode.ExtensionContext) {
      this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
      this.statusBarItem.text = Config.displayMode === DisplayMode.edit ? '$(pencil) (Edit Mode)' : '$(book) (View Mode)';
      this.statusBarItem.command = `${extensionName}.toggleDisplayMode`;
      this.statusBarItem.show();

      context.subscriptions.push(
         this.statusBarItem,
         Config.onDidChangeConfig(e => {
            if (e === Config.ConfigItem.displayMode) {
               this.update();
            }
         })
      );
   }

   private update(): void {
      this.statusBarItem.text = Config.displayMode === DisplayMode.edit ? '$(pencil) (Edit Mode)' : '$(book) (View Mode)';
   }

}