export function isElectronApp(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI);
}
