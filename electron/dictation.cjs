/* eslint-disable @typescript-eslint/no-require-imports */
const { clipboard } = require("electron");
const { getEnhancementPrompt } = require("./dictation-prompts.cjs");
const {
  ensureOllamaRunning,
  rewriteWithOllama,
} = require("./dictation-ollama.cjs");
const { getFocusInfo, triggerPaste } = require("./native-helper.cjs");
const {
  getDefaultModelCacheDir,
  transcribeRecording,
} = require("./dictation-transcription.cjs");

async function processDictationAudio({
  wavBase64,
  settings,
  userDataPath,
  targetFocus,
  setStatus,
}) {
  setStatus?.({
    phase: "transcribing",
    title: "Transcribing",
    detail: "Whisper is turning your voice into text.",
  });

  const rawText = await transcribeRecording({
    wavBase64,
    whisperModel: settings.whisperModel,
    modelCacheDir: getDefaultModelCacheDir(userDataPath),
  });

  if (!rawText) {
    throw new Error("No speech was detected in the recording.");
  }

  const textModel = settings.textModel.trim();
  if (!textModel) {
    setStatus?.({
      phase: "done",
      title: "Copied",
      detail: "The raw transcription is on the clipboard.",
      preview: rawText,
      rawText,
    });
    return {
      rawText,
      finalText: rawText,
      usedRewriteFallback: false,
      pasted: false,
    };
  }

  try {
    await ensureOllamaRunning(settings.ollamaBaseUrl);
    setStatus?.({
      phase: "rewriting",
      title: "Polishing",
      detail: `${textModel} is polishing the transcription.`,
      preview: rawText,
      rawText,
    });
    const finalText = await rewriteWithOllama(
      settings.ollamaBaseUrl,
      textModel,
      getEnhancementPrompt(settings.styleMode, settings.enhancementLevel),
      rawText,
    );

    const result = {
      rawText,
      finalText,
      usedRewriteFallback: false,
      pasted: false,
    };

    clipboard.writeText(finalText);
    if (settings.autoPaste) {
      setStatus?.({
        phase: "pasting",
        title: "Pasting",
        detail: "Sending the polished text to the active app.",
        preview: finalText,
        rawText,
      });
      const focusInfo = targetFocus ?? (await getFocusInfo().catch(() => undefined));
      result.pasted = await triggerPaste(focusInfo).catch(() => false);
      result.focusInfo = focusInfo;
    }

    setStatus?.({
      phase: "done",
      title: result.pasted ? "Pasted" : "Copied",
      detail: result.pasted
        ? "The refined text was pasted into the active app."
        : "The refined text is on the clipboard.",
      preview: finalText,
      rawText,
    });
    return result;
  } catch {
    const result = {
      rawText,
      finalText: rawText,
      usedRewriteFallback: true,
      pasted: false,
    };

    clipboard.writeText(rawText);
    if (settings.autoPaste) {
      setStatus?.({
        phase: "pasting",
        title: "Pasting",
        detail: "Using the raw transcription for paste.",
        preview: rawText,
        rawText,
      });
      const focusInfo = targetFocus ?? (await getFocusInfo().catch(() => undefined));
      result.pasted = await triggerPaste(focusInfo).catch(() => false);
      result.focusInfo = focusInfo;
    }

    setStatus?.({
      phase: "done",
      title: result.pasted ? "Pasted" : "Copied",
      detail: result.pasted
        ? "The raw transcription was pasted because the rewrite model was unavailable."
        : "The raw transcription is on the clipboard because the rewrite model was unavailable.",
      preview: rawText,
      rawText,
    });
    return result;
  }
}

module.exports = {
  processDictationAudio,
};
