"use strict";

/**
 * Next.js dev (localhost + HMR) uses relaxed `webSecurity` while `isDev` is true; Electron
 * otherwise prints noisy renderer security warnings. Suppress them when not in production.
 * Set `ELECTRON_DISABLE_SECURITY_WARNINGS=0` to see warnings anyway.
 * Must run before `require("electron")`.
 */
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

const packageName = require(path.join(__dirname, "..", "package.json")).name;

/** Dev: Next runs via `next dev` (see npm script). Prod: bundled standalone server. */
const isDev =
  process.env.ELECTRON_DEV === "1" ||
  process.env.NODE_ENV === "development" ||
  !app.isPackaged;

/** Same host as `wait-on` in `npm run electron` so the window loads the server we waited for. */
const DEV_URL =
  process.env.ELECTRON_DEV_URL || "http://127.0.0.1:3000";

let mainWindow = null;
let nextChild = null;

/** Workspace file at the root of an opened project folder (VS Code–style local project). */
const WORKSPACE_FILENAME = "manuscript.workspace.json";

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
      /**
       * Must match `isDev` for any load of `next dev`: unpackaged Electron has
       * `isDev === true` even without `ELECTRON_DEV=1`. If webSecurity stayed on here,
       * Next’s dev scripts/HMR are blocked and the window stays blank.
       * Packaged production uses `isDev === false` → webSecurity stays enabled.
       */
      webSecurity: !isDev,
    },
    // In dev, show immediately so the window is never invisible if load stalls or HMR is slow.
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
    await mainWindow.loadURL(DEV_URL);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    const port = await pickPort();
    startStandaloneServer(port);
    const url = `http://127.0.0.1:${port}`;
    await waitForServer(url);
    await mainWindow.loadURL(url);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function workspaceFilePath(folderPath) {
  return path.join(folderPath, WORKSPACE_FILENAME);
}

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

ipcMain.handle("workspace:open-folder", async () => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
  const result = await dialog.showOpenDialog(win ?? undefined, {
    properties: ["openDirectory", "createDirectory"],
    title: "Open project folder",
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});

ipcMain.handle("workspace:read", async (_event, folderPath) => {
  if (typeof folderPath !== "string" || !path.isAbsolute(folderPath)) {
    throw new Error("Invalid folder path");
  }
  const fp = workspaceFilePath(folderPath);
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
  const fp = workspaceFilePath(folderPath);
  const dir = path.dirname(fp);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = path.join(folderPath, `.${WORKSPACE_FILENAME}.tmp`);
  await fsp.writeFile(tmp, contents, "utf8");
  await fsp.rename(tmp, fp);
});

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

  void createWindowAsync();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindowAsync();
  });
});

app.on("window-all-closed", () => {
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
  if (nextChild) {
    try {
      nextChild.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
});
