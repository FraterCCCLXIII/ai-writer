import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { PersistedWorkspace } from "@/documents/types";

const DB_NAME = "ai-writer";
const STORE = "workspace";
const KEY = "default";

interface WriterDB extends DBSchema {
  [STORE]: {
    key: string;
    value: PersistedWorkspace;
  };
}

let dbPromise: Promise<IDBPDatabase<WriterDB>> | null = null;

function getDb(): Promise<IDBPDatabase<WriterDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WriterDB>(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function loadWorkspace(): Promise<PersistedWorkspace | null> {
  try {
    const db = await getDb();
    return (await db.get(STORE, KEY)) ?? null;
  } catch {
    return null;
  }
}

export async function saveWorkspace(data: PersistedWorkspace): Promise<void> {
  const db = await getDb();
  await db.put(STORE, data, KEY);
}
