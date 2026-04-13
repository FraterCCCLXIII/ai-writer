"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from "@/lib/ai-settings";
import {
  loadDictationSettings,
  saveDictationSettings,
} from "@/lib/dictation/settings";
import type {
  DictationBootstrapState,
  DictationSettings,
  OllamaStatus,
} from "@/lib/dictation/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MODE_LABELS: { key: "ask" | "edit" | "agent"; label: string; hint: string }[] = [
  { key: "ask", label: "Ask", hint: "Conversational / brainstorming (fast model recommended)" },
  { key: "edit", label: "Edit", hint: "Targeted edits to chapters (balanced model)" },
  { key: "agent", label: "Agent", hint: "Autonomous multi-step tasks (most capable model)" },
];

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download/mac";

function formatBytes(size: number): string {
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let current = size;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function SettingsModal({ open, onOpenChange }: Props) {
  const [draft, setDraft] = useState<AiSettings>(() => loadAiSettings());
  const [dictationDraft, setDictationDraft] = useState<DictationSettings>(() =>
    loadDictationSettings(),
  );
  const [dictationBootstrap, setDictationBootstrap] =
    useState<DictationBootstrapState | null>(null);
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [ollamaBusyAction, setOllamaBusyAction] = useState<
    null | "check" | "launch" | "download"
  >(null);
  const [dictationBusyAction, setDictationBusyAction] = useState<
    null | "speech" | "microphone" | "system"
  >(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  const refreshOllamaStatus = useCallback(async (baseUrl: string) => {
    const api = window.electronAPI;
    if (!api?.dictationGetOllamaStatus) {
      setOllamaStatus(null);
      return;
    }

    const status = await api.dictationGetOllamaStatus(baseUrl);
    setOllamaStatus(status);
  }, []);

  const refreshDictationBootstrap = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.dictationBootstrap) {
      setDictationBootstrap(null);
      return null;
    }

    const next = await api.dictationBootstrap();
    setDictationBootstrap(next);
    setDictationDraft(next.settings);
    saveDictationSettings(next.settings);
    return next;
  }, []);

  const runOllamaAction = useCallback(
    async (
      action: "check" | "launch" | "download",
      runner: () => Promise<OllamaStatus>,
    ) => {
      try {
        setOllamaBusyAction(action);
        setOllamaError(null);
        setOllamaStatus(await runner());
      } catch (error) {
        setOllamaError(
          error instanceof Error ? error.message : "Could not complete the Ollama action.",
        );
      } finally {
        setOllamaBusyAction(null);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      const nextDictation = loadDictationSettings();
      setDraft(loadAiSettings());
      setDictationDraft(nextDictation);
      setOllamaError(null);
      void refreshOllamaStatus(nextDictation.ollamaBaseUrl);
      void refreshDictationBootstrap();
    });
    return () => cancelAnimationFrame(id);
  }, [open, refreshDictationBootstrap, refreshOllamaStatus]);

  const onSave = async () => {
    saveAiSettings(draft);
    if (window.electronAPI?.dictationUpdateSettings) {
      const next = await window.electronAPI.dictationUpdateSettings(dictationDraft);
      setDictationBootstrap(next);
      setDictationDraft(next.settings);
      saveDictationSettings(next.settings);
      setOllamaStatus({
        installed: ollamaStatus?.installed ?? false,
        reachable: next.ollamaReachable,
        models: next.ollamaModels,
      });
    } else {
      saveDictationSettings(dictationDraft);
    }
    onOpenChange(false);
  };

  const currentModelInstalled = useMemo(() => {
    const modelName = dictationDraft.textModel.trim();
    if (!modelName || !ollamaStatus?.reachable) return false;
    return ollamaStatus.models.some((model) => model.name === modelName);
  }, [dictationDraft.textModel, ollamaStatus]);

  const isDesktop = typeof window !== "undefined" && Boolean(window.electronAPI);
  const ollamaStatusLabel = !isDesktop
    ? "Desktop only"
    : ollamaStatus?.reachable
      ? `Connected${ollamaStatus.models.length ? ` · ${ollamaStatus.models.length} models` : ""}`
      : ollamaStatus?.installed
        ? "Installed, not running"
        : "Not installed";
  const permissionState = dictationBootstrap?.permissions;
  const speechModelReady = Boolean(dictationBootstrap?.speechModelReady);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure local dictation and OpenAI-compatible API access. Settings
            are stored locally on this device.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-lg border border-border p-4">
            <div className="grid gap-1">
              <p className="text-sm font-medium">In-app dictation</p>
              <p className="text-xs text-muted-foreground">
                Desktop only. Audio is recorded locally, transcribed with Whisper,
                and can optionally be polished with Ollama before insertion.
              </p>
            </div>
            <label className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-border"
                checked={dictationDraft.enabled}
                onChange={(e) =>
                  setDictationDraft((current) => ({
                    ...current,
                    enabled: e.target.checked,
                  }))
                }
              />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">Enable desktop dictation</span>
                <span className="text-xs text-muted-foreground">
                  Adds a mic control to the editor toolbar inside the desktop app.
                </span>
              </span>
            </label>
            <div className="grid gap-3 rounded-md border border-border p-3">
              <div className="grid gap-1">
                <p className="text-sm font-medium">Global behavior</p>
                <p className="text-xs text-muted-foreground">
                  These settings power the macOS-wide OpenWhisp-style workflow.
                </p>
              </div>
              <label className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border"
                  checked={dictationDraft.autoPaste}
                  onChange={(e) =>
                    setDictationDraft((current) => ({
                      ...current,
                      autoPaste: e.target.checked,
                    }))
                  }
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">Auto-paste into the active app</span>
                  <span className="text-xs text-muted-foreground">
                    Paste the finished dictation back into the app that had focus.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border"
                  checked={dictationDraft.showOverlay}
                  onChange={(e) =>
                    setDictationDraft((current) => ({
                      ...current,
                      showOverlay: e.target.checked,
                    }))
                  }
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">Show overlay</span>
                  <span className="text-xs text-muted-foreground">
                    Keep the floating dictation overlay available while the app runs.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border border-border px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-border"
                  checked={dictationDraft.launchAtLogin}
                  onChange={(e) =>
                    setDictationDraft((current) => ({
                      ...current,
                      launchAtLogin: e.target.checked,
                    }))
                  }
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">Launch at login</span>
                  <span className="text-xs text-muted-foreground">
                    Start Manuscript automatically so global dictation is ready.
                  </span>
                </span>
              </label>
            </div>
            <div className="grid gap-2">
              <label htmlFor="dictation-whisper-model" className="text-sm font-medium">
                Whisper model
              </label>
              <Input
                id="dictation-whisper-model"
                autoComplete="off"
                placeholder="onnx-community/whisper-base"
                value={dictationDraft.whisperModel}
                onChange={(e) =>
                  setDictationDraft((current) => ({
                    ...current,
                    whisperModel: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="dictation-ollama-base-url" className="text-sm font-medium">
                Ollama base URL
              </label>
              <Input
                id="dictation-ollama-base-url"
                type="url"
                autoComplete="off"
                placeholder="http://127.0.0.1:11434"
                value={dictationDraft.ollamaBaseUrl}
                onChange={(e) =>
                  setDictationDraft((current) => ({
                    ...current,
                    ollamaBaseUrl: e.target.value,
                  }))
                }
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="dictation-text-model" className="text-sm font-medium">
                Rewrite model
              </label>
              <Input
                id="dictation-text-model"
                autoComplete="off"
                placeholder="gemma4:e4b"
                value={dictationDraft.textModel}
                onChange={(e) =>
                  setDictationDraft((current) => ({
                    ...current,
                    textModel: e.target.value,
                  }))
                }
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to skip Ollama polishing and insert the raw transcription.
              </p>
            </div>
            <div className="grid gap-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <p className="text-sm font-medium">Speech model</p>
                  <p className="text-xs text-muted-foreground">
                    Local Whisper transcription runs entirely on device.
                  </p>
                </div>
                <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                  {speechModelReady ? "Ready" : "Not downloaded"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!isDesktop || dictationBusyAction !== null}
                  onClick={async () => {
                    try {
                      setDictationBusyAction("speech");
                      const next = await window.electronAPI?.dictationPrepareSpeechModel?.();
                      if (next) {
                        setDictationBootstrap(next);
                        setDictationDraft(next.settings);
                        saveDictationSettings(next.settings);
                      }
                    } finally {
                      setDictationBusyAction(null);
                    }
                  }}
                >
                  {dictationBusyAction === "speech"
                    ? "Preparing..."
                    : speechModelReady
                      ? "Re-prepare speech model"
                      : "Download speech model"}
                </Button>
              </div>
            </div>
            <div className="grid gap-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid gap-1">
                  <p className="text-sm font-medium">Ollama</p>
                  <p className="text-xs text-muted-foreground">
                    External local runtime for optional rewrite polishing.
                  </p>
                </div>
                <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                  {ollamaStatusLabel}
                </span>
              </div>
              {ollamaError ? (
                <p className="text-xs text-destructive">{ollamaError}</p>
              ) : null}
              {dictationDraft.textModel.trim() && ollamaStatus?.reachable && !currentModelInstalled ? (
                <p className="text-xs text-muted-foreground">
                  The configured rewrite model is not installed yet.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isDesktop}
                  onClick={() =>
                    void window.electronAPI?.openExternal(OLLAMA_DOWNLOAD_URL)
                  }
                >
                  Install Ollama
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isDesktop || ollamaBusyAction !== null}
                  onClick={() =>
                    void runOllamaAction("launch", () =>
                      window.electronAPI!.dictationLaunchOllama(
                        dictationDraft.ollamaBaseUrl,
                      ),
                    )
                  }
                >
                  {ollamaBusyAction === "launch" ? "Opening..." : "Open Ollama"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!isDesktop || ollamaBusyAction !== null}
                  onClick={() =>
                    void runOllamaAction("check", () =>
                      window.electronAPI!.dictationGetOllamaStatus(
                        dictationDraft.ollamaBaseUrl,
                      ),
                    )
                  }
                >
                  {ollamaBusyAction === "check" ? "Checking..." : "Retry"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={
                    !isDesktop ||
                    ollamaBusyAction !== null ||
                    !dictationDraft.textModel.trim()
                  }
                  onClick={() =>
                    void runOllamaAction("download", () =>
                      window.electronAPI!.dictationPullOllamaModel(
                        dictationDraft.ollamaBaseUrl,
                        dictationDraft.textModel.trim(),
                      ),
                    )
                  }
                >
                  {ollamaBusyAction === "download"
                    ? "Downloading..."
                    : `Download ${dictationDraft.textModel.trim() || "model"}`}
                </Button>
              </div>
              {ollamaStatus?.reachable && ollamaStatus.models.length > 0 ? (
                <div className="grid gap-2">
                  <label
                    htmlFor="dictation-installed-model"
                    className="text-sm font-medium"
                  >
                    Installed models
                  </label>
                  <select
                    id="dictation-installed-model"
                    value={currentModelInstalled ? dictationDraft.textModel : ""}
                    onChange={(e) =>
                      setDictationDraft((current) => ({
                        ...current,
                        textModel: e.target.value,
                      }))
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">Select an installed model</option>
                    {ollamaStatus.models.map((model) => (
                      <option key={model.name} value={model.name}>
                        {model.name} ({formatBytes(model.size)})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
            <div className="grid gap-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <p className="text-sm font-medium">Permissions</p>
                  <p className="text-xs text-muted-foreground">
                    Global Fn dictation requires microphone, Accessibility, and Input Monitoring.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 text-xs text-muted-foreground">
                <p>Microphone: {permissionState?.microphone ?? "unknown"}</p>
                <p>
                  Accessibility: {permissionState?.accessibility ? "granted" : "not granted"}
                </p>
                <p>
                  Input Monitoring: {permissionState?.inputMonitoring ? "granted" : "not granted"}
                </p>
                <p>Paste Events: {permissionState?.postEvents ? "granted" : "not granted"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!isDesktop || dictationBusyAction !== null}
                  onClick={async () => {
                    try {
                      setDictationBusyAction("microphone");
                      const next =
                        await window.electronAPI?.dictationRequestMicrophoneAccess?.();
                      if (next) {
                        setDictationBootstrap(next);
                        setDictationDraft(next.settings);
                        saveDictationSettings(next.settings);
                      }
                    } finally {
                      setDictationBusyAction(null);
                    }
                  }}
                >
                  {dictationBusyAction === "microphone"
                    ? "Requesting..."
                    : "Allow microphone"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!isDesktop || dictationBusyAction !== null}
                  onClick={async () => {
                    try {
                      setDictationBusyAction("system");
                      const next =
                        await window.electronAPI?.dictationRequestSystemAccess?.();
                      if (next) {
                        setDictationBootstrap(next);
                        setDictationDraft(next.settings);
                        saveDictationSettings(next.settings);
                      }
                    } finally {
                      setDictationBusyAction(null);
                    }
                  }}
                >
                  {dictationBusyAction === "system"
                    ? "Opening..."
                    : "Grant system access"}
                </Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="dictation-style-mode" className="text-sm font-medium">
                  Style
                </label>
                <select
                  id="dictation-style-mode"
                  value={dictationDraft.styleMode}
                  onChange={(e) =>
                    setDictationDraft((current) => ({
                      ...current,
                      styleMode: e.target.value as DictationSettings["styleMode"],
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="conversation">Conversation</option>
                  <option value="vibe-coding">Vibe coding</option>
                </select>
              </div>
              <div className="grid gap-2">
                <label htmlFor="dictation-enhancement-level" className="text-sm font-medium">
                  Enhancement
                </label>
                <select
                  id="dictation-enhancement-level"
                  value={dictationDraft.enhancementLevel}
                  onChange={(e) =>
                    setDictationDraft((current) => ({
                      ...current,
                      enhancementLevel:
                        e.target.value as DictationSettings["enhancementLevel"],
                    }))
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="none">No filter</option>
                  <option value="soft">Soft</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-2">
            <label htmlFor="settings-api-key" className="text-sm font-medium">
              API key
            </label>
            <Input
              id="settings-api-key"
              type="password"
              autoComplete="off"
              placeholder="sk-…"
              value={draft.openaiApiKey}
              onChange={(e) =>
                setDraft((d) => ({ ...d, openaiApiKey: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="settings-base-url" className="text-sm font-medium">
              Base URL
            </label>
            <Input
              id="settings-base-url"
              type="url"
              autoComplete="off"
              placeholder="https://api.openai.com/v1"
              value={draft.openaiBaseUrl}
              onChange={(e) =>
                setDraft((d) => ({ ...d, openaiBaseUrl: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Omit to use the default OpenAI API URL from the server.
            </p>
          </div>
          <div className="grid gap-2">
            <label htmlFor="settings-model" className="text-sm font-medium">
              Default model
            </label>
            <Input
              id="settings-model"
              autoComplete="off"
              placeholder="gpt-4o-mini"
              value={draft.openaiModel}
              onChange={(e) =>
                setDraft((d) => ({ ...d, openaiModel: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Used for all modes unless overridden below.
            </p>
          </div>

          <Separator />

          <div className="grid gap-3">
            <p className="text-sm font-medium">Per-mode model overrides</p>
            <p className="text-xs text-muted-foreground -mt-1">
              Leave blank to use the default model above.
            </p>
            {MODE_LABELS.map(({ key, label, hint }) => (
              <div key={key} className="grid gap-1.5">
                <label
                  htmlFor={`settings-model-${key}`}
                  className="text-sm font-medium"
                >
                  {label}
                </label>
                <Input
                  id={`settings-model-${key}`}
                  autoComplete="off"
                  placeholder={draft.openaiModel || "gpt-4o-mini"}
                  value={draft.modes[key].model}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      modes: {
                        ...d.modes,
                        [key]: { model: e.target.value },
                      },
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
