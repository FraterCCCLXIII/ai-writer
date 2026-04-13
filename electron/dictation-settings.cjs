/* eslint-disable @typescript-eslint/no-require-imports */
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const SETTINGS_FILE = "dictation-settings.json";

function createDefaultSettings() {
  return {
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
}

function getSettingsPath() {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

async function loadSettings() {
  try {
    const raw = await fs.promises.readFile(getSettingsPath(), "utf8");
    return {
      ...createDefaultSettings(),
      ...JSON.parse(raw),
    };
  } catch {
    const defaults = createDefaultSettings();
    await saveSettings(defaults);
    return defaults;
  }
}

async function saveSettings(settings) {
  const targetPath = getSettingsPath();
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(
    targetPath,
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf8",
  );
}

async function updateSettings(current, updates) {
  const nextSettings = {
    ...current,
    ...updates,
  };
  await saveSettings(nextSettings);
  return nextSettings;
}

module.exports = {
  createDefaultSettings,
  loadSettings,
  saveSettings,
  updateSettings,
};
