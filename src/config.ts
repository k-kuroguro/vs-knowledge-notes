import { ConfigurationTarget, ExtensionContext, workspace, WorkspaceConfiguration } from "vscode";
import { extensionName } from "./constants";

export class Config {

   private static config: WorkspaceConfiguration;

   constructor(context: ExtensionContext) {
      context.subscriptions.push(workspace.onDidChangeConfiguration(() => Config.load()));
   }

   static async update(section: Config.Sections, value: any): Promise<void> {
      await this.config.update(section, value, ConfigurationTarget.Global);
   }

   static get(section: Config.Sections): any {
      switch (section) {
         case this.Sections.notesDir:
            return this.config.get(section) ?? "";
         default:
            return this.config.get(section);
      }
   }

   static load(): void {
      this.config = workspace.getConfiguration(extensionName);
   }

}

export namespace Config {

   export const Sections = {
      notesDir: "notesDir"
   } as const;
   export type Sections = typeof Sections[keyof typeof Sections];

}

Config.load();