"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioRecorder } from "@/lib/dictation/audio-recorder";
import { saveDictationSettings } from "@/lib/dictation/settings";
import type {
  DictationBootstrapState,
  DictationStatus,
  FocusInfo,
} from "@/lib/dictation/types";

const IDLE_STATUS: DictationStatus = {
  phase: "idle",
  title: "Ready",
  detail: "Hold Fn to dictate. Release Fn to paste.",
};

function AudioGrid({
  level,
  listening,
  processing,
}: {
  level: number;
  listening: boolean;
  processing: boolean;
}) {
  const total = 21;
  const activeCount = listening ? Math.round(level * total) : 0;

  return (
    <div className={`dictation-audio-grid${processing ? " is-processing" : ""}`}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={`dictation-audio-cell${index < activeCount ? " is-on" : ""}`}
          style={processing ? { animationDelay: `${(index % 7) * 0.08}s` } : undefined}
        />
      ))}
    </div>
  );
}

export function DictationOverlay() {
  const [status, setStatus] = useState<DictationStatus>(IDLE_STATUS);
  const [audioLevel, setAudioLevel] = useState(0);
  const bootstrapRef = useRef<DictationBootstrapState | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const recordingRef = useRef(false);
  const processingRef = useRef(false);
  const targetFocusRef = useRef<FocusInfo | null>(null);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushStatus = useCallback((nextStatus: DictationStatus) => {
    setStatus(nextStatus);
    window.electronAPI?.dictationPushStatus?.(nextStatus);
  }, []);

  const scheduleIdleReset = useCallback(() => {
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
      pushStatus(IDLE_STATUS);
      setAudioLevel(0);
    }, 1500);
  }, [pushStatus]);

  const refreshBootstrap = useCallback(async () => {
    const api = window.electronAPI;
    if (!api?.dictationBootstrap) return null;
    const next = await api.dictationBootstrap();
    bootstrapRef.current = next;
    saveDictationSettings(next.settings);
    setStatus(next.status);
    return next;
  }, []);

  const handleHotkeyDown = useCallback(async () => {
    const api = window.electronAPI;
    const recorder = recorderRef.current;
    if (!api?.dictationBootstrap || !recorder) return;
    if (recordingRef.current || processingRef.current) return;

    const current = await refreshBootstrap();
    if (!current) return;

    if (!current.settings.enabled) {
      return;
    }

    if (current.permissions.microphone !== "granted") {
      pushStatus({
        phase: "error",
        title: "Microphone needed",
        detail: "Grant microphone access in setup before dictating.",
      });
      await api.showMainWindow?.();
      scheduleIdleReset();
      return;
    }

    if (
      !current.permissions.accessibility ||
      !current.permissions.inputMonitoring ||
      !current.permissions.postEvents
    ) {
      pushStatus({
        phase: "error",
        title: "System access needed",
        detail: "Grant Accessibility and Input Monitoring before using global dictation.",
      });
      await api.showMainWindow?.();
      scheduleIdleReset();
      return;
    }

    if (!current.speechModelReady) {
      pushStatus({
        phase: "error",
        title: "Speech model unavailable",
        detail: "Download the speech model in setup before dictating.",
      });
      await api.showMainWindow?.();
      scheduleIdleReset();
      return;
    }

    try {
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
        resetTimeoutRef.current = null;
      }
      targetFocusRef.current = current.settings.autoPaste
        ? await api.dictationCaptureTarget?.()
        : null;
      recordingRef.current = true;
      await recorder.start();
      pushStatus({
        phase: "listening",
        title: "Listening",
        detail: "Speak while holding Fn.",
      });
    } catch (error) {
      recordingRef.current = false;
      pushStatus({
        phase: "error",
        title: "Microphone error",
        detail:
          error instanceof Error ? error.message : "The microphone could not start.",
      });
      scheduleIdleReset();
    }
  }, [pushStatus, refreshBootstrap, scheduleIdleReset]);

  const handleHotkeyUp = useCallback(async () => {
    const api = window.electronAPI;
    const recorder = recorderRef.current;
    const bootstrap = bootstrapRef.current;
    if (!api?.dictationProcessAudio || !recorder || !bootstrap) return;
    if (!recordingRef.current || processingRef.current) return;

    recordingRef.current = false;
    processingRef.current = true;

    try {
      const wavBase64 = await recorder.stop();
      await api.dictationProcessAudio({
        wavBase64,
        settings: bootstrap.settings,
        targetFocus: targetFocusRef.current ?? undefined,
      });
      scheduleIdleReset();
    } catch (error) {
      pushStatus({
        phase: "error",
        title: "Dictation failed",
        detail:
          error instanceof Error ? error.message : "Could not finish dictation.",
      });
      scheduleIdleReset();
    } finally {
      setAudioLevel(0);
      targetFocusRef.current = null;
      processingRef.current = false;
    }
  }, [pushStatus, scheduleIdleReset]);

  useEffect(() => {
    document.body.classList.add("dictation-overlay-body");
    const recorder = new AudioRecorder();
    recorder.onLevel = setAudioLevel;
    recorderRef.current = recorder;

    void refreshBootstrap();

    const stopStatus =
      window.electronAPI?.dictationSubscribeStatus?.((nextStatus) => {
        setStatus(nextStatus);
      }) ?? (() => {});

    const stopHotkey =
      window.electronAPI?.dictationSubscribeHotkey?.((event) => {
        if (event.type === "down") void handleHotkeyDown();
        if (event.type === "up") void handleHotkeyUp();
      }) ?? (() => {});

    return () => {
      stopStatus();
      stopHotkey();
      document.body.classList.remove("dictation-overlay-body");
      if (resetTimeoutRef.current) {
        clearTimeout(resetTimeoutRef.current);
      }
      void recorder.cancel().catch(() => {});
      recorderRef.current = null;
    };
  }, [handleHotkeyDown, handleHotkeyUp, refreshBootstrap]);

  const listening = status.phase === "listening";
  const processing =
    status.phase === "transcribing" ||
    status.phase === "rewriting" ||
    status.phase === "pasting";
  const active = status.phase !== "idle";

  return (
    <div className="pointer-events-none fixed inset-0 z-[200]">
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <div
          className={`dictation-overlay-shell${active ? " is-active" : ""}${
            processing ? " is-processing" : ""
          }${status.phase === "done" ? " is-done" : ""}`}
        >
          <AudioGrid
            level={audioLevel}
            listening={listening}
            processing={processing}
          />
          <span className="dictation-overlay-label">
            {status.phase === "idle" ? "Press Fn to dictate" : status.title}
          </span>
        </div>
      </div>
    </div>
  );
}
