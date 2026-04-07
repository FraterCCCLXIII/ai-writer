import { inlineSystemPrompt, inlineUserPayload } from "@/lib/ai/prompts";
import { streamChatCompletion } from "@/lib/ai/openai-compatible";
import { resolveOpenAiFromRequest } from "@/lib/ai/server-config";
import type { InlineAction } from "@/lib/ai/types";

export const runtime = "nodejs";

const ACTIONS: InlineAction[] = [
  "rewrite",
  "expand",
  "shorten",
  "clarity",
  "tone_formal",
  "tone_casual",
  "tone_dramatic",
];

export async function POST(req: Request) {
  const body = (await req.json()) as {
    action?: InlineAction;
    selectedText?: string;
    fullChapterText?: string;
    extra?: string;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
  };

  const action = body.action;
  if (!action || !ACTIONS.includes(action)) {
    return Response.json({ error: "invalid action" }, { status: 400 });
  }

  const selectedText = body.selectedText?.trim();
  if (!selectedText) {
    return Response.json({ error: "selectedText required" }, { status: 400 });
  }

  const { apiKey, baseUrl, model } = resolveOpenAiFromRequest(body);

  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const userContent = inlineUserPayload({
    selectedText,
    fullChapterText: body.fullChapterText ?? "",
    extra: body.extra,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await streamChatCompletion({
          baseUrl,
          apiKey,
          model,
          messages: [
            { role: "system", content: inlineSystemPrompt(action) },
            { role: "user", content: userContent },
          ],
          signal: req.signal,
          onChunk: (chunk) => {
            controller.enqueue(encoder.encode(chunk.text));
          },
        });
        controller.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Stream failed";
        controller.enqueue(encoder.encode(`\n[Error] ${msg}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
