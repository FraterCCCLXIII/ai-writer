import {
  generateChaptersFromResearchSystemPrompt,
  generateChaptersFromResearchUserPayload,
} from "@/lib/ai/prompts";
import { completeChatJson } from "@/lib/ai/openai-compatible";
import { resolveOpenAiFromRequest } from "@/lib/ai/server-config";
import type { GenerateChaptersFromResearchResult } from "@/lib/ai/types";

export const runtime = "nodejs";

const MAX_CORPUS = 100_000;
const MAX_PER_CHAPTER = 24_000;

export async function POST(req: Request) {
  const body = (await req.json()) as {
    startChapter?: number;
    endChapter?: number;
    chapterTargets?: {
      id: string;
      title: string;
      order: number;
      index: number;
    }[];
    researchCorpus?: string;
    styleHint?: string | null;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
  };

  const start = body.startChapter;
  const end = body.endChapter;
  if (
    typeof start !== "number" ||
    typeof end !== "number" ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 1 ||
    end < start
  ) {
    return Response.json({ error: "Invalid chapter range" }, { status: 400 });
  }

  const corpus = body.researchCorpus ?? "";
  if (corpus.length > MAX_CORPUS) {
    return Response.json(
      { error: `Research corpus too long (max ${MAX_CORPUS} characters)` },
      { status: 400 },
    );
  }
  if (!corpus.trim()) {
    return Response.json({ error: "Research corpus is empty" }, { status: 400 });
  }

  const targets = body.chapterTargets ?? [];
  const expected = end - start + 1;
  if (targets.length !== expected) {
    return Response.json(
      { error: "Chapter targets do not match range" },
      { status: 400 },
    );
  }

  for (let i = 0; i < targets.length; i++) {
    if (targets[i]!.index !== start + i) {
      return Response.json(
        { error: "Chapter target indices must match range" },
        { status: 400 },
      );
    }
  }

  const { apiKey, baseUrl, model } = resolveOpenAiFromRequest(body);

  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const userContent = generateChaptersFromResearchUserPayload({
    chapterTargets: targets.map((t) => ({ index: t.index, title: t.title })),
    researchCorpus: corpus,
    styleHint: body.styleHint ?? null,
  });

  let raw: string;
  try {
    raw = await completeChatJson({
      baseUrl,
      apiKey,
      model,
      messages: [
        {
          role: "system",
          content: generateChaptersFromResearchSystemPrompt(),
        },
        { role: "user", content: userContent },
      ],
      signal: req.signal,
      jsonMode: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Generation failed";
    return Response.json({ error: msg }, { status: 502 });
  }

  let parsed: GenerateChaptersFromResearchResult;
  try {
    parsed = JSON.parse(raw) as GenerateChaptersFromResearchResult;
  } catch {
    return Response.json(
      { error: "Model returned invalid JSON" },
      { status: 502 },
    );
  }

  if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
    return Response.json({ error: "Invalid JSON shape" }, { status: 502 });
  }

  const allowed = new Set(targets.map((t) => t.index));
  for (const ch of parsed.chapters) {
    if (typeof ch.index !== "number" || !allowed.has(ch.index)) {
      return Response.json(
        { error: "Response contains unexpected chapter index" },
        { status: 502 },
      );
    }
    if (typeof ch.plainText !== "string") {
      return Response.json(
        { error: "Invalid chapter plainText" },
        { status: 502 },
      );
    }
    if (ch.plainText.length > MAX_PER_CHAPTER) {
      return Response.json(
        { error: `Chapter ${ch.index} exceeds maximum length` },
        { status: 502 },
      );
    }
  }

  if (parsed.chapters.length !== expected) {
    return Response.json(
      { error: `Expected ${expected} chapters in response` },
      { status: 502 },
    );
  }

  const seenIdx = new Set<number>();
  for (const ch of parsed.chapters) {
    if (seenIdx.has(ch.index)) {
      return Response.json(
        { error: "Duplicate chapter index in response" },
        { status: 502 },
      );
    }
    seenIdx.add(ch.index);
  }

  return Response.json(parsed);
}
