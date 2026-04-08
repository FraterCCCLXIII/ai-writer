import type { ChatContext, InlineAction } from "./types";

export function generateChaptersFromResearchSystemPrompt(): string {
  return `You are a skilled long-form writer helping an author draft manuscript chapters using their research notes.

Output rules:
- Respond with a single JSON object only. No markdown code fences, no text before or after the JSON.
- The JSON must match this shape exactly:
  { "chapters": [ { "index": <number>, "plainText": "<string>" } ] }
- "index" is the 1-based chapter position in the manuscript (as given in the user message).
- "plainText" is narrative prose: paragraphs separated by blank lines. No markdown headings unless essential to the story; prefer plain paragraphs.
- Base content on the research provided; synthesize and dramatize where appropriate for fiction or narrative nonfiction. Do not fabricate specific citations or quotations not implied by the notes.
- If research is thin for a chapter, still produce a coherent section that fits the chapter title and surrounding manuscript context.
- Do not include keys other than "chapters" at the top level.`;
}

export function generateChaptersFromResearchUserPayload(input: {
  chapterTargets: { index: number; title: string }[];
  researchCorpus: string;
  styleHint: string | null;
}): string {
  const lines = input.chapterTargets.map(
    (t) => `- Chapter ${t.index}: "${t.title}"`,
  );
  const style = input.styleHint?.trim()
    ? `## Voice / style sample (from elsewhere in the manuscript)\n"""${input.styleHint.trim().slice(0, 8_000)}"""\n\n`
    : "";
  return `${style}## Chapters to write (1-based positions)\n${lines.join("\n")}

## Research notes (primary source material)
"""${input.researchCorpus}"""

Write the requested chapters. Return JSON only.`;
}

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
  const snippets = context.relevantResearchSnippets?.filter(
    (s) => s.title.trim() || s.excerpt.trim(),
  );
  const researchBlock =
    snippets && snippets.length > 0
      ? `## Research notes (ranked by relevance to the author's current writing)\n${snippets
          .map(
            (s, i) =>
              `### ${i + 1}. ${s.title || "Untitled"}\n"""${s.excerpt.slice(0, 6_000)}"""`,
          )
          .join("\n\n")}`
      : null;

  const header = [
    context.chapterTitle ? `Current chapter: ${context.chapterTitle}` : null,
    sel
      ? `## Primary focus — user's selected excerpt (revise or respond in relation to this)\n"""${sel}"""\n\nThe author selected the passage above in the manuscript. Prioritize it in your answer.`
      : null,
    context.chapterPlainText
      ? `## Full chapter text (may be truncated for length)\n"""${context.chapterPlainText.slice(0, 80_000)}"""`
      : null,
    researchBlock,
  ]
    .filter(Boolean)
    .join("\n\n");
  return header ? `${header}\n\n---\n\n## Author message\n${message}` : message;
}
