/* eslint-disable @typescript-eslint/no-require-imports */
const { app } = require("electron");

function applyLaunchAtLogin(openAtLogin) {
  if (process.platform === "darwin" && !app.isPackaged) {
    return;
  }

  try {
    app.setLoginItemSettings({ openAtLogin });
  } catch {
    // Ignore startup registration failures and keep the app usable.
  }
}

module.exports = {
  applyLaunchAtLogin,
};
