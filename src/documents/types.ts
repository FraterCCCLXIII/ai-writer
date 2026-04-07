import type { JSONContent } from "novel";

export type Chapter = {
  id: string;
  title: string;
  content: JSONContent;
  order: number;
};

/** Manuscript = chapter list; single document = one editable page (opened from a file). */
export type EditorLayout = "manuscript" | "singleDocument";

export type ProjectMeta = {
  id: string;
  title: string;
  description: string;
  /**
   * Omitted or `manuscript` = multi-chapter workspace.
   * `singleDocument` = one editor surface, no chapter sidebar.
   */
  editorLayout?: EditorLayout;
  /** Original filename when opened via Open file (used for export default name). */
  singleFileName?: string;
};

/** Reference notes and imported files; stored in the workspace, separate from manuscript chapters. */
export type ResearchDocument = {
  id: string;
  title: string;
  content: JSONContent;
  order: number;
  /** Set when created via file import. */
  sourceFileName?: string;
};

export type PersistedWorkspace = {
  version: 1;
  project: ProjectMeta;
  chapters: Chapter[];
  activeChapterId: string | null;
  openTabs: string[];
  chatMessages: ChatMessage[];
  updatedAt: number;
  /** Omitted in older saves; treat as []. */
  researchDocuments?: ResearchDocument[];
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
