import { chatSystemPrompt, chatUserPayload } from "@/lib/ai/prompts";
import { streamChatCompletion } from "@/lib/ai/openai-compatible";
import type { ChatContext } from "@/lib/ai/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    message?: string;
    context?: ChatContext;
  };

  const message = body.message?.trim();
  if (!message) {
    return Response.json({ error: "message required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl =
    process.env.OPENAI_BASE_URL?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const context: ChatContext = body.context ?? {
    selectedText: null,
    chapterTitle: null,
    chapterPlainText: "",
  };

  const userContent = chatUserPayload({ message, context });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        await streamChatCompletion({
          baseUrl,
          apiKey,
          model,
          messages: [
            { role: "system", content: chatSystemPrompt() },
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
