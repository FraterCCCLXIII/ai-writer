import type { Chapter, ResearchDocument } from "@/documents/types";
import { jsonToPlainText } from "@/lib/tiptap-plain-text";

/** Matches `editorContext` in the project store. */
export type EditorContextSlice = {
  text: string;
  chapterId: string;
  from: number;
  to: number;
} | null;

const DEFAULT_TRAILING_CHARS = 1200;
const DEFAULT_MAX_CHUNK_CHARS = 550;
const DEFAULT_TOP_K = 8;
/** Cap chunk count across all research to keep scoring cheap in large imports. */
const MAX_TOTAL_CHUNKS = 400;

export type LiveNoteHit = {
  documentId: string;
  title: string;
  excerpt: string;
  /** Cosine similarity in [0, 1] for display ordering. */
  score: number;
};

export type ComputeLiveNotesOptions = {
  topK?: number;
  maxChunkChars?: number;
  /** Skip these research doc ids (e.g. the one open in the editor). */
  excludeResearchIds?: Set<string> | string[];
};

export function tokenize(text: string): string[] {
  const m = text.toLowerCase().match(/[a-z0-9']+/g);
  return m ?? [];
}

function wordCounts(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) {
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return m;
}

export function buildIdfFromChunks(chunkTokenLists: string[][]): Map<string, number> {
  const N = chunkTokenLists.length;
  const df = new Map<string, number>();
  for (const tokens of chunkTokenLists) {
    const seen = new Set(tokens);
    for (const t of seen) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [t, d] of df) {
    idf.set(t, Math.log((N + 1) / (d + 1)) + 1);
  }
  return idf;
}

export function tfidfVectorFromChunks(
  tokens: string[],
  idf: Map<string, number>,
): Map<string, number> {
  const tf = wordCounts(tokens);
  const denom = tokens.length || 1;
  const out = new Map<string, number>();
  for (const [t, c] of tf) {
    const idfw = idf.get(t);
    if (idfw === undefined) continue;
    out.set(t, (c / denom) * idfw);
  }
  return out;
}

export function cosineSimilarityVectors(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dot = 0;
  let na = 0;
  for (const [, va] of a) na += va * va;
  let nb = 0;
  for (const [, vb] of b) nb += vb * vb;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const [k, va] of smaller) {
    const vb = larger.get(k);
    if (vb !== undefined) dot += va * vb;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Split plain text into paragraph-ish chunks, then hard-split very long blocks.
 */
export function splitResearchIntoChunks(
  plain: string,
  maxChunkChars = DEFAULT_MAX_CHUNK_CHARS,
): string[] {
  const normalized = plain.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const paras = normalized
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  for (const p of paras) {
    if (p.length <= maxChunkChars) {
      chunks.push(p);
      continue;
    }
    for (let i = 0; i < p.length; i += maxChunkChars) {
      chunks.push(p.slice(i, i + maxChunkChars));
    }
  }
  return chunks;
}

/**
 * Anchor for relevance: prefer the user's selection; otherwise the last N characters
 * of the active chapter (recent writing).
 */
export function computeAnchorText(params: {
  editorContextText: string | null | undefined;
  chapterPlainText: string;
  trailingChars?: number;
}): string {
  const selected = params.editorContextText?.trim();
  if (selected && selected.length > 0) {
    return selected.slice(0, 12_000);
  }
  const tail = params.trailingChars ?? DEFAULT_TRAILING_CHARS;
  const t = params.chapterPlainText;
  if (!t.trim()) return "";
  return t.slice(-tail);
}

/**
 * Shared anchor + exclusion rules for Live Notes UI and chat context injection.
 */
export function getLiveNotesAnchorParams(state: {
  chapters: Chapter[];
  activeChapterId: string | null;
  researchDocuments: ResearchDocument[];
  activeResearchId: string | null;
  editorContext: EditorContextSlice;
}): { anchor: string; excludeResearchIds: string[] } {
  const activeChapter = state.chapters.find(
    (c) => c.id === state.activeChapterId,
  );
  const activeResearch = state.researchDocuments.find(
    (d) => d.id === state.activeResearchId,
  );
  const onResearch = Boolean(state.activeResearchId && activeResearch);
  const manuscriptPlain = activeChapter
    ? jsonToPlainText(activeChapter.content)
    : "";
  const researchPlain = activeResearch
    ? jsonToPlainText(activeResearch.content)
    : "";
  const plain = onResearch ? researchPlain : manuscriptPlain;
  const selection =
    state.editorContext &&
    (onResearch
      ? state.editorContext.chapterId === state.activeResearchId
      : state.editorContext.chapterId === state.activeChapterId)
      ? state.editorContext.text
      : null;
  const anchor = computeAnchorText({
    editorContextText: selection,
    chapterPlainText: plain,
  });
  const excludeResearchIds = state.activeResearchId
    ? [state.activeResearchId]
    : [];
  return { anchor, excludeResearchIds };
}

export function relevantResearchSnippetsForChat(
  anchor: string,
  researchDocuments: ResearchDocument[],
  excludeResearchIds: string[],
  topK = 6,
): { title: string; excerpt: string }[] {
  return computeLiveNotes(anchor, researchDocuments, {
    excludeResearchIds,
    topK,
  }).map((h) => ({ title: h.title, excerpt: h.excerpt }));
}

type ChunkMeta = {
  documentId: string;
  title: string;
  text: string;
  tokens: string[];
};

/**
 * Rank research chunks by TF–IDF cosine similarity to the anchor text.
 */
export function computeLiveNotes(
  anchorText: string,
  researchDocuments: ResearchDocument[],
  options: ComputeLiveNotesOptions = {},
): LiveNoteHit[] {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const maxChunkChars = options.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const exclude =
    options.excludeResearchIds instanceof Set
      ? options.excludeResearchIds
      : new Set(options.excludeResearchIds ?? []);

  const anchorTokens = tokenize(anchorText);
  if (anchorTokens.length === 0) return [];

  const chunkMetas: ChunkMeta[] = [];
  for (const doc of researchDocuments) {
    if (exclude.has(doc.id)) continue;
    const plain = jsonToPlainText(doc.content);
    const parts = splitResearchIntoChunks(plain, maxChunkChars);
    for (const text of parts) {
      const tokens = tokenize(text);
      if (tokens.length === 0) continue;
      chunkMetas.push({
        documentId: doc.id,
        title: doc.title,
        text,
        tokens,
      });
      if (chunkMetas.length >= MAX_TOTAL_CHUNKS) break;
    }
    if (chunkMetas.length >= MAX_TOTAL_CHUNKS) break;
  }

  if (chunkMetas.length === 0) return [];

  const idf = buildIdfFromChunks(chunkMetas.map((c) => c.tokens));
  const anchorVec = tfidfVectorFromChunks(anchorTokens, idf);

  const scored: LiveNoteHit[] = chunkMetas.map((c) => {
    const chunkVec = tfidfVectorFromChunks(c.tokens, idf);
    const score = cosineSimilarityVectors(anchorVec, chunkVec);
    return {
      documentId: c.documentId,
      title: c.title,
      excerpt: c.text,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: LiveNoteHit[] = [];
  for (const hit of scored) {
    const key = `${hit.documentId}\0${hit.excerpt}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= topK) break;
  }
  return out;
}
