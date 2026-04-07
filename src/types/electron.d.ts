export type WorkspaceReadResult =
  | { ok: true; data: string }
  | { ok: false; missing: true };

export type ElectronAPI = {
  platform: NodeJS.Platform;
  openFolder: () => Promise<string | null>;
  readWorkspaceFile: (folderPath: string) => Promise<WorkspaceReadResult>;
  writeWorkspaceFile: (
    folderPath: string,
    contents: string,
  ) => Promise<void>;
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
