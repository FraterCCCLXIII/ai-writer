const STORAGE_KEY = "ai-writer-ai-settings";

export type AiSettings = {
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
};

const defaults: AiSettings = {
  openaiApiKey: "",
  openaiBaseUrl: "",
  openaiModel: "",
};

export function loadAiSettings(): AiSettings {
  if (typeof window === "undefined") return { ...defaults };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const p = JSON.parse(raw) as Partial<AiSettings>;
    return {
      openaiApiKey: typeof p.openaiApiKey === "string" ? p.openaiApiKey : "",
      openaiBaseUrl: typeof p.openaiBaseUrl === "string" ? p.openaiBaseUrl : "",
      openaiModel: typeof p.openaiModel === "string" ? p.openaiModel : "",
    };
  } catch {
    return { ...defaults };
  }
}

export function saveAiSettings(next: AiSettings): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Fields to merge into `/api/ai/*` JSON body when the user has configured a key. */
export function getAiOverridesForRequest(): {
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
  const model = s.openaiModel.trim();
  if (model) o.openaiModel = model;
  return o;
}
