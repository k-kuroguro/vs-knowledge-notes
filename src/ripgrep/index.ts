//This file is modified ripgrep-js (https://github.com/alexlafroscia/ripgrep-js) to use vscode-ripgrep.

import { execFile } from 'child_process';
import * as path from 'path';
import { RipGrepError, Match, Options } from './types';
export * from './types';

const rgPath = path.join(__dirname, '..', 'node_modules', 'vscode-ripgrep', 'bin', 'rg');

function formatResults(stdout: string): Match[] {
   stdout = stdout.trim();

   if (!stdout) {
      return [];
   }

   return stdout
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((jsonLine) => jsonLine.type === 'match')
      .map((jsonLine) => jsonLine.data);
}

export function ripGrep(cwd: string, searchTerm: string): Promise<Array<Match>>;
export function ripGrep(cwd: string, options: Options): Promise<Array<Match>>;

export function ripGrep(cwd: string, optionsOrSearchTerm: Options | string): Promise<Array<Match>> {
   let options: Options;

   if (typeof optionsOrSearchTerm === 'string') {
      options = {
         string: optionsOrSearchTerm,
      };
   } else {
      options = optionsOrSearchTerm;
   }

   if (!cwd) {
      return Promise.reject(new Error('No `cwd` provided'));
   }

   if (arguments.length === 1) {
      return Promise.reject(new Error('No search term provided'));
   }

   const command = rgPath;
   const execArgs = ['--json'];

   if (options.fileType) {
      if (!Array.isArray(options.fileType)) {
         options.fileType = [options.fileType];
      }

      for (const fileType of options.fileType) {
         execArgs.push('-t', fileType);
      }
   }

   if (options.globs) {
      for (const glob of options.globs) {
         execArgs.push('-g', glob);
      }
   }

   if (options.multiline) {
      execArgs.push('--multiline');
   }

   if (!options.matchCase) {
      execArgs.push('-i');
   }

   if (options.matchWholeWord) {
      execArgs.push('-w');
   }

   if ('regex' in options) {
      execArgs.push('-e', `${options.regex}`);
   } else if ('string' in options) {
      execArgs.push('-F', '--', `${options.string}`);
   }

   execArgs.push(cwd);

   return new Promise(function (resolve, reject) {
      execFile(command, execArgs, (error, stdout, stderr) => {
         if (!error || (error && stderr === '')) {
            resolve(formatResults(stdout));
         } else {
            reject(new RipGrepError(error, stderr));
         }
      });
   });
}
