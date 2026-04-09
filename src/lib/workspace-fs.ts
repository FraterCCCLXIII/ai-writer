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
  createId,
} from "@/documents/workspace-types";

// ---------------------------------------------------------------------------
// IDB virtual filesystem (browser fallback)
// ---------------------------------------------------------------------------

const IDB_NAME = "ai-writer-v2";
const IDB_VERSION = 1;
const CONFIG_STORE = "configs";
const FILES_STORE = "files";
const INDEX_STORE = "index";

interface WorkspaceFsDB extends DBSchema {
  [CONFIG_STORE]: { key: string; value: WorkspaceConfig };
  [FILES_STORE]: { key: string; value: { workspaceId: string; path: string; content: string } };
  [INDEX_STORE]: { key: string; value: WorkspaceIndexEntry };
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
      },
    });
  }
  return dbPromise;
}

function idbFileKey(workspaceId: string, filePath: string): string {
  return `${workspaceId}:${filePath}`;
}

// ---------------------------------------------------------------------------
// Unified API
// ---------------------------------------------------------------------------

function isElectron(): boolean {
  return typeof window !== "undefined" && Boolean(window.electronAPI);
}

/**
 * Read the workspace config from a folder. Returns null if none exists.
 * Electron: reads `.aiwriter/workspace.json` from disk.
 * Browser: reads from IDB.
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
  const db = await getDb();
  return (await db.get(CONFIG_STORE, folderPathOrId)) ?? null;
}

/**
 * Write workspace config.
 * Electron: writes to `.aiwriter/workspace.json` on disk.
 * Browser: writes to IDB.
 */
export async function writeWorkspaceConfig(
  folderPathOrId: string,
  config: WorkspaceConfig,
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const json = JSON.stringify(config, null, 2) + "\n";
    await window.electronAPI.writeWorkspaceConfig(folderPathOrId, json);
  } else {
    const db = await getDb();
    await db.put(CONFIG_STORE, config, folderPathOrId);
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
 * Electron: reads from disk.
 * Browser: reads from IDB.
 */
export async function readWorkspaceFile(
  folderPathOrId: string,
  relativePath: string,
): Promise<string | null> {
  if (isElectron() && window.electronAPI) {
    const fullPath = `${folderPathOrId}/${relativePath}`;
    return window.electronAPI.readTextFile(fullPath);
  }
  const db = await getDb();
  const record = await db.get(FILES_STORE, idbFileKey(folderPathOrId, relativePath));
  return record?.content ?? null;
}

/**
 * Write a text file in the workspace.
 * Electron: writes to disk.
 * Browser: writes to IDB.
 */
export async function writeWorkspaceFile(
  folderPathOrId: string,
  relativePath: string,
  content: string,
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const fullPath = `${folderPathOrId}/${relativePath}`;
    await window.electronAPI.writeTextFile(fullPath, content);
  } else {
    const db = await getDb();
    await db.put(
      FILES_STORE,
      { workspaceId: folderPathOrId, path: relativePath, content },
      idbFileKey(folderPathOrId, relativePath),
    );
  }
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
 * Create a directory.
 * Electron: creates on disk.
 * Browser: no-op (directories are virtual in IDB).
 */
export async function createWorkspaceDir(
  folderPathOrId: string,
  relativePath: string,
): Promise<void> {
  if (isElectron() && window.electronAPI) {
    const fullPath = `${folderPathOrId}/${relativePath}`;
    await window.electronAPI.createDir(fullPath);
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
  } else {
    const db = await getDb();
    const allKeys = await db.getAllKeys(FILES_STORE);
    const prefix = idbFileKey(folderPathOrId, relativePath);
    for (const key of allKeys) {
      if (key === prefix || (key as string).startsWith(prefix + "/")) {
        await db.delete(FILES_STORE, key);
      }
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
  } else {
    const db = await getDb();
    const allKeys = await db.getAllKeys(FILES_STORE);
    const oldPrefix = idbFileKey(folderPathOrId, oldRelativePath);
    for (const key of allKeys) {
      const keyStr = key as string;
      if (keyStr === oldPrefix || keyStr.startsWith(oldPrefix + "/")) {
        const record = await db.get(FILES_STORE, key);
        if (record) {
          const newKey = keyStr.replace(oldPrefix, idbFileKey(folderPathOrId, newRelativePath));
          const newPath = record.path.replace(oldRelativePath, newRelativePath);
          await db.put(
            FILES_STORE,
            { ...record, path: newPath },
            newKey,
          );
          await db.delete(FILES_STORE, key);
        }
      }
    }
  }
}

/**
 * Scan a folder on disk and build a WorkspaceNode tree.
 * Only used in Electron; in browser mode the tree comes from the config.
 */
export async function scanFolderToTree(
  folderPath: string,
  relativePath: string = "",
): Promise<WorkspaceNode[]> {
  if (!isElectron() || !window.electronAPI) return [];

  const fullPath = relativePath ? `${folderPath}/${relativePath}` : folderPath;
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
 * Initialize a new workspace in a folder. Creates `.aiwriter/workspace.json`
 * and the first starter file.
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
 * Open a folder and load/initialize its workspace config.
 * Returns the config and whether it was freshly initialized.
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
