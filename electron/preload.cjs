"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke("workspace:open-folder"),
  readWorkspaceFile: (folderPath) =>
    ipcRenderer.invoke("workspace:read", folderPath),
  writeWorkspaceFile: (folderPath, contents) =>
    ipcRenderer.invoke("workspace:write", folderPath, contents),
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
