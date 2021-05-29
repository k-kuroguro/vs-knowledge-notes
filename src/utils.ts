import * as path from 'path';

export function isChild(parent: string, child: string): boolean {
   const relative = path.relative(parent, child);
   return !relative.startsWith('..') && !path.isAbsolute(relative);
}