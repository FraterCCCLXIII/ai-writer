export type InlineAction =
  | "rewrite"
  | "expand"
  | "shorten"
  | "clarity"
  | "tone_formal"
  | "tone_casual"
  | "tone_dramatic";

export type ChatMode = "ask" | "edit" | "agent";

export type AgentWorkspaceSnapshot = {
  chapters: { id: string; title: string; order: number; plainText: string }[];
  researchDocuments: { id: string; title: string; plainText: string }[];
  /** Serialized folder tree so the AI knows the workspace structure. */
  folderTree?: string;
};

export type WriteMutation =
  | { type: "edit_chapter"; chapterId: string; newPlainText: string }
  | { type: "create_chapter"; title: string; plainText: string }
  | { type: "create_folder"; parentPath: string | null; name: string }
  | {
      type: "create_file";
      parentPath: string | null;
      name: string;
      content: string;
    };

export type TodoItem = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
};

/** Response shape for research-driven chapter generation (JSON mode). */
export type GenerateChaptersFromResearchResult = {
  chapters: { index: number; plainText: string }[];
};

export type ChatContext = {
  selectedText: string | null;
  chapterTitle: string | null;
  chapterPlainText: string;
  /**
   * Client-ranked research excerpts (lexical match to current writing).
   * Omitted in older clients or when no research / no anchor text.
   */
  relevantResearchSnippets?: { title: string; excerpt: string }[];
};
