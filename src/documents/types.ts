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
