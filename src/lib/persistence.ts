import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PersistedWorkspace, ProjectIndexEntry } from "@/documents/types";
import { parsePersistedWorkspace } from "@/lib/workspace-schema";

const DB_NAME = "ai-writer";
const STORE = "workspace";
const LEGACY_KEY = "default";
const INDEX_KEY = "meta:project-index";

const DB_VERSION = 2;

type ProjectIndex = {
  version: 1;
  entries: ProjectIndexEntry[];
};

interface WriterDB extends DBSchema {
  [STORE]: {
    key: string;
    value: PersistedWorkspace | ProjectIndex;
  };
}

let dbPromise: Promise<IDBPDatabase<WriterDB>> | null = null;

function wsKey(projectId: string) {
  return `ws:${projectId}`;
}

function getDb(): Promise<IDBPDatabase<WriterDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WriterDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
        if (oldVersion < 2) {
          // Same store; v2 uses new key layout (migration runs on read).
        }
      },
    });
  }
  return dbPromise;
}

let migrationDone = false;

/**
 * One-time migration from v1 single key `default` to `ws:{projectId}` + index.
 */
async function ensureLegacyMigrated(): Promise<void> {
  if (migrationDone) return;
  const db = await getDb();
  const legacy = (await db.get(
    STORE,
    LEGACY_KEY,
  )) as PersistedWorkspace | undefined;
  if (!legacy) {
    migrationDone = true;
    return;
  }
  const id = legacy.project.id;
  await db.put(STORE, legacy, wsKey(id));
  const entries: ProjectIndexEntry[] = [
    {
      id,
      title: legacy.project.title,
      updatedAt: legacy.updatedAt,
    },
  ];
  await db.put(STORE, { version: 1, entries } satisfies ProjectIndex, INDEX_KEY);
  await db.delete(STORE, LEGACY_KEY);
  migrationDone = true;
}

function upsertIndexEntry(
  entries: ProjectIndexEntry[],
  next: ProjectIndexEntry,
  max = 80,
): ProjectIndexEntry[] {
  const rest = entries.filter((e) => e.id !== next.id);
  const merged = [next, ...rest];
  return merged.slice(0, max);
}

export async function loadProjectIndex(): Promise<ProjectIndexEntry[]> {
  await ensureLegacyMigrated();
  const db = await getDb();
  const meta = (await db.get(STORE, INDEX_KEY)) as ProjectIndex | undefined;
  return meta?.entries ?? [];
}

export async function loadWorkspaceByProjectId(
  projectId: string,
): Promise<PersistedWorkspace | null> {
  await ensureLegacyMigrated();
  try {
    const db = await getDb();
    return (
      ((await db.get(STORE, wsKey(projectId))) as PersistedWorkspace) ?? null
    );
  } catch {
    return null;
  }
}

export type SaveWorkspaceOptions = {
  /** When set (Electron), writes JSON to this folder and skips the large IDB blob. */
  folderPath?: string | null;
};

export async function saveWorkspaceForProject(
  projectId: string,
  data: PersistedWorkspace,
  options?: SaveWorkspaceOptions,
): Promise<void> {
  await ensureLegacyMigrated();
  const folderPath = options?.folderPath;
  if (folderPath && typeof window !== "undefined" && window.electronAPI) {
    const json = `${JSON.stringify(data, null, 2)}\n`;
    await window.electronAPI.writeWorkspaceFile(folderPath, json);
  } else if (!folderPath) {
    const db = await getDb();
    await db.put(STORE, data, wsKey(projectId));
  } else {
    throw new Error("FOLDER_WORKSPACE_REQUIRES_ELECTRON");
  }

  const db = await getDb();
  const meta = ((await db.get(STORE, INDEX_KEY)) as ProjectIndex | undefined) ?? {
    version: 1 as const,
    entries: [],
  };
  const entry: ProjectIndexEntry = {
    id: projectId,
    title: data.project.title,
    updatedAt: data.updatedAt,
    ...(folderPath ? { folderPath } : {}),
  };
  const entries = upsertIndexEntry(meta.entries, entry);
  await db.put(STORE, { version: 1, entries }, INDEX_KEY);
}

async function readWorkspaceFromFolderPath(
  folderPath: string,
): Promise<PersistedWorkspace | null> {
  if (typeof window === "undefined" || !window.electronAPI) return null;
  const res = await window.electronAPI.readWorkspaceFile(folderPath);
  if (!res.ok) return null;
  try {
    const raw = JSON.parse(res.data) as unknown;
    return parsePersistedWorkspace(raw);
  } catch {
    return null;
  }
}

/**
 * Loads a workspace from IndexedDB or from a folder-backed project (Electron).
 */
export async function loadWorkspaceForEntry(
  entry: ProjectIndexEntry,
): Promise<PersistedWorkspace | null> {
  if (entry.folderPath) {
    return readWorkspaceFromFolderPath(entry.folderPath);
  }
  return loadWorkspaceByProjectId(entry.id);
}

/** Display name for a folder-backed row (basename). */
export function folderPathLabel(folderPath: string): string {
  const parts = folderPath.replace(/[/\\]+$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || folderPath;
}

/** @deprecated Legacy single-slot load; use loadProjectIndex + loadWorkspaceByProjectId */
export async function loadWorkspace(): Promise<PersistedWorkspace | null> {
  await ensureLegacyMigrated();
  const entries = await loadProjectIndex();
  if (entries.length === 0) return null;
  return loadWorkspaceByProjectId(entries[0].id);
}

/** @deprecated Use saveWorkspaceForProject */
export async function saveWorkspace(data: PersistedWorkspace): Promise<void> {
  await saveWorkspaceForProject(data.project.id, data);
}
