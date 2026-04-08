export type StreamChunk = { text: string };

/**
 * Streams assistant text from an OpenAI-compatible chat completions API.
 */
export async function streamChatCompletion(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
  onChunk: (chunk: StreamChunk) => void;
}): Promise<void> {
  const url = `${params.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      stream: true,
      messages: params.messages,
    }),
    signal: params.signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }

  if (!res.body) throw new Error("Empty response body");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const piece = json.choices?.[0]?.delta?.content;
        if (piece) params.onChunk({ text: piece });
      } catch {
        /* ignore partial JSON */
      }
    }
  }

  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const data = tail.slice(5).trim();
    if (data !== "[DONE]") {
      try {
        const json = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
        };
        const piece = json.choices?.[0]?.delta?.content;
        if (piece) params.onChunk({ text: piece });
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Non-streaming chat completion; optional JSON mode for OpenAI-compatible APIs.
 * Returns the assistant message content string (JSON text if using json_object).
 */
export async function completeChatJson(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  signal?: AbortSignal;
  /** When true, requests structured JSON (supported by OpenAI and many proxies). */
  jsonMode?: boolean;
}): Promise<string> {
  const url = `${params.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: params.model,
    stream: false,
    messages: params.messages,
  };
  if (params.jsonMode) {
    body.response_format = { type: "json_object" };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (content == null || content === "") {
    throw new Error("Empty response from model");
  }
  return content;
}
