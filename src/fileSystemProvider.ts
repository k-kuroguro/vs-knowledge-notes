import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fse from 'fs-extra';
import * as path from 'path';
import { extensionDisplayName, extensionName } from './constants';

class Utils {

	static getFileType(file: fs.Dirent): vscode.FileType {
		if (file.isFile()) return vscode.FileType.File;
		if (file.isDirectory()) return vscode.FileType.Directory;
		if (file.isSymbolicLink()) return vscode.FileType.SymbolicLink;
		return vscode.FileType.Unknown;
	}

	static handleResult<T>(resolve: (result: T) => void, reject: (error: Error) => void, error: Error | null | undefined, result: T): void {
		if (error) {
			reject(Utils.handleError(error));
		} else {
			resolve(result);
		}
	}

	private static handleError(error: NodeJS.ErrnoException): Error {
		switch (error?.code) {
			case 'ENEOT':
				return vscode.FileSystemError.FileNotFound();
			case 'EISDIR': return vscode.FileSystemError.FileIsADirectory();
			case 'EEXIST':
				return vscode.FileSystemError.FileExists();
			case 'EPERM':
			case 'EACCESS':
				return vscode.FileSystemError.NoPermissions();
			default:
				return error;
		}
	}

}

class FileStat implements vscode.FileStat {

	constructor(private fsStat: fs.Stats) { }

	get type(): vscode.FileType {
		return this.fsStat.isFile() ? vscode.FileType.File : this.fsStat.isDirectory() ? vscode.FileType.Directory : this.fsStat.isSymbolicLink() ? vscode.FileType.SymbolicLink : vscode.FileType.Unknown;
	}

	get isFile(): boolean | undefined {
		return this.fsStat.isFile();
	}

	get isDirectory(): boolean | undefined {
		return this.fsStat.isDirectory();
	}

	get isSymbolicLink(): boolean | undefined {
		return this.fsStat.isSymbolicLink();
	}

	get size(): number {
		return this.fsStat.size;
	}

	get ctime(): number {
		return this.fsStat.ctime.getTime();
	}

	get mtime(): number {
		return this.fsStat.mtime.getTime();
	}

}

export class File extends vscode.TreeItem {

	public readonly command?: vscode.Command;
	public readonly contextValue: string;

	constructor(
		public readonly uri: vscode.Uri,
		public readonly type: vscode.FileType
	) {
		super(uri, type === vscode.FileType.Directory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);

		this.tooltip = path.basename(uri.fsPath);
		this.description = false;
		this.contextValue = File.toContextValue(type);
		this.command = type === vscode.FileType.File ? { command: `${extensionName}.noteExplorer.openFile`, title: `${extensionDisplayName}: Open File`, arguments: [uri] } : undefined;
	}

	private static toContextValue(type: vscode.FileType): string {
		switch (type) {
			case vscode.FileType.File:
				return `${extensionName}.File`;
			case vscode.FileType.Directory:
				return `${extensionName}.Directory`;
			case vscode.FileType.SymbolicLink:
				return `${extensionName}.SymbolicLink`;
			case vscode.FileType.Unknown:
				return `${extensionName}.Unknown`;
		}
	}

}

export class FileSystemProvider implements vscode.FileSystemProvider {

	private _onDidChangeFile: vscode.EventEmitter<vscode.FileChangeEvent[]> = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
	readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event;

	private clipboard?: { uri: vscode.Uri, cut: boolean };

	constructor() { }

	setClipboard(uri?: vscode.Uri, cut?: boolean): void {
		this.clipboard = (!uri || cut === void 0) ? undefined : { uri, cut };
	}

	getClipboard(): { uri: vscode.Uri, cut: boolean } | undefined {
		return this.clipboard;
	}

	createDirectory(uri: vscode.Uri): void | Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.mkdir(uri.fsPath, { recursive: true }, error => Utils.handleResult(resolve, reject, error, undefined));
		});
	}

	copy(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean }) {
		return new Promise<void>((resolve, reject) => {
			fse.copy(source.fsPath, destination.fsPath, { overwrite: options.overwrite }, error => Utils.handleResult(resolve, reject, error, undefined));
		});
	}

	delete(uri: vscode.Uri, options: { recursive: boolean }): void | Promise<void> {
		return new Promise<void>((resolve, reject) => {
			fs.rmdir(uri.fsPath, { recursive: options.recursive }, error => Utils.handleResult(resolve, reject, error, undefined));
		});
	}

	exists(uri: vscode.Uri): boolean {
		return fs.existsSync(uri.fsPath);
	}

	move(source: vscode.Uri, destination: vscode.Uri, options: { overwrite: boolean }) {
		return new Promise<void>((resolve, reject) => {
			fse.move(source.fsPath, destination.fsPath, { overwrite: options.overwrite }, error => Utils.handleResult(resolve, reject, error, undefined));
		});
	}

	private async _readDirectory(uri: vscode.Uri): Promise<fs.Dirent[]> {
		return new Promise<fs.Dirent[]>((resolve, reject) => {
			fs.readdir(uri.fsPath, { withFileTypes: true }, (error, dirents) => Utils.handleResult(resolve, reject, error, dirents));
		});
	}

	readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Promise<[string, vscode.FileType][]> {
		return this._readDirectory(uri).then(dirents => {
			return dirents.map(dirent => [path.join(uri.fsPath, dirent.name), Utils.getFileType(dirent)]);
		});
	}

	readFile(uri: vscode.Uri): Uint8Array | Promise<Uint8Array> {
		return new Promise<Buffer>((resolve, reject) => {
			fs.readFile(uri.fsPath, (error, buffer) => Utils.handleResult(resolve, reject, error, buffer));
		});
	}

	rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void | Promise<void> {
		const exists = this.exists(newUri);
		if (exists) {
			if (options.overwrite) this.delete(newUri, { recursive: true });
			else throw vscode.FileSystemError.FileExists();
		}

		const parentExists = this.exists(vscode.Uri.file(path.dirname(newUri.fsPath)));
		if (!parentExists) this.createDirectory(vscode.Uri.file(path.dirname(newUri.fsPath)));

		return new Promise<void>((resolve, reject) => {
			fs.rename(oldUri.fsPath, newUri.fsPath, error => Utils.handleResult(resolve, reject, error, void 0));
		});
	}

	stat(uri: vscode.Uri): vscode.FileStat | Promise<vscode.FileStat> {
		return new Promise<vscode.FileStat>((resolve, reject) => {
			fs.stat(uri.fsPath, (error, stat) => Utils.handleResult(resolve, reject, error, new FileStat(stat)));
		});
	}

	//HACK: exclude is unsupported
	watch(uri: vscode.Uri, options: { excludes: string[], recursive: boolean }): vscode.Disposable {
		const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event: string, fileName: string | Buffer) => {
			const filePath: vscode.Uri = vscode.Uri.joinPath(uri, fileName.toString());
			this._onDidChangeFile.fire([{
				type: event === 'change' ? vscode.FileChangeType.Changed : this.exists(filePath) ? vscode.FileChangeType.Created : vscode.FileChangeType.Deleted,
				uri: filePath
			} as vscode.FileChangeEvent]);
		});
		return { dispose: () => watcher.close() };
	}

	writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void | Promise<void> {
		const exists = this.exists(uri);
		if (exists) {
			if (!options.overwrite) throw vscode.FileSystemError.FileExists();
		} else {
			if (!options.create) throw vscode.FileSystemError.FileNotFound();
			this.createDirectory(vscode.Uri.file(path.dirname(uri.fsPath)));
		}

		return new Promise<void>((resolve, reject) => {
			fs.writeFile(uri.fsPath, content, error => Utils.handleResult(resolve, reject, error, undefined));
		});
	}

}