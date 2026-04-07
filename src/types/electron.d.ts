export type WorkspaceReadResult =
  | { ok: true; data: string }
  | { ok: false; missing: true };

export type ElectronAPI = {
  openFolder: () => Promise<string | null>;
  readWorkspaceFile: (folderPath: string) => Promise<WorkspaceReadResult>;
  writeWorkspaceFile: (
    folderPath: string,
    contents: string,
  ) => Promise<void>;
};

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
