import * as vscode from 'vscode';
import * as path from 'path';
import { Config } from './config';
import { extensionName } from './constants';
import { ripGrep as rg, Options as rgOptions, RipGrepError, Match } from './ripgrep';

class SearchResult implements vscode.QuickPickItem {

   alwaysShow = true;
   label: string;
   description?: string;
   detail?: string;
   uri?: vscode.Uri;
   lineNumber?: number;

   constructor(label: string);
   constructor(uri: vscode.Uri, matchedLineText: string, lineNumber: number);
   constructor(uriOrLabel: vscode.Uri | string, matchedLineText?: string, lineNumber?: number) {
      if (typeof uriOrLabel === 'string') {
         this.label = uriOrLabel;
         return;
      }
      this.uri = uriOrLabel;
      this.label = path.basename(this.uri.fsPath);
      this.description = this.uri.fsPath;
      this.detail = matchedLineText;
      this.lineNumber = lineNumber;
   }

}

const SearchOptions = {
   MatchCase: { id: 0, tooltip: 'Match Case', icon: 'case-sensitive.svg' },
   MatchWholeWord: { id: 1, tooltip: 'Match Whole Word', icon: 'whole-word.svg' },
   UseRegularExpression: { id: 2, tooltip: 'Use Regular Expression', icon: 'regex.svg' }
} as const;
type SearchOptions = typeof SearchOptions[keyof typeof SearchOptions];
type SearchOptionId = typeof SearchOptions[keyof typeof SearchOptions]['id'];
type UseSearchOptions = { [key in SearchOptionId]: boolean };

class OptionButton implements vscode.QuickInputButton {

   private _enabled: boolean = false;
   iconPath: { light: vscode.Uri, dark: vscode.Uri };
   tooltip: string;

   constructor(option: SearchOptions);
   constructor(option: SearchOptions, enabled: boolean);
   constructor(public option: SearchOptions, enabled?: boolean) {
      this.tooltip = option.tooltip;
      if (typeof enabled !== 'undefined') this._enabled = enabled;
      this.iconPath = {
         dark: vscode.Uri.file(path.join(__dirname, '..', 'resources', this._enabled ? 'dark' : 'light', this.option.icon)),
         light: vscode.Uri.file(path.join(__dirname, '..', 'resources', this._enabled ? 'light' : 'dark', this.option.icon))
      };
   }

   enabled(): boolean {
      return this._enabled;
   }

   enable(): void {
      if (this._enabled) return;
      this._enabled = true;
      this.iconPath = {
         light: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'light', this.option.icon)),
         dark: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'dark', this.option.icon))
      };
   }

   disable(): void {
      if (!this._enabled) return;
      this._enabled = false;
      this.iconPath = {
         dark: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'light', this.option.icon)),
         light: vscode.Uri.file(path.join(__dirname, '..', 'resources', 'dark', this.option.icon))
      };
   }

}

export class Search {

   private readonly config: Config = Config.getInstance();
   private readonly disposables: vscode.Disposable[] = [];

   useSearchOptions: UseSearchOptions = {
      0: false,
      1: false,
      2: false
   };

   constructor(useSearchOptions?: UseSearchOptions) {
      this.disposables.push(
         ...this.registerCommands()
      );
      if (useSearchOptions) this.useSearchOptions = useSearchOptions;
   }

   dispose() {
      this.disposables.forEach(d => d.dispose());
   }

   private async runRipGrep(keyword: string, matchCase: boolean, matchWholeWord: boolean, useRegex: boolean): Promise<Match[] | string> {
      if (!this.config.notesDir) return 'Notes directory is not found';

      const options: rgOptions = {
         ...(useRegex ? { regex: keyword, multiline: true } : { string: keyword }),
         ...{ matchCase, matchWholeWord }
      };

      const matchesOrError = await rg(
         this.config.notesDir.fsPath, options
      ).catch((e: RipGrepError) => {
         console.log(e);
         return e.stderr;
      });
      return matchesOrError;
   }

   private async search(): Promise<boolean> {
      const disposables: vscode.Disposable[] = [];
      try {
         return await new Promise((resolve, reject) => {
            const quickPick = vscode.window.createQuickPick<SearchResult>();
            const optionButtons = Object
               .values(SearchOptions)
               .map(value => new OptionButton(value, this.useSearchOptions[value.id]))
               .sort((x, y) => {
                  if (x.option.id < y.option.id) return -1;
                  if (x.option.id > y.option.id) return 1;
                  return 0;
               });

            quickPick.placeholder = 'search';
            quickPick.title = 'Search In Notes';
            quickPick.buttons = optionButtons;
            disposables.push(
               quickPick.onDidAccept(() => {
                  const [uri, lineNumber] = [quickPick.selectedItems[0]?.uri, quickPick.selectedItems[0]?.lineNumber];
                  if (!uri || !lineNumber) return;
                  const range = new vscode.Range(lineNumber, 0, lineNumber, 0);
                  vscode.window.showTextDocument(uri, { selection: range }).then(editor => {
                     editor.revealRange(range);
                  });
                  resolve(true);
               }),
               quickPick.onDidChangeValue(async value => {
                  if (value === '') {
                     quickPick.items = [];
                     return;
                  }
                  quickPick.busy = true;

                  const matchesOrError = await this.runRipGrep(value,
                     this.useSearchOptions[0],
                     this.useSearchOptions[1],
                     this.useSearchOptions[2]
                  );

                  if (typeof matchesOrError === 'string') {
                     quickPick.items = [new SearchResult(matchesOrError)];
                  } else if (!matchesOrError.length) {
                     quickPick.items = [new SearchResult('No matching results')];
                  } else {
                     quickPick.items = matchesOrError
                        .sort((x, y) => x.path.text.localeCompare(y.path.text))
                        .map(match => new SearchResult(vscode.Uri.file(match.path.text), match.lines.text, match.line_number - 1));
                  }

                  quickPick.busy = false;
               }),
               quickPick.onDidTriggerButton(e => {
                  const optionButton = optionButtons.find(button => button.tooltip === e.tooltip);
                  if (!optionButton) return;
                  if (optionButton.enabled()) {
                     optionButton.disable();
                     this.useSearchOptions[optionButton.option.id] = false;
                  } else {
                     optionButton.enable();
                     this.useSearchOptions[optionButton.option.id] = true;
                  }
                  quickPick.buttons = Object.values(optionButtons);
               }),
               quickPick.onDidHide(() => {
                  resolve(false);
               })
            );
            quickPick.show();
         });
      } finally {
         disposables.forEach(d => d.dispose());
      }
   }

   private registerCommands(): vscode.Disposable[] {
      return [
         vscode.commands.registerCommand(`${extensionName}.searchInNotes`, () => {
            this.search();
         })
      ];
   }

}
