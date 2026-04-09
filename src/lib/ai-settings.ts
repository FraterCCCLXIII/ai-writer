import type { ChatMode } from "@/lib/ai/types";

const STORAGE_KEY = "ai-writer-ai-settings";

export type AiModeSettings = {
  model: string;
};

export type AiSettings = {
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
  /** Per-mode model overrides. When empty, falls back to openaiModel. */
  modes: {
    ask: AiModeSettings;
    edit: AiModeSettings;
    agent: AiModeSettings;
  };
};

const defaultModeSettings: AiModeSettings = { model: "" };

const defaults: AiSettings = {
  openaiApiKey: "",
  openaiBaseUrl: "",
  openaiModel: "",
  modes: {
    ask: { ...defaultModeSettings },
    edit: { ...defaultModeSettings },
    agent: { ...defaultModeSettings },
  },
};

function parseModeSettings(raw: unknown): AiModeSettings {
  if (raw && typeof raw === "object" && "model" in raw) {
    return { model: typeof (raw as { model: unknown }).model === "string" ? (raw as { model: string }).model : "" };
  }
  return { ...defaultModeSettings };
}

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return structuredClone(defaults);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaults);
    const p = JSON.parse(raw) as Partial<AiSettings> & { modes?: Record<string, unknown> };
    return {
      openaiApiKey: typeof p.openaiApiKey === "string" ? p.openaiApiKey : "",
      openaiBaseUrl: typeof p.openaiBaseUrl === "string" ? p.openaiBaseUrl : "",
      openaiModel: typeof p.openaiModel === "string" ? p.openaiModel : "",
      modes: {
        ask: parseModeSettings(p.modes?.ask),
        edit: parseModeSettings(p.modes?.edit),
        agent: parseModeSettings(p.modes?.agent),
      },
    };
  } catch {
    return structuredClone(defaults);
  }
}

export function saveAiSettings(next: AiSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/**
 * Fields to merge into `/api/ai/*` JSON body when the user has configured a key.
 * Accepts an optional mode to resolve the per-mode model override.
 */
export function getAiOverridesForRequest(mode?: ChatMode): {
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
} {
  if (typeof window === "undefined") return {};
  const s = loadAiSettings();
  const key = s.openaiApiKey.trim();
  if (!key) return {};

  const o: {
    openaiApiKey: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
  } = { openaiApiKey: key };

  const base = s.openaiBaseUrl.trim();
  if (base) o.openaiBaseUrl = base;

  // Resolve model: prefer per-mode override, then global, then leave unset.
  const modeModel = mode ? s.modes[mode]?.model?.trim() : "";
  const globalModel = s.openaiModel.trim();
  const resolvedModel = modeModel || globalModel;
  if (resolvedModel) o.openaiModel = resolvedModel;

  return o;
}
