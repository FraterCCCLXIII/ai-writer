export type InlineAction =
  | "rewrite"
  | "expand"
  | "shorten"
  | "clarity"
  | "tone_formal"
  | "tone_casual"
  | "tone_dramatic";

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
