import type {
  DictationProcessRequest,
  DictationProcessResult,
} from "@/lib/dictation/types";

export interface DesktopDictationAdapter {
  isAvailable(): boolean;
  processAudio(request: DictationProcessRequest): Promise<DictationProcessResult>;
}

const unsupportedAdapter: DesktopDictationAdapter = {
  isAvailable: () => false,
  processAudio: async () => {
    throw new Error("Desktop dictation is only available in the desktop app.");
  },
};

export function getDesktopDictationAdapter(): DesktopDictationAdapter {
  if (typeof window === "undefined") return unsupportedAdapter;

  const processAudio = window.electronAPI?.dictationProcessAudio;
  if (!processAudio) return unsupportedAdapter;

  return {
    isAvailable: () => true,
    processAudio,
  };
}
