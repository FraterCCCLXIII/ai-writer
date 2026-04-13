export type DictationStyleMode = "conversation" | "vibe-coding";

export type DictationEnhancementLevel = "none" | "soft" | "medium" | "high";

export type DictationPhase =
  | "idle"
  | "listening"
  | "recording"
  | "transcribing"
  | "rewriting"
  | "pasting"
  | "done"
  | "error";

export type DictationSettings = {
  enabled: boolean;
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

export type DictationProcessRequest = {
  wavBase64: string;
  settings: Omit<DictationSettings, "enabled">;
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
  phase: DictationPhase;
  title: string;
  detail: string;
  preview?: string;
  rawText?: string;
};

export type DictationBootstrapState = {
  settings: DictationSettings;
  permissions: DictationPermissionsState;
  ollamaReachable: boolean;
  ollamaModels: OllamaModelInfo[];
  recommendedModelInstalled: boolean;
  speechModelReady: boolean;
  helperReady: boolean;
  status: DictationStatus;
};
