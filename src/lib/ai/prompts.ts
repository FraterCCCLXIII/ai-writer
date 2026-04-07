import type { ChatContext, InlineAction } from "./types";

const actionInstructions: Record<InlineAction, string> = {
  rewrite: "Rewrite the selection for smoother prose while preserving meaning and voice.",
  expand: "Expand the selection with vivid detail; keep the same narrative voice.",
  shorten: "Tighten the selection; remove redundancy while keeping the key ideas.",
  clarity: "Improve clarity and readability; fix awkward phrasing.",
  tone_formal: "Revise to a more formal, polished tone.",
  tone_casual: "Revise to a warmer, more conversational tone.",
  tone_dramatic: "Revise for more dramatic tension and rhythm (still prose, not purple).",
};

export function inlineSystemPrompt(action: InlineAction): string {
  return `You are an expert fiction and nonfiction editor. ${actionInstructions[action]}

Rules:
- Output ONLY the revised passage text, no quotes or markdown fences.
- Do not add commentary before or after.
- Match the approximate length expectations implied by the action.`;
}

export function inlineUserPayload(input: {
  selectedText: string;
  fullChapterText: string;
  extra?: string;
}): string {
  const parts = [
    "## Selected text\n" + input.selectedText,
    "## Full chapter (context)\n" + input.fullChapterText.slice(0, 120_000),
  ];
  if (input.extra?.trim()) {
    parts.push("## Author note\n" + input.extra.trim());
  }
  return parts.join("\n\n");
}

export function chatSystemPrompt(): string {
  return `You are a thoughtful writing partner for long-form manuscripts. Be concise unless asked for detail. When generating new prose, match the user's likely voice from context. Prefer practical, craft-focused feedback.`;
}

export function chatUserPayload(input: {
  message: string;
  context: ChatContext;
}): string {
  const { message, context } = input;
  const sel = context.selectedText?.trim();
  const header = [
    context.chapterTitle ? `Current chapter: ${context.chapterTitle}` : null,
    sel
      ? `## Primary focus — user's selected excerpt (revise or respond in relation to this)\n"""${sel}"""\n\nThe author selected the passage above in the manuscript. Prioritize it in your answer.`
      : null,
    context.chapterPlainText
      ? `## Full chapter text (may be truncated for length)\n"""${context.chapterPlainText.slice(0, 80_000)}"""`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  return header ? `${header}\n\n---\n\n## Author message\n${message}` : message;
}
