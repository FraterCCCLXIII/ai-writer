/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const projectRoot = path.join(__dirname, "..");
const helperSourcePath = path.join(projectRoot, "swift", "OpenWhispHelper.swift");

let listenerProcess = null;

function getHelperBinaryPath() {
  return require("electron").app.isPackaged
    ? path.join(process.resourcesPath, "native", "openwhisp-helper")
    : path.join(projectRoot, "build", "native", "openwhisp-helper");
}

function pathExists(targetPath) {
  try {
    fs.accessSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function compileHelper() {
  const electron = require("electron");
  if (electron.app.isPackaged) {
    return Promise.resolve(pathExists(getHelperBinaryPath()));
  }

  const outputPath = getHelperBinaryPath();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  return new Promise((resolve) => {
    const child = spawn("swiftc", [helperSourcePath, "-o", outputPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

async function ensureNativeHelper() {
  if (pathExists(getHelperBinaryPath())) {
    return true;
  }

  if (!pathExists(helperSourcePath)) {
    return false;
  }

  return compileHelper();
}

async function runHelperJson(args) {
  const helperReady = await ensureNativeHelper();
  if (!helperReady) {
    throw new Error("The native Manuscript helper is not available.");
  }

  return new Promise((resolve, reject) => {
    const child = spawn(getHelperBinaryPath(), args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || stdout.trim() || "The helper exited unexpectedly.",
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function getNativePermissionState() {
  try {
    return await runHelperJson(["permissions", "status"]);
  } catch {
    return {
      accessibility: false,
      inputMonitoring: false,
      postEvents: false,
      microphone: "unknown",
    };
  }
}

async function requestNativePermissions() {
  try {
    return await runHelperJson(["permissions", "request"]);
  } catch {
    return getNativePermissionState();
  }
}

async function getFocusInfo() {
  return runHelperJson(["focus"]);
}

async function triggerPaste(targetFocus) {
  const args = ["paste"];

  if (
    targetFocus?.bundleIdentifier ||
    typeof targetFocus?.processIdentifier === "number"
  ) {
    args.push(targetFocus.bundleIdentifier ?? "");
    args.push(String(targetFocus.processIdentifier ?? ""));
  }

  const result = await runHelperJson(args);
  return result.ok;
}

async function startFnListener(onEvent, onError) {
  const helperReady = await ensureNativeHelper();
  if (!helperReady || listenerProcess) {
    return helperReady;
  }

  const child = spawn(getHelperBinaryPath(), ["listen"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  listenerProcess = child;
  const stdoutInterface = readline.createInterface({ input: child.stdout });

  stdoutInterface.on("line", (line) => {
    if (!line.trim()) return;

    try {
      const message = JSON.parse(line);

      if (message.type === "fnDown") {
        onEvent({ type: "down" });
      }

      if (message.type === "fnUp") {
        onEvent({ type: "up" });
      }

      if (message.type === "error") {
        onError?.(message.message ?? "The native helper could not watch the Fn key.");
      }
    } catch {
      // Ignore malformed lines from the helper.
    }
  });

  child.stderr.on("data", (chunk) => {
    const message = chunk.toString().trim();
    if (message) {
      onError?.(message);
    }
  });

  child.on("close", () => {
    stdoutInterface.close();
    listenerProcess = null;
  });

  return true;
}

function isFnListenerRunning() {
  return listenerProcess !== null;
}

function stopFnListener() {
  listenerProcess?.kill();
  listenerProcess = null;
}

module.exports = {
  ensureNativeHelper,
  getFocusInfo,
  getNativePermissionState,
  isFnListenerRunning,
  requestNativePermissions,
  startFnListener,
  stopFnListener,
  triggerPaste,
};
