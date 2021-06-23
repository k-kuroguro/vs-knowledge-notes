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
         execFile('attrib', ['+r', uri.fsPath], error => {
            if (error) return resolve(false);
            return resolve(true);
         });
      });
   }

   static async makeWritable(uri: vscode.Uri): Promise<boolean> {
      return new Promise<boolean>((resolve, reject) => {
         execFile('attrib', ['-r', uri.fsPath], error => {
            if (error) return resolve(false);
            return resolve(true);
         });
      });
   }

}
