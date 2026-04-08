import type { Chapter, ResearchDocument } from "@/documents/types";
import { jsonToPlainText } from "@/lib/tiptap-plain-text";
import type { GenerateChaptersFromResearchResult } from "@/lib/ai/types";

export const MAX_RESEARCH_CORPUS_CHARS = 100_000;

/**
 * Match chat messages like "build chapters 3-5", "build chapter 2 to 7".
 * 1-based inclusive range.
 */
export function parseBuildChaptersMessage(
  message: string,
): { start: number; end: number } | null {
  const t = message.trim();
  const range = t.match(
    /^\s*build\s+chapters?\s+(\d+)\s*[-–—]\s*(\d+)\s*$/i,
  );
  if (range) {
    const start = parseInt(range[1]!, 10);
    const end = parseInt(range[2]!, 10);
    if (start >= 1 && end >= start) return { start, end };
    return null;
  }
  const to = t.match(
    /^\s*build\s+chapters?\s+(\d+)\s+(?:to|through)\s+(\d+)\s*$/i,
  );
  if (to) {
    const start = parseInt(to[1]!, 10);
    const end = parseInt(to[2]!, 10);
    if (start >= 1 && end >= start) return { start, end };
    return null;
  }
  const single = t.match(/^\s*build\s+chapters?\s+(\d+)\s*$/i);
  if (single) {
    const n = parseInt(single[1]!, 10);
    if (n >= 1) return { start: n, end: n };
  }
  return null;
}

export function buildResearchCorpus(
  researchDocuments: ResearchDocument[],
): string {
  const parts: string[] = [];
  let total = 0;
  const sorted = [...researchDocuments].sort((a, b) => a.order - b.order);
  for (const d of sorted) {
    const plain = jsonToPlainText(d.content).trim();
    if (!plain) continue;
    const block = `## ${d.title}\n\n${plain}`;
    if (total + block.length + 2 > MAX_RESEARCH_CORPUS_CHARS) {
      const room = MAX_RESEARCH_CORPUS_CHARS - total - 2;
      if (room > 100) {
        parts.push(block.slice(0, room) + "\n\n[…truncated]");
      }
      break;
    }
    parts.push(block);
    total += block.length + 2;
  }
  return parts.join("\n\n");
}

export function orderedChapters(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => a.order - b.order);
}

export type ResolveChapterRangeError = { error: string };

export type ResolveChapterRangeOk = {
  targets: {
    id: string;
    title: string;
    order: number;
    index: number;
  }[];
  start: number;
  end: number;
};

export function resolveChapterRange(
  start: number,
  end: number,
  chapters: Chapter[],
): ResolveChapterRangeError | ResolveChapterRangeOk {
  if (start < 1 || end < start) {
    return { error: "Invalid range (start and end must be valid)." };
  }
  const ordered = orderedChapters(chapters);
  const n = ordered.length;
  if (n === 0) {
    return { error: "No chapters in this project." };
  }
  if (end > n) {
    return {
      error: `This manuscript has ${n} chapter${n === 1 ? "" : "s"}. Add chapters first, then try chapters 1–${n}.`,
    };
  }
  if (start > n) {
    return {
      error: `Chapter ${start} does not exist. This manuscript has ${n} chapter${n === 1 ? "" : "s"}.`,
    };
  }
  const slice = ordered.slice(start - 1, end);
  const targets = slice.map((c, i) => ({
    id: c.id,
    title: c.title,
    order: c.order,
    index: start + i,
  }));
  return { targets, start, end };
}

export function chapterHasContent(chapter: Chapter): boolean {
  return jsonToPlainText(chapter.content).trim().length > 0;
}

/** Plain text from the chapter before the range (for voice continuity). */
export function buildStyleHintBeforeRange(
  chapters: Chapter[],
  startChapter: number,
): string | null {
  if (startChapter < 2) return null;
  const ordered = orderedChapters(chapters);
  const prev = ordered[startChapter - 2];
  if (!prev) return null;
  const t = jsonToPlainText(prev.content).trim();
  return t.length > 0 ? t.slice(-4000) : null;
}

export async function fetchGenerateChaptersFromResearch(body: {
  startChapter: number;
  endChapter: number;
  chapterTargets: {
    id: string;
    title: string;
    order: number;
    index: number;
  }[];
  researchCorpus: string;
  styleHint: string | null;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  signal?: AbortSignal;
}): Promise<GenerateChaptersFromResearchResult> {
  const res = await fetch("/api/ai/generate-chapters-from-research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: body.signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const msg =
      err && typeof err === "object" && "error" in err
        ? String((err as { error?: string }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return (await res.json()) as GenerateChaptersFromResearchResult;
}
