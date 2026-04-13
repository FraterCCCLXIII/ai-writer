"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Mic, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveDictationSettings } from "@/lib/dictation/settings";
import type { DictationBootstrapState } from "@/lib/dictation/types";

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download/mac";
type Step = "welcome" | "ollama" | "models" | "permissions" | "ready";

const STEPS: Step[] = ["welcome", "ollama", "models", "permissions", "ready"];

function SetupCard({
  title,
  subtitle,
  action,
  status,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  status?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">{status}{action}</div>
      </div>
    </div>
  );
}

export function DictationSetupWizard() {
  const [bootstrap, setBootstrap] = useState<DictationBootstrapState | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("welcome");

  const refresh = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.dictationBootstrap) return null;
    const next = await api.dictationBootstrap();
    setBootstrap(next);
    saveDictationSettings(next.settings);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (label: string, action: () => Promise<DictationBootstrapState>) => {
      try {
        setBusyAction(label);
        const next = await action();
        setBootstrap(next);
        saveDictationSettings(next.settings);
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  const stepIndex = STEPS.indexOf(step);
  const next = () => {
    if (stepIndex < STEPS.length - 1) setStep(STEPS[stepIndex + 1]);
  };
  const back = () => {
    if (stepIndex > 0) setStep(STEPS[stepIndex - 1]);
  };

  const micReady = bootstrap?.permissions.microphone === "granted";
  const systemReady =
    Boolean(bootstrap?.permissions.accessibility) &&
    Boolean(bootstrap?.permissions.inputMonitoring) &&
    Boolean(bootstrap?.permissions.postEvents);
  const modelReady =
    Boolean(bootstrap?.speechModelReady) &&
    (bootstrap?.settings.textModel.trim()
      ? Boolean(bootstrap?.recommendedModelInstalled)
      : true);

  const canContinue = useMemo(() => {
    switch (step) {
      case "welcome":
        return true;
      case "ollama":
        return Boolean(bootstrap?.ollamaReachable);
      case "models":
        return modelReady;
      case "permissions":
        return Boolean(micReady && systemReady);
      case "ready":
        return true;
      default:
        return false;
    }
  }, [bootstrap?.ollamaReachable, micReady, modelReady, step, systemReady]);

  if (!bootstrap) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <p className="text-sm text-muted-foreground">Loading dictation setup…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
      <div className="w-full max-w-3xl rounded-2xl border border-border bg-background/95 p-6 shadow-2xl backdrop-blur">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="grid gap-1">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Dictation setup
            </p>
            <h1 className="font-serif text-2xl font-medium tracking-tight">
              Finish your local voice workflow
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((entry, index) => (
              <span
                key={entry}
                className={`h-2.5 w-2.5 rounded-full border border-border ${
                  index <= stepIndex ? "bg-foreground" : "bg-transparent"
                }`}
              />
            ))}
          </div>
        </div>

        {step === "welcome" ? (
          <div className="grid gap-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/30">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="grid gap-2">
              <h2 className="font-serif text-xl">OpenWhisp-style dictation, inside Manuscript</h2>
              <p className="text-sm text-muted-foreground">
                The app will set up Ollama, local Whisper speech recognition, and
                the macOS permissions needed for global `Fn` dictation.
              </p>
            </div>
          </div>
        ) : null}

        {step === "ollama" ? (
          <div className="grid gap-4">
            <SetupCard
              title="Ollama runtime"
              subtitle={`Server: ${bootstrap.settings.ollamaBaseUrl}`}
              status={
                bootstrap.ollamaReachable ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs">
                    <Check className="h-3.5 w-3.5" /> Connected
                  </span>
                ) : (
                  <span className="rounded-full border border-border px-2 py-1 text-xs text-muted-foreground">
                    Not running
                  </span>
                )
              }
              action={
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void window.electronAPI?.openExternal(OLLAMA_DOWNLOAD_URL)}
                  >
                    Install Ollama
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyAction === "ollama-open"}
                    onClick={() =>
                      void runAction("ollama-open", () =>
                        window.electronAPI!.dictationLaunchOllama(
                          bootstrap.settings.ollamaBaseUrl,
                        ).then(() => window.electronAPI!.dictationBootstrap()),
                      )
                    }
                  >
                    {busyAction === "ollama-open" ? "Opening..." : "Open Ollama"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyAction === "ollama-refresh"}
                    onClick={() =>
                      void runAction("ollama-refresh", () =>
                        window.electronAPI!.dictationBootstrap(),
                      )
                    }
                  >
                    {busyAction === "ollama-refresh" ? "Checking..." : "Retry"}
                  </Button>
                </>
              }
            />
          </div>
        ) : null}

        {step === "models" ? (
          <div className="grid gap-4">
            <SetupCard
              title="Speech model"
              subtitle={bootstrap.speechModelReady ? "Whisper is ready to transcribe locally." : "Download and warm the local Whisper model."}
              status={
                bootstrap.speechModelReady ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs">
                    <Check className="h-3.5 w-3.5" /> Ready
                  </span>
                ) : null
              }
              action={
                bootstrap.speechModelReady ? null : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyAction === "speech"}
                    onClick={() =>
                      void runAction("speech", () =>
                        window.electronAPI!.dictationPrepareSpeechModel(),
                      )
                    }
                  >
                    {busyAction === "speech" ? "Downloading..." : "Download"}
                  </Button>
                )
              }
            />
            <SetupCard
              title="Rewrite model"
              subtitle={
                bootstrap.settings.textModel.trim()
                  ? `Use ${bootstrap.settings.textModel} for optional polishing.`
                  : "No rewrite model selected. Raw transcription only."
              }
              status={
                !bootstrap.settings.textModel.trim() || bootstrap.recommendedModelInstalled ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs">
                    <Check className="h-3.5 w-3.5" /> Ready
                  </span>
                ) : null
              }
              action={
                !bootstrap.settings.textModel.trim() || bootstrap.recommendedModelInstalled ? null : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyAction === "text-model"}
                    onClick={() =>
                      void runAction("text-model", () =>
                        window.electronAPI!.dictationPullOllamaModel(
                          bootstrap.settings.ollamaBaseUrl,
                          bootstrap.settings.textModel,
                        ).then(() => window.electronAPI!.dictationBootstrap()),
                      )
                    }
                  >
                    {busyAction === "text-model" ? "Downloading..." : "Download"}
                  </Button>
                )
              }
            />
          </div>
        ) : null}

        {step === "permissions" ? (
          <div className="grid gap-4">
            <SetupCard
              title="Microphone"
              subtitle="Lets Manuscript hear your voice."
              status={
                micReady ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs">
                    <Mic className="h-3.5 w-3.5" /> Granted
                  </span>
                ) : null
              }
              action={
                micReady ? null : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      void runAction("microphone", () =>
                        window.electronAPI!.dictationRequestMicrophoneAccess(),
                      )
                    }
                  >
                    Allow microphone
                  </Button>
                )
              }
            />
            <SetupCard
              title="System access"
              subtitle="Accessibility and Input Monitoring are required for global Fn dictation and paste."
              status={
                systemReady ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs">
                    <Shield className="h-3.5 w-3.5" /> Granted
                  </span>
                ) : null
              }
              action={
                systemReady ? null : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      void runAction("system", () =>
                        window.electronAPI!.dictationRequestSystemAccess(),
                      )
                    }
                  >
                    Grant system access
                  </Button>
                )
              }
            />
          </div>
        ) : null}

        {step === "ready" ? (
          <div className="grid gap-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-muted/30">
              <Check className="h-6 w-6" />
            </div>
            <div className="grid gap-2">
              <h2 className="font-serif text-xl">You’re ready to dictate</h2>
              <p className="text-sm text-muted-foreground">
                Hold `Fn`, speak, then release. Manuscript will transcribe your
                speech locally and optionally polish it with Ollama.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={back} disabled={stepIndex === 0}>
            Back
          </Button>
          {step === "ready" ? (
            <Button
              type="button"
              onClick={() =>
                void runAction("complete", () =>
                  window.electronAPI!.dictationUpdateSettings({
                    ...bootstrap.settings,
                    setupComplete: true,
                  }),
                )
              }
            >
              Start dictating
            </Button>
          ) : (
            <Button type="button" onClick={next} disabled={!canContinue}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
