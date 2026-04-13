/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

if (
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS !== "0" &&
  process.env.NODE_ENV !== "production"
) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";
}

const { app, BrowserWindow, shell, ipcMain, dialog, session } = require("electron");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");
const { processDictationAudio } = require("./dictation.cjs");
const {
  ensureOllamaRunning,
  getOllamaStatus,
  pullOllamaModel,
} = require("./dictation-ollama.cjs");
const { loadSettings, updateSettings } = require("./dictation-settings.cjs");
const { applyLaunchAtLogin } = require("./login-item.cjs");
const {
  ensureNativeHelper,
  getFocusInfo,
} = require("./native-helper.cjs");
const {
  getPermissionState,
  requestMicrophoneAccess,
  requestSystemAccess,
} = require("./permissions.cjs");

const packageName = require(path.join(__dirname, "..", "package.json")).name;

const isDev =
  process.env.ELECTRON_DEV === "1" ||
  process.env.NODE_ENV === "development" ||
  !app.isPackaged;

const DEV_PORT = process.env.PORT || "3000";
const DEV_URL =
  process.env.ELECTRON_DEV_URL || `http://127.0.0.1:${DEV_PORT}`;

let mainWindow = null;
let overlayWindow = null;
let nextChild = null;
let helperReady = false;
let dictationSettings = null;
let dictationStatus = {
  phase: "idle",
  title: "Ready",
  detail: "Hold Fn to dictate. Release Fn to paste.",
};
let appUrl = null;
let dictationStatusResetTimer = null;

/** Hidden directory inside workspace folders for app config. */
const WORKSPACE_CONFIG_DIR = ".aiwriter";
const WORKSPACE_CONFIG_FILE = "workspace.json";

/** @deprecated Legacy workspace file — kept for migration detection. */
const LEGACY_WORKSPACE_FILENAME = "manuscript.workspace.json";

function getStandaloneDir() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "standalone")
    : path.join(__dirname, "..", ".next", "standalone");
  return path.join(base, packageName);
}

function pickPort() {
  return new Promise((resolve, reject) => {
    const net = require("net");
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

function waitForServer(url, timeoutMs = 90_000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Next.js server did not become ready in time."));
        return;
      }
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
        } else {
          setTimeout(tryOnce, 400);
        }
      });
      req.on("error", () => setTimeout(tryOnce, 400));
    };
    tryOnce();
  });
}

function startStandaloneServer(port) {
  const dir = getStandaloneDir();
  const serverJs = path.join(dir, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(
      `Missing standalone server at ${serverJs}. Run: npm run build && node scripts/prepare-standalone-electron.cjs`,
    );
  }

  const nodeBin = process.env.NODE_BINARY || "node";
  nextChild = spawn(nodeBin, [serverJs], {
    cwd: dir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  nextChild.stderr?.on("data", (d) => {
    if (process.env.ELECTRON_DEBUG_SERVER) console.error(String(d));
  });
  nextChild.stdout?.on("data", (d) => {
    if (process.env.ELECTRON_DEBUG_SERVER) console.log(String(d));
  });

  nextChild.on("error", (err) => {
    console.error("Failed to start Next server:", err);
  });
}

async function ensureAppUrl() {
  if (appUrl) return appUrl;
  if (isDev) {
    appUrl = DEV_URL;
    return appUrl;
  }

  const port = await pickPort();
  startStandaloneServer(port);
  appUrl = `http://127.0.0.1:${port}`;
  await waitForServer(appUrl);
  return appUrl;
}

function appUrlWithHash(hash = "") {
  if (!appUrl) {
    throw new Error("App URL is not ready.");
  }
  return hash ? `${appUrl}#${hash}` : appUrl;
}

function bindWindowMaximizeEvents(win) {
  const send = (maximized) => {
    win.webContents.send("window:maximized-changed", maximized);
  };
  win.on("maximize", () => send(true));
  win.on("unmaximize", () => send(false));
}

async function createWindowAsync() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 600,
    title: "Manuscript",
    frame: false,
    ...(process.platform === "darwin" ? { roundedCorners: true } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: !isDev,
    },
    show: isDev,
  });

  bindWindowMaximizeEvents(mainWindow);

  if (!isDev) {
    mainWindow.once("ready-to-show", () => {
      mainWindow?.show();
    });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.webContents.on("did-fail-load", (_event, code, desc, url) => {
      console.error("[electron] did-fail-load", { code, desc, url });
    });
    await ensureAppUrl();
    await mainWindow.loadURL(appUrlWithHash());
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    await ensureAppUrl();
    await mainWindow.loadURL(appUrlWithHash());
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

async function createOverlayWindowAsync() {
  overlayWindow = new BrowserWindow({
    width: 320,
    height: 68,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: !isDev,
    },
  });

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, "floating");
  overlayWindow.setIgnoreMouseEvents(true);

  const { screen } = require("electron");
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const workArea = display.workArea;
  const width = 320;
  const height = 68;
  const margin = 24;

  overlayWindow.setBounds({
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + workArea.height - height - margin,
    width,
    height,
  });

  await ensureAppUrl();
  await overlayWindow.loadURL(appUrlWithHash("overlay"));

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

async function ensureOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }
  await createOverlayWindowAsync();
  return overlayWindow;
}

async function showOverlay() {
  const win = await ensureOverlayWindow();
  if (!win || win.isDestroyed()) return;
  win.showInactive();
}

function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

function broadcast(channel, payload) {
  for (const win of [mainWindow, overlayWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

function setDictationStatus(nextStatus) {
  if (dictationStatusResetTimer) {
    clearTimeout(dictationStatusResetTimer);
    dictationStatusResetTimer = null;
  }
  dictationStatus = nextStatus;
  broadcast("dictation:status", nextStatus);
  if (dictationSettings?.showOverlay || nextStatus.phase !== "idle") {
    void showOverlay();
  } else {
    hideOverlay();
  }
  if (nextStatus.phase === "done" || nextStatus.phase === "error") {
    dictationStatusResetTimer = setTimeout(() => {
      dictationStatusResetTimer = null;
      setDictationStatus({
        phase: "idle",
        title: "Ready",
        detail: "Hold Fn to dictate. Release Fn to paste.",
      });
    }, 1500);
  }
}

function hasEntries(dirPath) {
  try {
    return fs.readdirSync(dirPath).length > 0;
  } catch {
    return false;
  }
}

async function buildDictationBootstrapState() {
  if (!dictationSettings) {
    dictationSettings = await loadSettings();
  }

  const permissions = await getPermissionState();
  if (
    helperReady &&
    permissions.accessibility &&
    permissions.inputMonitoring &&
    permissions.postEvents
  ) {
    await ensureHotkeyListener();
  }
  const ollamaReachable = await ensureOllamaRunning(dictationSettings.ollamaBaseUrl);
  const ollamaModels = ollamaReachable
    ? await getOllamaStatus(dictationSettings.ollamaBaseUrl).then((s) => s.models)
    : [];
  const { getDefaultModelCacheDir } = require("./dictation-transcription.cjs");
  const speechModelReady = hasEntries(
    getDefaultModelCacheDir(app.getPath("userData")),
  );

  return {
    settings: dictationSettings,
    permissions,
    ollamaReachable,
    ollamaModels,
    recommendedModelInstalled: ollamaModels.some(
      (model) => model.name === dictationSettings.textModel,
    ),
    speechModelReady,
    helperReady,
    status: dictationStatus,
  };
}

async function ensureHotkeyListener() {
  if (!helperReady || isFnListenerRunning()) {
    return;
  }

  const permissions = await getPermissionState();
  if (
    !permissions.accessibility ||
    !permissions.inputMonitoring ||
    !permissions.postEvents
  ) {
    return;
  }

  await startFnListener(
    (event) => {
      broadcast("dictation:hotkey", event);
      if (event.type === "down") {
        void showOverlay();
      }
    },
    (message) => {
      setDictationStatus({
        phase: "error",
        title: "Fn key unavailable",
        detail: message,
      });
    },
  );
}

// ---------------------------------------------------------------------------
// Window IPC
// ---------------------------------------------------------------------------

ipcMain.handle("window:minimize", () => {
  const w = BrowserWindow.getFocusedWindow() ?? mainWindow;
  w?.minimize();
});

ipcMain.handle("window:toggle-maximize", () => {
  const w = BrowserWindow.getFocusedWindow() ?? mainWindow;
  if (!w) return;
  if (w.isMaximized()) w.unmaximize();
  else w.maximize();
});

ipcMain.handle("window:close", () => {
  const w = BrowserWindow.getFocusedWindow() ?? mainWindow;
  w?.close();
});

ipcMain.handle("window:is-maximized", () => {
  const w = BrowserWindow.getFocusedWindow() ?? mainWindow;
  return w?.isMaximized() ?? false;
});

// ---------------------------------------------------------------------------
// Folder picker
// ---------------------------------------------------------------------------

ipcMain.handle("workspace:open-folder", async () => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const result = await dialog.showOpenDialog(win ?? undefined, {
    properties: ["openDirectory", "createDirectory"],
    title: "Open project folder",
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

// ---------------------------------------------------------------------------
// Legacy workspace file support (v1 migration)
// ---------------------------------------------------------------------------

function legacyWorkspacePath(folderPath) {
  return path.join(folderPath, LEGACY_WORKSPACE_FILENAME);
}

ipcMain.handle("workspace:read", async (_event, folderPath) => {
  if (typeof folderPath !== "string" || !path.isAbsolute(folderPath)) {
    throw new Error("Invalid folder path");
  }
  const fp = legacyWorkspacePath(folderPath);
  try {
    const data = await fsp.readFile(fp, "utf8");
    return { ok: true, data };
  } catch (e) {
    if (e && e.code === "ENOENT") {
      return { ok: false, missing: true };
    }
    throw e;
  }
});

ipcMain.handle("workspace:write", async (_event, folderPath, contents) => {
  if (typeof folderPath !== "string" || !path.isAbsolute(folderPath)) {
    throw new Error("Invalid folder path");
  }
  if (typeof contents !== "string") {
    throw new Error("Invalid workspace contents");
  }
  const fp = legacyWorkspacePath(folderPath);
  const dir = path.dirname(fp);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(folderPath, `.${LEGACY_WORKSPACE_FILENAME}.tmp`);
  await fsp.writeFile(tmp, contents, "utf8");
  await fsp.rename(tmp, fp);
});

// ---------------------------------------------------------------------------
// New filesystem IPC — generic file operations for workspace v2
// ---------------------------------------------------------------------------

function validateAbsolute(p) {
  if (typeof p !== "string" || !path.isAbsolute(p)) {
    throw new Error("Expected an absolute path");
  }
}

ipcMain.handle("fs:read-dir", async (_event, dirPath) => {
  validateAbsolute(dirPath);
  const entries = await fsp.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((e) => !e.name.startsWith("."))
    .map((e) => ({
      name: e.name,
      isDirectory: e.isDirectory(),
    }));
});

ipcMain.handle("fs:read-text-file", async (_event, filePath) => {
  validateAbsolute(filePath);
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
});

ipcMain.handle("fs:write-text-file", async (_event, filePath, contents) => {
  validateAbsolute(filePath);
  if (typeof contents !== "string") throw new Error("Contents must be a string");
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  await fsp.writeFile(tmp, contents, "utf8");
  await fsp.rename(tmp, filePath);
});

ipcMain.handle("fs:write-binary-file", async (_event, filePath, buffer) => {
  validateAbsolute(filePath);
  if (!(buffer instanceof Buffer || buffer instanceof Uint8Array))
    throw new Error("Buffer must be a Uint8Array or Buffer");
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + ".tmp";
  await fsp.writeFile(tmp, Buffer.from(buffer));
  await fsp.rename(tmp, filePath);
});

ipcMain.handle("fs:create-dir", async (_event, dirPath) => {
  validateAbsolute(dirPath);
  await fsp.mkdir(dirPath, { recursive: true });
});

ipcMain.handle("fs:delete-path", async (_event, targetPath) => {
  validateAbsolute(targetPath);
  await fsp.rm(targetPath, { recursive: true, force: true });
});

ipcMain.handle("fs:rename-path", async (_event, oldPath, newPath) => {
  validateAbsolute(oldPath);
  validateAbsolute(newPath);
  await fsp.rename(oldPath, newPath);
});

ipcMain.handle("fs:path-exists", async (_event, targetPath) => {
  validateAbsolute(targetPath);
  try {
    await fsp.access(targetPath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("fs:read-workspace-config", async (_event, folderPath) => {
  validateAbsolute(folderPath);
  const configPath = path.join(folderPath, WORKSPACE_CONFIG_DIR, WORKSPACE_CONFIG_FILE);
  try {
    return await fsp.readFile(configPath, "utf8");
  } catch (e) {
    if (e && e.code === "ENOENT") return null;
    throw e;
  }
});

ipcMain.handle("fs:write-workspace-config", async (_event, folderPath, contents) => {
  validateAbsolute(folderPath);
  if (typeof contents !== "string") throw new Error("Contents must be a string");
  const configDir = path.join(folderPath, WORKSPACE_CONFIG_DIR);
  await fsp.mkdir(configDir, { recursive: true });
  const configPath = path.join(configDir, WORKSPACE_CONFIG_FILE);
  const tmp = configPath + ".tmp";
  await fsp.writeFile(tmp, contents, "utf8");
  await fsp.rename(tmp, configPath);
});

ipcMain.handle("fs:has-legacy-workspace", async (_event, folderPath) => {
  validateAbsolute(folderPath);
  try {
    await fsp.access(legacyWorkspacePath(folderPath));
    return true;
  } catch {
    return false;
  }
});

// ---------------------------------------------------------------------------
// Dictation IPC
// ---------------------------------------------------------------------------

function validateDictationRequest(request) {
  if (!request || typeof request !== "object") {
    throw new Error("Invalid dictation request");
  }

  const { wavBase64, settings } = request;
  if (typeof wavBase64 !== "string" || !wavBase64.trim()) {
    throw new Error("Missing dictation audio payload");
  }

  if (!settings || typeof settings !== "object") {
    throw new Error("Missing dictation settings");
  }

  if (typeof settings.whisperModel !== "string" || !settings.whisperModel.trim()) {
    throw new Error("Missing Whisper model");
  }

  if (typeof settings.ollamaBaseUrl !== "string" || !settings.ollamaBaseUrl.trim()) {
    throw new Error("Missing Ollama base URL");
  }

  if (
    settings.styleMode !== "conversation" &&
    settings.styleMode !== "vibe-coding"
  ) {
    throw new Error("Invalid dictation style mode");
  }

  if (
    settings.enhancementLevel !== "none" &&
    settings.enhancementLevel !== "soft" &&
    settings.enhancementLevel !== "medium" &&
    settings.enhancementLevel !== "high"
  ) {
    throw new Error("Invalid dictation enhancement level");
  }

  return {
    wavBase64,
    settings: {
      enabled: Boolean(settings.enabled),
      whisperModel: settings.whisperModel.trim(),
      ollamaBaseUrl: settings.ollamaBaseUrl.trim(),
      textModel:
        typeof settings.textModel === "string" ? settings.textModel.trim() : "",
      styleMode: settings.styleMode,
      enhancementLevel: settings.enhancementLevel,
      autoPaste: Boolean(settings.autoPaste),
      showOverlay: Boolean(settings.showOverlay),
      launchAtLogin: Boolean(settings.launchAtLogin),
      setupComplete: Boolean(settings.setupComplete),
    },
    targetFocus: request.targetFocus,
  };
}

ipcMain.handle("dictation:process-audio", async (_event, request) => {
  const input = validateDictationRequest(request);
  return processDictationAudio({
    ...input,
    userDataPath: app.getPath("userData"),
    setStatus: setDictationStatus,
  });
});

ipcMain.handle("dictation:get-ollama-status", async (_event, baseUrl) => {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new Error("Missing Ollama base URL");
  }
  return getOllamaStatus(baseUrl.trim());
});

ipcMain.handle("dictation:launch-ollama", async (_event, baseUrl) => {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new Error("Missing Ollama base URL");
  }
  await ensureOllamaRunning(baseUrl.trim());
  return getOllamaStatus(baseUrl.trim());
});

ipcMain.handle("dictation:pull-ollama-model", async (_event, baseUrl, modelName) => {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new Error("Missing Ollama base URL");
  }
  if (typeof modelName !== "string" || !modelName.trim()) {
    throw new Error("Missing Ollama model name");
  }

  const normalizedBaseUrl = baseUrl.trim();
  const reachable = await ensureOllamaRunning(normalizedBaseUrl);
  if (!reachable) {
    throw new Error(
      `Ollama is not running at ${normalizedBaseUrl}. Install or start Ollama, then try again.`,
    );
  }

  await pullOllamaModel(normalizedBaseUrl, modelName.trim());
  return getOllamaStatus(normalizedBaseUrl);
});

ipcMain.handle("dictation:bootstrap", async () => {
  return buildDictationBootstrapState();
});

ipcMain.handle("dictation:request-microphone-access", async () => {
  await requestMicrophoneAccess();
  return buildDictationBootstrapState();
});

ipcMain.handle("dictation:request-system-access", async () => {
  await requestSystemAccess();
  helperReady = await ensureNativeHelper();
  return buildDictationBootstrapState();
});

ipcMain.handle("dictation:capture-target", async () => {
  return getFocusInfo();
});

ipcMain.handle("dictation:update-settings", async (_event, nextSettings) => {
  if (!nextSettings || typeof nextSettings !== "object") {
    throw new Error("Invalid dictation settings");
  }

  dictationSettings = await updateSettings(
    dictationSettings || (await loadSettings()),
    nextSettings,
  );
  applyLaunchAtLogin(Boolean(dictationSettings.launchAtLogin));
  return buildDictationBootstrapState();
});

ipcMain.handle("dictation:prepare-speech-model", async () => {
  const settings = dictationSettings || (await loadSettings());
  const {
    getDefaultModelCacheDir,
    prepareTranscriber,
  } = require("./dictation-transcription.cjs");

  setDictationStatus({
    phase: "transcribing",
    title: "Preparing speech model",
    detail: "Downloading and warming the local Whisper model.",
  });

  await prepareTranscriber({
    whisperModel: settings.whisperModel,
    modelCacheDir: getDefaultModelCacheDir(app.getPath("userData")),
  });

  setDictationStatus({
    phase: "idle",
    title: "Ready",
    detail: "Hold Fn to dictate. Release Fn to paste.",
  });

  return buildDictationBootstrapState();
});

ipcMain.on("dictation:push-status", (_event, nextStatus) => {
  if (!nextStatus || typeof nextStatus !== "object") return;
  setDictationStatus(nextStatus);
});

ipcMain.handle("system:open-external", async (_event, targetUrl) => {
  if (typeof targetUrl !== "string" || !targetUrl.trim()) {
    throw new Error("Missing external URL");
  }
  await shell.openExternal(targetUrl);
});

ipcMain.handle("system:show-main-window", async () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  if (isDev) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const u = details.url;
      if (
        !u.startsWith("http://127.0.0.1") &&
        !u.startsWith("http://localhost")
      ) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      const responseHeaders = { ...details.responseHeaders };
      for (const key of Object.keys(responseHeaders)) {
        const lower = key.toLowerCase();
        if (
          lower === "content-security-policy" ||
          lower === "content-security-policy-report-only"
        ) {
          delete responseHeaders[key];
        }
      }
      callback({ responseHeaders });
    });
  }

  void (async () => {
    dictationSettings = await loadSettings();
    applyLaunchAtLogin(Boolean(dictationSettings.launchAtLogin));
    helperReady = await ensureNativeHelper();
    await ensureHotkeyListener();
  })();

  void createWindowAsync();
  void ensureOverlayWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindowAsync();
  });
});

app.on("window-all-closed", () => {
  stopFnListener();
  if (nextChild) {
    try {
      nextChild.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    nextChild = null;
  }
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  stopFnListener();
  if (nextChild) {
    try {
      nextChild.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
});
