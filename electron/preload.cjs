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
