import type { ChatContext, ChatMode, InlineAction } from "./types";

const PREAMBLE_RE =
  /^(sure[,!]?|here(?:'s| is)(?: a| the)?|certainly[,!]?|of course[,!]?|absolutely[,!]?|great[,!]?|happy to[,!]?).*/i;

const POSTAMBLE_RE =
  /^(feel free to|let me know|hope (this|that)|if you('d| would)|don't hesitate|i hope|please (let|feel)|reach out).*/i;

const HR_RE = /^-{3,}$|^\*{3,}$|^_{3,}$/;

/**
 * Strip conversational preamble/postamble and markdown horizontal rules from a
 * chat AI response before it is used as replacement prose in the editor.
 */
export function stripRevisionArtifacts(text: string): string {
  const lines = text.split("\n");

  let start = 0;
  let end = lines.length - 1;

  // Drop leading blank lines and a single preamble sentence
  while (start <= end && lines[start].trim() === "") start++;
  if (start <= end && PREAMBLE_RE.test(lines[start].trim())) start++;
  while (start <= end && lines[start].trim() === "") start++;

  // Drop trailing blank lines and a single postamble sentence
  while (end >= start && lines[end].trim() === "") end--;
  if (end >= start && POSTAMBLE_RE.test(lines[end].trim())) end--;
  while (end >= start && lines[end].trim() === "") end--;

  // Remove markdown horizontal rules anywhere in the remaining lines
  const cleaned = lines
    .slice(start, end + 1)
    .filter((line) => !HR_RE.test(line.trim()));

  return cleaned.join("\n").trim();
}

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
  return `You are a thoughtful writing partner for long-form manuscripts. Be concise unless asked for detail. When generating new prose, match the user's likely voice from context. Prefer practical, craft-focused feedback.

When the author asks you to rewrite, revise, edit, replace, improve, or transform a selected passage:
- Output ONLY the revised prose text. Nothing else.
- No preamble (do not start with "Sure!", "Here is", "Here's", "Certainly", "Of course", or any other lead-in phrase).
- No postamble (do not add "Feel free to...", "Let me know if...", or any closing remark).
- No markdown fences, no horizontal rules (---), no quotation marks wrapping the text.
- If the author is asking a question about the selection or requesting feedback only, respond conversationally as normal.`;
}

/**
 * System prompt for the agent route — varies by mode.
 */
export function agentSystemPrompt(mode: ChatMode): string {
  if (mode === "ask") {
    return `You are a thoughtful writing partner for long-form manuscripts. Your role is to discuss, brainstorm, and answer questions about the work — you do NOT edit the document directly and cannot create files or folders.

Guidelines:
- Be concise unless the author asks for depth.
- Reference specific passages when discussing the text.
- Offer craft-focused, practical feedback.
- When you lack context, use the available tools to read chapters or research before answering.
- If the author asks you to create files, folders, or edit content, suggest they switch to Edit or Agent mode.`;
  }

  if (mode === "edit") {
    return `You are a skilled manuscript editor. Your role is to make targeted, precise edits to the author's work.

Guidelines:
- Always read the relevant chapter first before editing it.
- Make the minimum changes needed to fulfill the request — preserve the author's voice.
- Explain what you changed and why in 1–2 sentences after editing.
- Use edit_chapter for changes to existing chapters; use create_chapter for new ones.
- Do not rewrite entire chapters unless explicitly asked.
- You CAN create folders and files when asked. Use list_workspace_tree, create_folder, and create_file tools — do not tell the user to do it manually.`;
  }

  // agent mode
  return `You are an autonomous writing assistant for long-form manuscripts. You can read, create, and edit chapters, manage workspace files and folders, search research, and track your own task list.

Workflow:
1. Start every multi-step task by calling manage_todo_list to outline your plan.
2. Use list_chapters to understand the manuscript structure before reading or editing.
3. Use list_workspace_tree to see the full folder/file layout before creating files or folders.
4. Use search_research or read_research to ground your writing in the author's notes.
5. Use edit_chapter or create_chapter to apply changes — never describe changes without applying them.
6. Use create_folder and create_file to organize the workspace — create folders for grouping related content, and files for new documents.
7. Update todos as you complete each step.
8. When done, give a brief summary of what you accomplished.

File & folder management:
- You CAN create folders and files. Always use the create_folder and create_file tools — do not tell the user to do it manually.
- Use list_workspace_tree first to see the current structure, then create_folder / create_file with the correct parentPath.
- Folder and file names should be descriptive and human-readable.

Guidelines:
- Preserve the author's voice; do not impose a different style.
- Make changes incrementally — read first, then edit.
- If a task is ambiguous, ask one clarifying question before proceeding.`;
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
      ? `## Primary focus — user's selected excerpt\n"""${sel}"""\n\nThe author selected the passage above in the manuscript. If their message asks you to revise or rewrite it, output ONLY the replacement prose — no lead-in phrases, no closing remarks, no markdown separators.`
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
