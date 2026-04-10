"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  WorkspaceConfig,
  WorkspaceNode,
  FolderNode,
  FileNode,
  FsDirEntry,
} from "@/documents/workspace-types";
import {
  WORKSPACE_CONFIG_DIR,
  WORKSPACE_CONFIG_PATH,
  createId,
} from "@/documents/workspace-types";

// ---------------------------------------------------------------------------
// IDB storage (browser)
// ---------------------------------------------------------------------------

const IDB_NAME = "ai-writer-v2";
const IDB_VERSION = 2;
const CONFIG_STORE = "configs";
const FILES_STORE = "files";
const INDEX_STORE = "index";
const HANDLES_STORE = "handles";

interface WorkspaceFsDB extends DBSchema {
  [CONFIG_STORE]: { key: string; value: WorkspaceConfig };
  [FILES_STORE]: {
    key: string;
    value: { workspaceId: string; path: string; content: string | Blob };
  };
  [INDEX_STORE]: { key: string; value: WorkspaceIndexEntry };
  [HANDLES_STORE]: { key: string; value: FileSystemDirectoryHandle };
}

export type WorkspaceIndexEntry = {
  id: string;
  title: string;
  updatedAt: number;
  folderPath?: string;
};

let dbPromise: Promise<IDBPDatabase<WorkspaceFsDB>> | null = null;

function getDb(): Promise<IDBPDatabase<WorkspaceFsDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WorkspaceFsDB>(IDB_NAME, IDB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(CONFIG_STORE)) {
          db.createObjectStore(CONFIG_STORE);
        }
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          db.createObjectStore(FILES_STORE);
        }
        if (!db.objectStoreNames.contains(INDEX_STORE)) {
          db.createObjectStore(INDEX_STORE);
        }
        if (!db.objectStoreNames.contains(HANDLES_STORE)) {
          db.createObjectStore(HANDLES_STORE);
        }
      },
    });
  }
  return dbPromise;
}

function idbFileKey(workspaceId: string, filePath: string): string {
  return `${workspaceId}:${filePath}`;
}

// ---------------------------------------------------------------------------
// File System Access API helpers (Chrome/Edge)
// ---------------------------------------------------------------------------

export function supportsNativeFolderPicker(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export async function storeDirHandle(
  workspaceId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await getDb();
  await db.put(HANDLES_STORE, handle, workspaceId);
}

export async function getDirHandle(
  workspaceId: string,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await getDb();
    return (await db.get(HANDLES_STORE, workspaceId)) ?? null;
  } catch {
    return null;
  }
}

async function verifyPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const opts: FileSystemHandlePermissionDescriptor = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if ((await handle.requestPermission(opts)) === "granted") return true;
  return false;
}

/**
 * Resolve a `FileSystemDirectoryHandle` for a workspace ID.
 * Returns null if no handle is stored or permission was denied.
 */
async function resolveHandle(
  workspaceId: string,
): Promise<FileSystemDirectoryHandle | null> {
  const handle = await getDirHandle(workspaceId);
  if (!handle) return null;
  const ok = await verifyPermission(handle);
  return ok ? handle : null;
}

async function getNestedFileHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  create: boolean,
): Promise<FileSystemFileHandle | null> {
  const parts = relativePath.split("/");
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(parts[i], { create });
    } catch {
      return null;
    }
  }
  try {
    return await dir.getFileHandle(parts[parts.length - 1], { create });
  } catch {
    return null;
  }
}

async function getNestedDirHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle | null> {
  const parts = relativePath.split("/").filter(Boolean);
  let dir = root;
  for (const part of parts) {
    try {
      dir = await dir.getDirectoryHandle(part, { create });
    } catch {
      return null;
    }
  }
  return dir;
}

async function readFileViaHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<string | null> {
  const fh = await getNestedFileHandle(root, relativePath, false);
  if (!fh) return null;
  const file = await fh.getFile();
  return file.text();
}

async function writeFileViaHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  content: string,
): Promise<void> {
  const fh = await getNestedFileHandle(root, relativePath, true);
  if (!fh) throw new Error(`Cannot create file: ${relativePath}`);
  const writable = await fh.createWritable();
  await writable.write(content);
  await writable.close();
}

async function writeBinaryViaHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string,
  data: ArrayBuffer,
): Promise<void> {
  const fh = await getNestedFileHandle(root, relativePath, true);
  if (!fh) throw new Error(`Cannot create file: ${relativePath}`);
  const writable = await fh.createWritable();
  await writable.write(data);
  await writable.close();
}

async function deleteViaHandle(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<void> {
  const parts = relativePath.split("/");
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) {
    try {
      dir = await dir.getDirectoryHandle(parts[i]);
    } catch {
      return;
    }
  }
  try {
    await dir.removeEntry(parts[parts.length - 1], { recursive: true });
  } catch {
    // Entry may not exist
  }
}

async function copyDirViaHandle(
  root: FileSystemDirectoryHandle,
  srcDir: FileSystemDirectoryHandle,
  destPath: string,
): Promise<void> {
  const destDir = await getNestedDirHandle(root, destPath, true);
  if (!destDir) throw new Error(`Cannot create directory: ${destPath}`);
  for await (const [name, handle] of (srcDir as any).entries()) {
    if (handle.kind === "file") {
      const file = await (handle as FileSystemFileHandle).getFile();
      const content = await file.text();
      const fh = await destDir.getFileHandle(name, { create: true });
      const w = await fh.createWritable();
      await w.write(content);
      await w.close();
    } else {
      await copyDirViaHandle(
        root,
        handle as FileSystemDirectoryHandle,
        destPath + "/" + name,
      );
    }
  }
}

async function renameViaHandle(
  root: FileSystemDirectoryHandle,
  oldPath: string,
  newPath: string,
): Promise<void> {
  const content = await readFileViaHandle(root, oldPath);
  if (content !== null) {
    await writeFileViaHandle(root, newPath, content);
    await deleteViaHandle(root, oldPath);
    return;
  }

  const oldDir = await getNestedDirHandle(root, oldPath, false);
  if (!oldDir) return;
  await copyDirViaHandle(root, oldDir, newPath);
  await deleteViaHandle(root, oldPath);
}

/**
 * Scan a directory handle and build a WorkspaceNode tree.
 */
async function scanDirHandleToTree(
  root: FileSystemDirectoryHandle,
  relativePath: string = "",
): Promise<WorkspaceNode[]> {
  const target = relativePath
    ? await getNestedDirHandle(root, relativePath, false)
    : root;
  if (!target) return [];

  const nodes: WorkspaceNode[] = [];
  for await (const [name, entry] of target.entries()) {
    if (name === WORKSPACE_CONFIG_DIR || name.startsWith(".")) continue;

    const childPath = relativePath ? `${relativePath}/${name}` : name;

    if (entry.kind === "directory") {
      const children = await scanDirHandleToTree(root, childPath);
      nodes.push({
        kind: "folder",
        id: createId(),
        name,
        path: childPath,
        children,
        expanded: true,
      } satisfies FolderNode);
    } else {
      nodes.push({
        kind: "file",
        id: createId(),
        name,
        path: childPath,
      } satisfies FileNode);
    }
  }

  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ---------------------------------------------------------------------------
// Unified API
// ---------------------------------------------------------------------------

function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI);
}

/**
 * Read the workspace config.
 * Electron: reads `.aiwriter/workspace.json` from disk.
 * Browser + FSAA handle: reads from real folder via handle.
 * Browser fallback: reads from IDB.
 */
export async function readWorkspaceConfig(
  folderPathOrId: string,
): Promise<WorkspaceConfig | null> {
  if (isElectron() && window.electronAPI) {
    const raw = await window.electronAPI.readWorkspaceConfig(folderPathOrId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WorkspaceConfig;
    } catch {
      return null;
    }
  }

  const handle = await resolveHandle(folderPathOrId);
  if (handle) {
    const raw = await readFileViaHandle(handle, WORKSPACE_CONFIG_PATH);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as WorkspaceConfig;
    } catch {
      return null;
    }
  }

  const db = await getDb();
  return (await db.get(CONFIG_STORE, folderPathOrId)) ?? null;
}

/**
 * Write workspace config.
 * Electron: writes to `.aiwriter/workspace.json` on disk.
 * Browser + FSAA handle: writes to real folder via handle.
 * Browser fallback: writes to IDB.
 */
export async function writeWorkspaceConfig(
  folderPathOrId: string,
  config: WorkspaceConfig,
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const json = JSON.stringify(config, null, 2) + "\n";
    await window.electronAPI.writeWorkspaceConfig(folderPathOrId, json);
  } else {
    const handle = await resolveHandle(folderPathOrId);
    if (handle) {
      const json = JSON.stringify(config, null, 2) + "\n";
      await writeFileViaHandle(handle, WORKSPACE_CONFIG_PATH, json);
    } else {
      const db = await getDb();
      await db.put(CONFIG_STORE, config, folderPathOrId);
    }
  }

  await updateWorkspaceIndex(folderPathOrId, config);
}

async function updateWorkspaceIndex(
  folderPathOrId: string,
  config: WorkspaceConfig,
): Promise<void> {
  const db = await getDb();
  const entry: WorkspaceIndexEntry = {
    id: config.project.id,
    title: config.project.title,
    updatedAt: config.updatedAt,
    ...(isElectron() ? { folderPath: folderPathOrId } : {}),
  };
  await db.put(INDEX_STORE, entry, config.project.id);
}

/**
 * Get all workspace index entries for the home screen.
 */
export async function loadWorkspaceIndex(): Promise<WorkspaceIndexEntry[]> {
  const db = await getDb();
  const all = await db.getAll(INDEX_STORE);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Read a text file from the workspace.
 */
export async function readWorkspaceFile(
  folderPathOrId: string,
  relativePath: string,
): Promise<string | null> {
  if (isElectron() && window.electronAPI) {
    const fullPath = `${folderPathOrId}/${relativePath}`;
    return window.electronAPI.readTextFile(fullPath);
  }

  const handle = await resolveHandle(folderPathOrId);
  if (handle) return readFileViaHandle(handle, relativePath);

  const db = await getDb();
  const record = await db.get(
    FILES_STORE,
    idbFileKey(folderPathOrId, relativePath),
  );
  if (!record) return null;
  if (typeof record.content === "string") return record.content;
  return record.content.text();
}

/**
 * Write a text file in the workspace.
 */
export async function writeWorkspaceFile(
  folderPathOrId: string,
  relativePath: string,
  content: string,
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const fullPath = `${folderPathOrId}/${relativePath}`;
    await window.electronAPI.writeTextFile(fullPath, content);
    return;
  }

  const handle = await resolveHandle(folderPathOrId);
  if (handle) {
    await writeFileViaHandle(handle, relativePath, content);
    return;
  }

  const db = await getDb();
  await db.put(
    FILES_STORE,
    { workspaceId: folderPathOrId, path: relativePath, content },
    idbFileKey(folderPathOrId, relativePath),
  );
}

/**
 * Create a new file with initial content.
 */
export async function createWorkspaceFile(
  folderPathOrId: string,
  relativePath: string,
  initialContent: string = "",
): Promise<void> {
  await writeWorkspaceFile(folderPathOrId, relativePath, initialContent);
}

/**
 * Write a binary file (images, PDFs, etc.) into the workspace.
 */
export async function writeWorkspaceBinaryFile(
  folderPathOrId: string,
  relativePath: string,
  data: ArrayBuffer,
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const fullPath = `${folderPathOrId}/${relativePath}`;
    await window.electronAPI.writeBinaryFile(fullPath, new Uint8Array(data));
    return;
  }

  const handle = await resolveHandle(folderPathOrId);
  if (handle) {
    await writeBinaryViaHandle(handle, relativePath, data);
    return;
  }

  const db = await getDb();
  const blob = new Blob([data]);
  await db.put(
    FILES_STORE,
    { workspaceId: folderPathOrId, path: relativePath, content: blob },
    idbFileKey(folderPathOrId, relativePath),
  );
}

/**
 * Create a directory.
 */
export async function createWorkspaceDir(
  folderPathOrId: string,
  relativePath: string,
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const fullPath = `${folderPathOrId}/${relativePath}`;
    await window.electronAPI.createDir(fullPath);
    return;
  }

  const handle = await resolveHandle(folderPathOrId);
  if (handle) {
    await getNestedDirHandle(handle, relativePath, true);
  }
}

/**
 * Delete a file or folder from the workspace.
 */
export async function deleteWorkspacePath(
  folderPathOrId: string,
  relativePath: string,
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const fullPath = `${folderPathOrId}/${relativePath}`;
    await window.electronAPI.deletePath(fullPath);
    return;
  }

  const handle = await resolveHandle(folderPathOrId);
  if (handle) {
    await deleteViaHandle(handle, relativePath);
    return;
  }

  const db = await getDb();
  const allKeys = await db.getAllKeys(FILES_STORE);
  const prefix = idbFileKey(folderPathOrId, relativePath);
  for (const key of allKeys) {
    if (key === prefix || (key as string).startsWith(prefix + "/")) {
      await db.delete(FILES_STORE, key);
    }
  }
}

/**
 * Rename a file or folder.
 */
export async function renameWorkspacePath(
  folderPathOrId: string,
  oldRelativePath: string,
  newRelativePath: string,
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const oldFull = `${folderPathOrId}/${oldRelativePath}`;
    const newFull = `${folderPathOrId}/${newRelativePath}`;
    await window.electronAPI.renamePath(oldFull, newFull);
    return;
  }

  const handle = await resolveHandle(folderPathOrId);
  if (handle) {
    await renameViaHandle(handle, oldRelativePath, newRelativePath);
    return;
  }

  const db = await getDb();
  const allKeys = await db.getAllKeys(FILES_STORE);
  const oldPrefix = idbFileKey(folderPathOrId, oldRelativePath);
  for (const key of allKeys) {
    const keyStr = key as string;
    if (keyStr === oldPrefix || keyStr.startsWith(oldPrefix + "/")) {
      const record = await db.get(FILES_STORE, key);
      if (record) {
        const newKey = keyStr.replace(
          oldPrefix,
          idbFileKey(folderPathOrId, newRelativePath),
        );
        const newPath = record.path.replace(oldRelativePath, newRelativePath);
        await db.put(FILES_STORE, { ...record, path: newPath }, newKey);
        await db.delete(FILES_STORE, key);
      }
    }
  }
}

/**
 * Scan a folder on disk and build a WorkspaceNode tree.
 * Electron: uses IPC readDir.
 */
export async function scanFolderToTree(
  folderPath: string,
  relativePath: string = "",
): Promise<WorkspaceNode[]> {
  if (!isElectron() || !window.electronAPI) return [];

  const fullPath = relativePath
    ? `${folderPath}/${relativePath}`
    : folderPath;
  const entries: FsDirEntry[] = await window.electronAPI.readDir(fullPath);

  const nodes: WorkspaceNode[] = [];
  for (const entry of entries) {
    if (entry.name === WORKSPACE_CONFIG_DIR) continue;
    if (entry.name.startsWith(".")) continue;

    const childRelPath = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory) {
      const children = await scanFolderToTree(folderPath, childRelPath);
      nodes.push({
        kind: "folder",
        id: createId(),
        name: entry.name,
        path: childRelPath,
        children,
        expanded: true,
      } satisfies FolderNode);
    } else {
      nodes.push({
        kind: "file",
        id: createId(),
        name: entry.name,
        path: childRelPath,
      } satisfies FileNode);
    }
  }

  return nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Initialize a new workspace. Creates config and a starter file.
 */
export async function initNewWorkspace(
  folderPathOrId: string,
  config: WorkspaceConfig,
): Promise<void> {
  await writeWorkspaceConfig(folderPathOrId, config);

  const firstFile = config.tree.find((n) => n.kind === "file");
  if (firstFile) {
    await createWorkspaceFile(folderPathOrId, firstFile.path, "");
  }
}

/**
 * Open a folder and load/initialize its workspace config (Electron).
 */
export async function openFolderWorkspace(
  folderPath: string,
): Promise<{ config: WorkspaceConfig; isNew: boolean }> {
  const existing = await readWorkspaceConfig(folderPath);
  if (existing) {
    return { config: existing, isNew: false };
  }

  const { buildDefaultConfig } = await import("@/documents/workspace-types");
  const config = buildDefaultConfig();

  if (isElectron() && window.electronAPI) {
    const diskTree = await scanFolderToTree(folderPath);
    if (diskTree.length > 0) {
      config.tree = diskTree;
      const firstFile = findFirstFile(diskTree);
      config.activeFilePath = firstFile?.path ?? null;
    }
  }

  await initNewWorkspace(folderPath, config);
  return { config, isNew: true };
}

/**
 * Browser: pick a folder via the File System Access API, then load or
 * initialize its workspace config. Stores the directory handle in IDB
 * for later reuse.
 *
 * Returns null if the user cancelled the picker.
 */
export async function pickAndOpenBrowserFolder(): Promise<{
  workspaceId: string;
  config: WorkspaceConfig;
} | null> {
  if (!supportsNativeFolderPicker()) return null;

  let dirHandle: FileSystemDirectoryHandle;
  try {
    dirHandle = await showDirectoryPicker({
      mode: "readwrite",
      id: "ai-writer-workspace",
      startIn: "documents",
    });
  } catch {
    return null;
  }

  const configRaw = await readFileViaHandle(
    dirHandle,
    WORKSPACE_CONFIG_PATH,
  );
  if (configRaw) {
    try {
      const config = JSON.parse(configRaw) as WorkspaceConfig;
      const wsId = config.project.id;
      await storeDirHandle(wsId, dirHandle);
      await updateWorkspaceIndex(wsId, config);
      return { workspaceId: wsId, config };
    } catch {
      // Corrupted config — fall through and re-init
    }
  }

  const { buildDefaultConfig } = await import("@/documents/workspace-types");
  const config = buildDefaultConfig();
  config.project.title = dirHandle.name || "Untitled";

  const existingTree = await scanDirHandleToTree(dirHandle);
  if (existingTree.length > 0) {
    config.tree = existingTree;
    const firstFile = findFirstFile(existingTree);
    config.activeFilePath = firstFile?.path ?? null;
  }

  const wsId = config.project.id;
  await storeDirHandle(wsId, dirHandle);
  await writeFileViaHandle(
    dirHandle,
    WORKSPACE_CONFIG_PATH,
    JSON.stringify(config, null, 2) + "\n",
  );

  const firstFile = config.tree.find((n) => n.kind === "file");
  if (firstFile) {
    const exists = await readFileViaHandle(dirHandle, firstFile.path);
    if (exists === null) {
      await writeFileViaHandle(dirHandle, firstFile.path, "");
    }
  }

  await updateWorkspaceIndex(wsId, config);
  return { workspaceId: wsId, config };
}

function findFirstFile(nodes: WorkspaceNode[]): FileNode | null {
  for (const node of nodes) {
    if (node.kind === "file") return node;
    if (node.kind === "folder") {
      const found = findFirstFile(node.children);
      if (found) return found;
    }
  }
  return null;
}
