/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,

  // Legacy workspace support (v1)
  openFolder: () => ipcRenderer.invoke("workspace:open-folder"),
  readWorkspaceFile: (folderPath) =>
    ipcRenderer.invoke("workspace:read", folderPath),
  writeWorkspaceFile: (folderPath, contents) =>
    ipcRenderer.invoke("workspace:write", folderPath, contents),

  // Filesystem operations (v2)
  readDir: (dirPath) => ipcRenderer.invoke("fs:read-dir", dirPath),
  readTextFile: (filePath) => ipcRenderer.invoke("fs:read-text-file", filePath),
  writeTextFile: (filePath, contents) =>
    ipcRenderer.invoke("fs:write-text-file", filePath, contents),
  writeBinaryFile: (filePath, buffer) =>
    ipcRenderer.invoke("fs:write-binary-file", filePath, buffer),
  createDir: (dirPath) => ipcRenderer.invoke("fs:create-dir", dirPath),
  deletePath: (targetPath) => ipcRenderer.invoke("fs:delete-path", targetPath),
  renamePath: (oldPath, newPath) =>
    ipcRenderer.invoke("fs:rename-path", oldPath, newPath),
  pathExists: (targetPath) => ipcRenderer.invoke("fs:path-exists", targetPath),
  readWorkspaceConfig: (folderPath) =>
    ipcRenderer.invoke("fs:read-workspace-config", folderPath),
  writeWorkspaceConfig: (folderPath, contents) =>
    ipcRenderer.invoke("fs:write-workspace-config", folderPath, contents),
  hasLegacyWorkspace: (folderPath) =>
    ipcRenderer.invoke("fs:has-legacy-workspace", folderPath),

  // Dictation
  dictationProcessAudio: (request) =>
    ipcRenderer.invoke("dictation:process-audio", request),
  dictationGetOllamaStatus: (baseUrl) =>
    ipcRenderer.invoke("dictation:get-ollama-status", baseUrl),
  dictationLaunchOllama: (baseUrl) =>
    ipcRenderer.invoke("dictation:launch-ollama", baseUrl),
  dictationPullOllamaModel: (baseUrl, modelName) =>
    ipcRenderer.invoke("dictation:pull-ollama-model", baseUrl, modelName),
  dictationBootstrap: () => ipcRenderer.invoke("dictation:bootstrap"),
  dictationRequestMicrophoneAccess: () =>
    ipcRenderer.invoke("dictation:request-microphone-access"),
  dictationRequestSystemAccess: () =>
    ipcRenderer.invoke("dictation:request-system-access"),
  dictationCaptureTarget: () => ipcRenderer.invoke("dictation:capture-target"),
  dictationUpdateSettings: (settings) =>
    ipcRenderer.invoke("dictation:update-settings", settings),
  dictationPrepareSpeechModel: () =>
    ipcRenderer.invoke("dictation:prepare-speech-model"),
  dictationPushStatus: (status) => ipcRenderer.send("dictation:push-status", status),
  dictationSubscribeStatus: (callback) => {
    const channel = "dictation:status";
    const handler = (_event, status) => {
      callback(status);
    };
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
  dictationSubscribeHotkey: (callback) => {
    const channel = "dictation:hotkey";
    const handler = (_event, event) => {
      callback(event);
    };
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
  openExternal: (targetUrl) => ipcRenderer.invoke("system:open-external", targetUrl),
  showMainWindow: () => ipcRenderer.invoke("system:show-main-window"),

  // Window controls
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  windowClose: () => ipcRenderer.invoke("window:close"),
  windowIsMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  subscribeMaximized: (callback) => {
    const channel = "window:maximized-changed";
    const handler = (_event, maximized) => {
      callback(!!maximized);
    };
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  },
});
