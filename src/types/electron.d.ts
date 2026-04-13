export type WorkspaceReadResult =
  | { ok: true; data: string }
  | { ok: false; missing: true };

export type FsDirEntry = {
  name: string;
  isDirectory: boolean;
};

export type DictationStyleMode = "conversation" | "vibe-coding";

export type DictationEnhancementLevel = "none" | "soft" | "medium" | "high";

export type PermissionAccessState =
  | "granted"
  | "denied"
  | "restricted"
  | "not-determined"
  | "unknown";

export type DictationPermissionsState = {
  microphone: PermissionAccessState;
  accessibility: boolean;
  inputMonitoring: boolean;
  postEvents: boolean;
};

export type FocusInfo = {
  canPaste: boolean;
  role?: string;
  appName?: string;
  bundleIdentifier?: string;
  processIdentifier?: number;
};

export type HotkeyEvent = {
  type: "down" | "up";
};

export type DictationStatus = {
  phase:
    | "idle"
    | "listening"
    | "recording"
    | "transcribing"
    | "rewriting"
    | "pasting"
    | "done"
    | "error";
  title: string;
  detail: string;
  preview?: string;
  rawText?: string;
};

export type DictationProcessRequest = {
  wavBase64: string;
  settings: {
    whisperModel: string;
    ollamaBaseUrl: string;
    textModel: string;
    styleMode: DictationStyleMode;
    enhancementLevel: DictationEnhancementLevel;
    autoPaste: boolean;
    showOverlay: boolean;
    launchAtLogin: boolean;
    setupComplete: boolean;
  };
  targetFocus?: FocusInfo;
};

export type DictationProcessResult = {
  rawText: string;
  finalText: string;
  usedRewriteFallback: boolean;
  pasted?: boolean;
  focusInfo?: FocusInfo;
};

export type OllamaModelInfo = {
  name: string;
  size: number;
  modifiedAt?: string;
};

export type OllamaStatus = {
  installed: boolean;
  reachable: boolean;
  models: OllamaModelInfo[];
};

export type DictationBootstrapState = {
  settings: DictationProcessRequest["settings"] & { enabled: boolean };
  permissions: DictationPermissionsState;
  ollamaReachable: boolean;
  ollamaModels: OllamaModelInfo[];
  recommendedModelInstalled: boolean;
  speechModelReady: boolean;
  helperReady: boolean;
  status: DictationStatus;
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

  // Dictation
  dictationProcessAudio: (
    request: DictationProcessRequest,
  ) => Promise<DictationProcessResult>;
  dictationGetOllamaStatus: (baseUrl: string) => Promise<OllamaStatus>;
  dictationLaunchOllama: (baseUrl: string) => Promise<OllamaStatus>;
  dictationPullOllamaModel: (
    baseUrl: string,
    modelName: string,
  ) => Promise<OllamaStatus>;
  dictationBootstrap: () => Promise<DictationBootstrapState>;
  dictationRequestMicrophoneAccess: () => Promise<DictationBootstrapState>;
  dictationRequestSystemAccess: () => Promise<DictationBootstrapState>;
  dictationCaptureTarget: () => Promise<FocusInfo>;
  dictationUpdateSettings: (
    settings: DictationProcessRequest["settings"] & { enabled: boolean },
  ) => Promise<DictationBootstrapState>;
  dictationPrepareSpeechModel: () => Promise<DictationBootstrapState>;
  dictationPushStatus: (status: DictationStatus) => void;
  dictationSubscribeStatus: (callback: (status: DictationStatus) => void) => () => void;
  dictationSubscribeHotkey: (callback: (event: HotkeyEvent) => void) => () => void;
  openExternal: (targetUrl: string) => Promise<void>;
  showMainWindow: () => Promise<void>;

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
