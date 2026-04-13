import type { DictationSettings } from "@/lib/dictation/types";

const STORAGE_KEY = "ai-writer-dictation-settings";
export const DICTATION_SETTINGS_EVENT = "ai-writer:dictation-settings-changed";

const defaults: DictationSettings = {
  enabled: true,
  whisperModel: "onnx-community/whisper-base",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  textModel: "gemma4:e4b",
  styleMode: "conversation",
  enhancementLevel: "soft",
  autoPaste: true,
  showOverlay: false,
  launchAtLogin: false,
  setupComplete: false,
};

export function getDefaultDictationSettings(): DictationSettings {
  return structuredClone(defaults);
}

export function loadDictationSettings(): DictationSettings {
  if (typeof window === "undefined") return getDefaultDictationSettings();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultDictationSettings();

    const parsed = JSON.parse(raw) as Partial<DictationSettings>;
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaults.enabled,
      whisperModel:
        typeof parsed.whisperModel === "string" && parsed.whisperModel.trim()
          ? parsed.whisperModel
          : defaults.whisperModel,
      ollamaBaseUrl:
        typeof parsed.ollamaBaseUrl === "string" && parsed.ollamaBaseUrl.trim()
          ? parsed.ollamaBaseUrl
          : defaults.ollamaBaseUrl,
      textModel: typeof parsed.textModel === "string" ? parsed.textModel : defaults.textModel,
      styleMode:
        parsed.styleMode === "vibe-coding" || parsed.styleMode === "conversation"
          ? parsed.styleMode
          : defaults.styleMode,
      enhancementLevel:
        parsed.enhancementLevel === "none" ||
        parsed.enhancementLevel === "soft" ||
        parsed.enhancementLevel === "medium" ||
        parsed.enhancementLevel === "high"
          ? parsed.enhancementLevel
          : defaults.enhancementLevel,
      autoPaste:
        typeof parsed.autoPaste === "boolean" ? parsed.autoPaste : defaults.autoPaste,
      showOverlay:
        typeof parsed.showOverlay === "boolean"
          ? parsed.showOverlay
          : defaults.showOverlay,
      launchAtLogin:
        typeof parsed.launchAtLogin === "boolean"
          ? parsed.launchAtLogin
          : defaults.launchAtLogin,
      setupComplete:
        typeof parsed.setupComplete === "boolean"
          ? parsed.setupComplete
          : defaults.setupComplete,
    };
  } catch {
    return getDefaultDictationSettings();
  }
}

export function saveDictationSettings(next: DictationSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(DICTATION_SETTINGS_EVENT));
}
