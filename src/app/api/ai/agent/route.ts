import { streamText, stepCountIs } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { resolveOpenAiFromRequest } from "@/lib/ai/server-config";
import {
  buildWritingTools,
  type AgentSessionState,
} from "@/lib/ai/agent-tools";
import { agentSystemPrompt } from "@/lib/ai/prompts";
import type {
  AgentWorkspaceSnapshot,
  ChatMode,
  TodoItem,
  WriteMutation,
} from "@/lib/ai/types";

export const runtime = "nodejs";

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(req: Request) {
  const body = (await req.json()) as {
    messages?: IncomingMessage[];
    mode?: ChatMode;
    snapshot?: AgentWorkspaceSnapshot;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
  };

  const messages = body.messages;
  if (!messages || messages.length === 0) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  const { apiKey, baseUrl, model } = resolveOpenAiFromRequest(body);
  if (!apiKey) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 },
    );
  }

  const mode: ChatMode = body.mode ?? "agent";
  const snapshot: AgentWorkspaceSnapshot = body.snapshot ?? {
    chapters: [],
    researchDocuments: [],
  };

  const state: AgentSessionState = {
    snapshot,
    mutations: [] as WriteMutation[],
    todos: [] as TodoItem[],
  };

  const tools = buildWritingTools(state);

  const provider = createOpenAICompatible({
    name: "custom",
    baseURL: baseUrl,
    apiKey,
  });

  const result = streamText({
    model: provider(model),
    system: agentSystemPrompt(mode),
    messages,
    tools,
    stopWhen: stepCountIs(10),
  });

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  (async () => {
    try {
      for await (const chunk of result.textStream) {
        await writer.write(encoder.encode(chunk));
      }
      // After all text is streamed, emit mutations + todos as a special delimiter line.
      if (state.mutations.length > 0 || state.todos.length > 0) {
        const resultLine =
          "\x00" +
          JSON.stringify({
            mutations: state.mutations,
            todos: state.todos,
          });
        await writer.write(encoder.encode(resultLine));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stream error";
      await writer.write(encoder.encode(`\n[Error] ${msg}`));
    } finally {
      await writer.close();
    }
  })().catch(() => {
    void writer.close();
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
