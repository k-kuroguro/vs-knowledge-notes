//This file is extracted from ripgrep-js (https://github.com/alexlafroscia/ripgrep-js).

import { ExecException } from 'child_process';

type StringSearchOptions = {
   string: string;
};

type RegexSearchOptions = {
   regex: string;
};

type LocatorOptions = StringSearchOptions | RegexSearchOptions;

export type Options = LocatorOptions & {
   globs?: Array<string>;
   fileType?: string | Array<string>;
   multiline?: boolean;
   matchCase?: boolean;
   matchWholeWord?: boolean;
};

export type RipgrepJsonSubmatch = {
   match: { text: string };
   start: number;
   end: number;
};

export type RipGrepJsonMatch = {
   type: 'match';
   data: {
      path: {
         text: string;
      };
      lines: {
         text: string;
      };
      line_number: number;
      absolute_offset: number;
      submatches: Array<RipgrepJsonSubmatch>;
   };
};

export type Match = RipGrepJsonMatch['data'];

export class RipGrepError {
   private error: ExecException;

   stderr: string;

   constructor(error: ExecException, stderr: string) {
      this.error = error;
      this.stderr = stderr;
   }

   get message(): string {
      return this.error.message;
   }
}
