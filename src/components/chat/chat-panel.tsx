"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Copy,
  Loader2,
  Replace,
  Send,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectStore } from "@/store/project-store";
import { jsonToPlainText } from "@/lib/tiptap-plain-text";
import { dispatchInsertToEditor } from "@/lib/editor-insert-events";

export function ChatPanel() {
  const chatMessages = useProjectStore((s) => s.chatMessages);
  const appendChatMessage = useProjectStore((s) => s.appendChatMessage);
  const patchChatMessage = useProjectStore((s) => s.patchChatMessage);
  const flushWorkspace = useProjectStore((s) => s.flushWorkspace);
  const editorContext = useProjectStore((s) => s.editorContext);
  const setEditorContext = useProjectStore((s) => s.setEditorContext);
  const setPendingRevision = useProjectStore((s) => s.setPendingRevision);
  const clearChat = useProjectStore((s) => s.clearChat);

  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  /** Local buffer so the UI updates every chunk (Zustand + async stream can batch poorly). */
  const [streamBuffer, setStreamBuffer] = useState<{
    id: string;
    text: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, streamBuffer?.text]);

  useEffect(() => {
    const onFocus = () => {
      document.querySelector<HTMLInputElement>("[data-chat-input]")?.focus();
    };
    window.addEventListener("ai-writer:focus-chat", onFocus);
    return () => window.removeEventListener("ai-writer:focus-chat", onFocus);
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    const snap = useProjectStore.getState();
    const ctxAtSend = snap.editorContext;
    const chapterForContext = snap.chapters.find(
      (c) => c.id === snap.activeChapterId,
    );
    setInput("");
    appendChatMessage({ role: "user", content: text });
    const assistant = appendChatMessage({ role: "assistant", content: "" });
    setStreaming(true);
    setStreamBuffer({ id: assistant.id, text: "" });
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    let acc = "";
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          context: {
            selectedText: ctxAtSend?.text ?? null,
            chapterTitle: chapterForContext?.title ?? null,
            chapterPlainText: chapterForContext
              ? jsonToPlainText(chapterForContext.content)
              : "",
          },
        }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No body");
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setStreamBuffer({ id: assistant.id, text: acc });
        patchChatMessage(assistant.id, acc);
      }
      const trimmed = acc.trim();
      if (
        ctxAtSend &&
        snap.activeChapterId === ctxAtSend.chapterId &&
        trimmed &&
        !trimmed.startsWith("[Error]")
      ) {
        setPendingRevision({
          chapterId: ctxAtSend.chapterId,
          from: ctxAtSend.from,
          to: ctxAtSend.to,
          replacementText: trimmed,
          assistantMessageId: assistant.id,
        });
      }
      flushWorkspace();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const msg = e instanceof Error ? e.message : "Request failed";
      acc = `[Error] ${msg}`;
      patchChatMessage(assistant.id, acc);
      setStreamBuffer({ id: assistant.id, text: acc });
      flushWorkspace();
    } finally {
      setStreaming(false);
      setStreamBuffer(null);
    }
  };

  const messageBody = (id: string, role: "user" | "assistant", stored: string) => {
    if (role === "assistant" && streamBuffer?.id === id) {
      return streamBuffer.text;
    }
    return stored;
  };

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background">
      <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-border bg-background px-3 pt-3">
          <TabsList className="h-8">
            <TabsTrigger value="chat" className="text-xs">
              Chat
            </TabsTrigger>
            <TabsTrigger value="review" className="text-xs">
              Review
            </TabsTrigger>
            <TabsTrigger value="audio" className="text-xs">
              Audio
            </TabsTrigger>
          </TabsList>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => clearChat()}
          >
            Clear
          </Button>
        </div>

        <TabsContent
          value="chat"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden px-0 data-[state=inactive]:hidden"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4">
              <div className="px-0 pb-2 pt-3">
                <p className="text-sm text-muted-foreground">
                  What can I help you with?
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full text-xs"
                    onClick={() =>
                      setInput("Edit my writing for clarity and rhythm.")
                    }
                  >
                    Edit my writing
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full text-xs"
                    onClick={() =>
                      setInput("Write the next paragraph in the same voice.")
                    }
                  >
                    Write something new
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 rounded-full text-xs"
                    onClick={() =>
                      setInput("Suggest three directions this scene could take.")
                    }
                  >
                    Spark ideas
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3 pb-4 pt-1">
                {chatMessages.map((m) => {
                  const display =
                    m.role === "assistant"
                      ? messageBody(m.id, m.role, m.content)
                      : m.content;

                  const streamingWaiting =
                    streaming &&
                    m.role === "assistant" &&
                    streamBuffer?.id === m.id &&
                    streamBuffer.text === "";

                  const canUseAssistantTools =
                    m.role === "assistant" &&
                    display.trim().length > 0 &&
                    !display.trim().startsWith("[Error]");

                  return (
                    <div key={m.id} className="space-y-1.5">
                      <div
                        className={
                          m.role === "user"
                            ? "ml-6 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                            : "mr-2 whitespace-pre-wrap rounded-lg border border-border px-3 py-2 text-sm"
                        }
                      >
                        {display || (streamingWaiting ? "…" : "")}
                      </div>
                      {canUseAssistantTools && (
                        <div className="mr-2 flex flex-wrap items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            title="Insert at cursor"
                            onClick={() =>
                              dispatchInsertToEditor({
                                text: display,
                                mode: "insert",
                              })
                            }
                          >
                            <ArrowDownToLine className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            title="Replace selection"
                            onClick={() =>
                              dispatchInsertToEditor({
                                text: display,
                                mode: "replace",
                              })
                            }
                          >
                            <Replace className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground"
                            title="Copy"
                            onClick={() => void copyMessage(display)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="sticky bottom-0 z-20 shrink-0 border-t border-border bg-background p-3">
              {editorContext ? (
                <div className="mb-3 rounded-lg border border-border bg-muted/25 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Selected text
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                      title="Remove context"
                      onClick={() => setEditorContext(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="chat-scroll mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {editorContext.text}
                  </p>
                </div>
              ) : null}
              <div className="flex gap-2">
                <Input
                  data-chat-input
                  placeholder="Type a message"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  disabled={streaming}
                />
                <Button
                  type="button"
                  size="icon"
                  disabled={streaming || !input.trim()}
                  onClick={() => void send()}
                >
                  {streaming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {!editorContext ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Tip: select text in the editor to attach it as context.
                </p>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="review"
          className="chat-scroll mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-4 data-[state=inactive]:hidden"
        >
          <p className="text-sm text-muted-foreground">
            Review mode is coming soon — line edits, comments, and suggestions in
            one place.
          </p>
        </TabsContent>
        <TabsContent
          value="audio"
          className="chat-scroll mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-4 data-[state=inactive]:hidden"
        >
          <p className="text-sm text-muted-foreground">
            Audio playback and dictation will live here.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
