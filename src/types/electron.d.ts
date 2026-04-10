export type WorkspaceReadResult =
  | { ok: true; data: string }
  | { ok: false; missing: true };

export type FsDirEntry = {
  name: string;
  isDirectory: boolean;
};

export type ElectronAPI = {
  platform: NodeJS.Platform;

  // Legacy workspace (v1)
  openFolder: () => Promise<string | null>;
  readWorkspaceFile: (folderPath: string) => Promise<WorkspaceReadResult>;
  writeWorkspaceFile: (folderPath: string, contents: string) => Promise<void>;

  // Filesystem operations (v2)
  readDir: (dirPath: string) => Promise<FsDirEntry[]>;
  readTextFile: (filePath: string) => Promise<string | null>;
  writeTextFile: (filePath: string, contents: string) => Promise<void>;
  writeBinaryFile: (filePath: string, buffer: Uint8Array) => Promise<void>;
  createDir: (dirPath: string) => Promise<void>;
  deletePath: (targetPath: string) => Promise<void>;
  renamePath: (oldPath: string, newPath: string) => Promise<void>;
  pathExists: (targetPath: string) => Promise<boolean>;
  readWorkspaceConfig: (folderPath: string) => Promise<string | null>;
  writeWorkspaceConfig: (folderPath: string, contents: string) => Promise<void>;
  hasLegacyWorkspace: (folderPath: string) => Promise<boolean>;

  // Window controls
  windowMinimize?: () => Promise<void>;
  windowToggleMaximize?: () => Promise<void>;
  windowClose?: () => Promise<void>;
  windowIsMaximized?: () => Promise<boolean>;
  subscribeMaximized?: (callback: (maximized: boolean) => void) => () => void;
};

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
