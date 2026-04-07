export type InlineAction =
  | "rewrite"
  | "expand"
  | "shorten"
  | "clarity"
  | "tone_formal"
  | "tone_casual"
  | "tone_dramatic";

export type ChatContext = {
  selectedText: string | null;
  chapterTitle: string | null;
  chapterPlainText: string;
};
