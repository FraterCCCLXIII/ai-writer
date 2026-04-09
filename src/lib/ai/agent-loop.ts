"use client";

import type {
  AgentWorkspaceSnapshot,
  ChatMode,
  TodoItem,
  WriteMutation,
} from "./types";
import { getAiOverridesForRequest } from "@/lib/ai-settings";

export type AgentLoopParams = {
  /** Full conversation history. */
  messages: { role: "user" | "assistant"; content: string }[];
  mode: ChatMode;
  snapshot: AgentWorkspaceSnapshot;
  signal?: AbortSignal;
  /** Called with each streamed text chunk as it arrives. */
  onChunk: (text: string) => void;
  /** Called when the agent run completes with any mutations/todos. */
  onResult: (result: { mutations: WriteMutation[]; todos: TodoItem[] }) => void;
  /** Called on unrecoverable error. */
  onError: (message: string) => void;
};

/**
 * Runs one full agent turn. Streams text to `onChunk` progressively, then
 * delivers write mutations and todos to `onResult` when complete.
 *
 * The server streams raw UTF-8 text. After all text it optionally appends:
 *   \x00{"mutations":[...],"todos":[...]}
 * The null byte (0x00) cannot appear in valid UTF-8 prose, so it is a safe
 * delimiter. Each incoming Uint8Array chunk is scanned for it.
 */
export async function runAgentTurn(params: AgentLoopParams): Promise<void> {
  const { messages, mode, snapshot, signal, onChunk, onResult, onError } =
    params;

  let res: Response;
  try {
    res = await fetch("/api/ai/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        mode,
        snapshot,
        ...getAiOverridesForRequest(mode),
      }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    onError(e instanceof Error ? e.message : "Request failed");
    return;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    onError(text || `HTTP ${res.status}`);
    return;
  }

  if (!res.body) {
    onError("Empty response body");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Scan for the null-byte delimiter within this chunk.
      const nullIdx = value.indexOf(0);

      if (nullIdx === -1) {
        // No delimiter — stream the whole chunk as text.
        const text = decoder.decode(value, { stream: true });
        if (text) onChunk(text);
      } else {
        // Delimiter found in this chunk.
        // Emit any text before it.
        if (nullIdx > 0) {
          const textPart = decoder.decode(value.slice(0, nullIdx));
          if (textPart) onChunk(textPart);
        }
        // Parse result JSON after the delimiter.
        const jsonBytes = value.slice(nullIdx + 1);
        try {
          const jsonStr = new TextDecoder().decode(jsonBytes);
          const parsed = JSON.parse(jsonStr) as {
            mutations?: WriteMutation[];
            todos?: TodoItem[];
          };
          onResult({
            mutations: parsed.mutations ?? [],
            todos: parsed.todos ?? [],
          });
        } catch {
          onResult({ mutations: [], todos: [] });
        }
        return;
      }
    }

    // Stream ended cleanly with no delimiter → no mutations/todos.
    onResult({ mutations: [], todos: [] });
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      onError(e instanceof Error ? e.message : "Stream failed");
    }
  }
}
