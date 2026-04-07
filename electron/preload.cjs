"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  openFolder: () => ipcRenderer.invoke("workspace:open-folder"),
  readWorkspaceFile: (folderPath) =>
    ipcRenderer.invoke("workspace:read", folderPath),
  writeWorkspaceFile: (folderPath, contents) =>
    ipcRenderer.invoke("workspace:write", folderPath, contents),
});
