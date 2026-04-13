/* eslint-disable @typescript-eslint/no-require-imports */
const { shell, systemPreferences } = require("electron");
const {
  getNativePermissionState,
  requestNativePermissions,
} = require("./native-helper.cjs");

const MICROPHONE_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";
const ACCESSIBILITY_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
const INPUT_MONITORING_SETTINGS_URL =
  "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent";

async function openSettingsPane(targetUrl) {
  try {
    await shell.openExternal(targetUrl);
  } catch {
    // Ignore failures and still return the current permission state.
  }
}

async function getPermissionState() {
  const nativePermissions = await getNativePermissionState();
  let microphone = "unknown";

  try {
    const nextStatus = systemPreferences.getMediaAccessStatus("microphone");
    microphone =
      nextStatus === "granted" ||
      nextStatus === "denied" ||
      nextStatus === "restricted" ||
      nextStatus === "not-determined"
        ? nextStatus
        : "unknown";
  } catch {
    microphone = "unknown";
  }

  return {
    microphone,
    accessibility: nativePermissions.accessibility,
    inputMonitoring: nativePermissions.inputMonitoring,
    postEvents: nativePermissions.postEvents,
  };
}

async function waitForMicrophoneAccess(attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    const state = await getPermissionState();
    if (state.microphone === "granted") return state;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return getPermissionState();
}

async function requestMicrophoneAccess() {
  let granted = false;

  try {
    granted = await systemPreferences.askForMediaAccess("microphone");
  } catch {
    // Electron can throw if the permission cannot be requested from the current context.
  }

  if (granted) {
    return waitForMicrophoneAccess();
  }

  const nextState = await getPermissionState();
  if (nextState.microphone !== "granted") {
    await openSettingsPane(MICROPHONE_SETTINGS_URL);
    return waitForMicrophoneAccess();
  }

  return nextState;
}

async function waitForSystemAccess(attempts = 10) {
  for (let i = 0; i < attempts; i += 1) {
    const state = await getPermissionState();
    if (state.accessibility && state.inputMonitoring && state.postEvents) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return getPermissionState();
}

async function requestSystemAccess() {
  await requestNativePermissions();
  const nextState = await getPermissionState();

  if (!nextState.accessibility || !nextState.postEvents) {
    await openSettingsPane(ACCESSIBILITY_SETTINGS_URL);
  } else if (!nextState.inputMonitoring) {
    await openSettingsPane(INPUT_MONITORING_SETTINGS_URL);
  }

  return waitForSystemAccess();
}

module.exports = {
  getPermissionState,
  requestMicrophoneAccess,
  requestSystemAccess,
};
