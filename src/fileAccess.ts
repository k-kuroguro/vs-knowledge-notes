import * as vscode from 'vscode';
import * as fs from 'fs';
import { execFile } from 'child_process';

export class FileAccess {

   static isReadonly(uri: vscode.Uri): boolean {
      try {
         fs.accessSync(uri.fsPath, fs.constants.W_OK);
         return false;
      } catch {
         return true;
      }
   }

   static async makeReadonly(uri: vscode.Uri): Promise<boolean> {
      return new Promise<boolean>((resolve, reject) => {
         let command: string, arg: string;
         switch (process.platform) {
            case 'win32':
               command = 'attrib';
               arg = '+r';
               break;
            case 'linux':
            case 'darwin':
               command = 'chmod';
               arg = 'u-w';
               break;
            default:
               vscode.window.showErrorMessage(`Not supporting ${process.platform}`);
               return;
         }
         execFile('attrib', [arg, uri.fsPath], error => {
            if (error) return resolve(false);
            return resolve(true);
         });
      });
   }

   static async makeWritable(uri: vscode.Uri): Promise<boolean> {
      return new Promise<boolean>((resolve, reject) => {
         let command: string, arg: string;
         switch (process.platform) {
            case 'win32':
               command = 'attrib';
               arg = '-r';
               break;
            case 'linux':
            case 'darwin':
               command = 'chmod';
               arg = 'u+w';
               break;
            default:
               vscode.window.showErrorMessage(`Not supporting ${process.platform}`);
               return;
         }
         execFile('attrib', [arg, uri.fsPath], error => {
            if (error) return resolve(false);
            return resolve(true);
         });
      });
   }

}
