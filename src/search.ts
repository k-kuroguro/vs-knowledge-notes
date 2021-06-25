import * as vscode from 'vscode';
import * as path from 'path';
import escapeStringRegexp from 'escape-string-regexp';
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

const [MatchCaseId, MatchWholeWordId, UseRegularExpressionId] = [0, 1, 2] as const;
const SearchOptions = {
   MatchCase: { id: MatchCaseId, tooltip: 'Match Case', icon: 'case-sensitive.svg' },
   MatchWholeWord: { id: MatchWholeWordId, tooltip: 'Match Whole Word', icon: 'whole-word.svg' },
   UseRegularExpression: { id: UseRegularExpressionId, tooltip: 'Use Regular Expression', icon: 'regex.svg' }
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

   private useSearchOptions: UseSearchOptions = {
      [MatchCaseId]: false,
      [MatchWholeWordId]: false,
      [UseRegularExpressionId]: false
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
               .map(value => new OptionButton(value, this.useSearchOptions[value.id]));

            const updateResults = async (input: string) => {
               if (input === '') {
                  quickPick.items = [];
                  return;
               }
               quickPick.busy = true;
               quickPick.items = await this.searchByDefault(input);
               quickPick.busy = false;
            };

            quickPick.placeholder = 'search';
            quickPick.title = 'Search In Notes';
            quickPick.buttons = optionButtons;
            disposables.push(
               quickPick.onDidAccept(() => {
                  const [uri, lineNumber] = [quickPick.selectedItems[0]?.uri, quickPick.selectedItems[0]?.lineNumber];
                  if (!uri || typeof lineNumber === 'undefined') return;
                  const range = new vscode.Range(lineNumber, 0, lineNumber, 0);
                  vscode.window.showTextDocument(uri, { selection: range }).then(editor => {
                     editor.revealRange(range);
                  });
                  resolve(true);
               }),
               quickPick.onDidChangeValue(async value => {
                  updateResults(value);
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
                  updateResults(quickPick.value);
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

   private async searchByDefault(input: string): Promise<SearchResult[]> {
      const matchesOrError = await this.runRipGrep(input,
         this.useSearchOptions[MatchCaseId],
         this.useSearchOptions[MatchWholeWordId],
         this.useSearchOptions[UseRegularExpressionId]
      );

      if (typeof matchesOrError === 'string') {
         return [new SearchResult(matchesOrError)];
      } else if (!matchesOrError.length) {
         return [new SearchResult('No matching results')];
      } else {
         return matchesOrError
            .sort((x, y) => x.path.text.localeCompare(y.path.text))
            .map(match => {
               const matchedLineText = this.useSearchOptions[UseRegularExpressionId] ? [match.submatches[0].match.text] : match.lines.text.match(`${this.escapeStringRegex(match.submatches[0].match.text)}.*`);
               return new SearchResult(vscode.Uri.file(match.path.text), matchedLineText ? matchedLineText[0] : match.lines.text, match.line_number - 1);
            });
      }
   }

   private escapeStringRegex(string: string) {
      return escapeStringRegexp(string);
   }

   private registerCommands(): vscode.Disposable[] {
      return [
         vscode.commands.registerCommand(`${extensionName}.searchInNotes`, () => {
            this.search();
         })
      ];
   }

}
