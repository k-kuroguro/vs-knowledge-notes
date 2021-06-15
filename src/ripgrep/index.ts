//This file is modified ripgrep-js (https://github.com/alexlafroscia/ripgrep-js) to use vscode-ripgrep and execa.

import * as execa from 'execa';
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

   let execString = `${rgPath} --json`;
   if ('regex' in options) {
      execString = `${execString} -e ${options.regex}`;
   } else if ('string' in options) {
      execString = `${execString} -F ${options.string}`;
   }

   if (options.fileType) {
      if (!Array.isArray(options.fileType)) {
         options.fileType = [options.fileType];
      }

      for (const fileType of options.fileType) {
         execString = `${execString} -t ${fileType}`;
      }
   }

   if (options.globs) {
      execString = options.globs.reduce((command, glob) => {
         return `${command} -g '${glob}'`;
      }, execString);
   }

   if (options.multiline) {
      execString = `${execString} --multiline`;
   }

   execString = `${execString} ${cwd}`;
   return new Promise(function (resolve, reject) {
      try {
         resolve(formatResults(execa.commandSync(execString).stdout));
      } catch (e: any) {
         reject(new RipGrepError(e));
      }
   });
}