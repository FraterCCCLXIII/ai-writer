import type { JSONContent } from "novel";

export type Chapter = {
  id: string;
  title: string;
  content: JSONContent;
  order: number;
};

export type ProjectMeta = {
  id: string;
  title: string;
  description: string;
};

export type PersistedWorkspace = {
  version: 1;
  project: ProjectMeta;
  chapters: Chapter[];
  activeChapterId: string | null;
  openTabs: string[];
  chatMessages: ChatMessage[];
  updatedAt: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

/** Lightweight row for the home screen “recent projects” list. */
export type ProjectIndexEntry = {
  id: string;
  title: string;
  updatedAt: number;
  /**
   * When set, the full workspace is stored on disk at
   * `{folderPath}/{WORKSPACE_FILE_NAME}` (Electron “open folder” projects).
   */
  folderPath?: string;
};
