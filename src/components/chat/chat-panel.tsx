"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ChevronUp,
  Copy,
  Loader2,
  Replace,
  Send,
  X,
  Sparkles,
  MessageSquare,
  Pencil,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectStore } from "@/store/project-store";
import { jsonToPlainText } from "@/lib/tiptap-plain-text";
import { dispatchInsertToEditor } from "@/lib/editor-insert-events";
import { getAiOverridesForRequest } from "@/lib/ai-settings";
import { parseBuildChaptersMessage } from "@/lib/generate-chapters-from-research";
import {
  getLiveNotesAnchorParams,
  relevantResearchSnippetsForChat,
} from "@/lib/research/live-notes";
import { LiveNotesPanel } from "@/components/chat/live-notes-panel";
import { AgentTodos } from "@/components/chat/agent-todos";
import { runAgentTurn } from "@/lib/ai/agent-loop";
import { getModeNudge } from "@/lib/ai/intent-classifier";
import type { AgentWorkspaceSnapshot, ChatMode } from "@/lib/ai/types";

function selectionPreview(text: string, max = 72) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

const MODE_CONFIG: {
  mode: ChatMode;
  label: string;
  icon: React.ReactNode;
  title: string;
}[] = [
  {
    mode: "ask",
    label: "Ask",
    icon: <MessageSquare className="h-3 w-3" />,
    title: "Discuss, brainstorm, and get feedback",
  },
  {
    mode: "edit",
    label: "Edit",
    icon: <Pencil className="h-3 w-3" />,
    title: "Make targeted edits to chapters",
  },
  {
    mode: "agent",
    label: "Agent",
    icon: <Sparkles className="h-3 w-3" />,
    title: "Autonomous multi-step writing tasks",
  },
];

export function ChatPanel() {
  const chatMessages = useProjectStore((s) => s.chatMessages);
  const chapters = useProjectStore((s) => s.chapters);
  const researchDocuments = useProjectStore((s) => s.researchDocuments);
  const appendChatMessage = useProjectStore((s) => s.appendChatMessage);
  const patchChatMessage = useProjectStore((s) => s.patchChatMessage);
  const flushWorkspace = useProjectStore((s) => s.flushWorkspace);
  const editorContext = useProjectStore((s) => s.editorContext);
  const setEditorContext = useProjectStore((s) => s.setEditorContext);
  const setPendingRevision = useProjectStore((s) => s.setPendingRevision);
  const clearChat = useProjectStore((s) => s.clearChat);
  const chatMode = useProjectStore((s) => s.chatMode);
  const setChatMode = useProjectStore((s) => s.setChatMode);
  const agentTodos = useProjectStore((s) => s.agentTodos);
  const setAgentTodos = useProjectStore((s) => s.setAgentTodos);
  const applyWriteMutations = useProjectStore((s) => s.applyWriteMutations);
  const activeChapterId = useProjectStore((s) => s.activeChapterId);

  const [chatTab, setChatTab] = useState("chat");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState<{
    id: string;
    text: string;
  } | null>(null);
  /** Mode nudge shown when the classifier detects a mismatch. */
  const [modeNudge, setModeNudge] = useState<{
    suggestedMode: ChatMode;
    label: string;
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

  // Classify intent as the user types to show mode nudges.
  useEffect(() => {
    if (!input.trim() || streaming) {
      setModeNudge(null);
      return;
    }
    const nudge = getModeNudge(input, chatMode);
    setModeNudge(nudge);
  }, [input, chatMode, streaming]);

  /** Build a snapshot of chapters + research for agent calls. */
  const buildSnapshot = (): AgentWorkspaceSnapshot => ({
    chapters: chapters.map((c) => ({
      id: c.id,
      title: c.title,
      order: c.order,
      plainText: jsonToPlainText(c.content),
    })),
    researchDocuments: researchDocuments.map((d) => ({
      id: d.id,
      title: d.title,
      plainText: jsonToPlainText(d.content),
    })),
  });

  /** Build message history for agent turns (excludes empty messages). */
  const buildMessageHistory = (
    latestUserMessage: string,
  ): { role: "user" | "assistant"; content: string }[] => {
    const history = chatMessages
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));
    // Replace or append the latest user message.
    const last = history[history.length - 1];
    if (last?.role === "user") {
      history[history.length - 1] = { role: "user", content: latestUserMessage };
    } else {
      history.push({ role: "user", content: latestUserMessage });
    }
    return history;
  };

  const sendAgent = async (text: string) => {
    const snap = useProjectStore.getState();
    const snapshot = buildSnapshot();
    const messages = buildMessageHistory(text);

    appendChatMessage({ role: "user", content: text });
    const assistant = appendChatMessage({ role: "assistant", content: "" });
    setStreaming(true);
    setStreamBuffer({ id: assistant.id, text: "" });
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    let acc = "";

    await runAgentTurn({
      messages,
      mode: snap.chatMode,
      snapshot,
      signal: abortRef.current.signal,
      onChunk: (chunk) => {
        acc += chunk;
        setStreamBuffer({ id: assistant.id, text: acc });
        patchChatMessage(assistant.id, acc);
      },
      onResult: ({ mutations, todos }) => {
        if (todos.length > 0) setAgentTodos(todos);
        if (mutations.length > 0) {
          applyWriteMutations(mutations);
          toast.success(
            mutations.length === 1
              ? "1 chapter updated"
              : `${mutations.length} chapters updated`,
          );
        }
        flushWorkspace();
      },
      onError: (msg) => {
        const errText = `[Error] ${msg}`;
        acc = errText;
        patchChatMessage(assistant.id, errText);
        setStreamBuffer({ id: assistant.id, text: errText });
        flushWorkspace();
      },
    });

    setStreaming(false);
    setStreamBuffer(null);
  };

  const sendAskEdit = async (text: string) => {
    const snap = useProjectStore.getState();
    const ctxAtSend = snap.editorContext;
    const chapterForContext = snap.chapters.find(
      (c) => c.id === snap.activeChapterId,
    );
    const { anchor: liveAnchor, excludeResearchIds } = getLiveNotesAnchorParams({
      chapters: snap.chapters,
      activeChapterId: snap.activeChapterId,
      researchDocuments: snap.researchDocuments,
      activeResearchId: snap.activeResearchId,
      editorContext: snap.editorContext,
    });
    const relevantResearchSnippets = relevantResearchSnippetsForChat(
      liveAnchor,
      snap.researchDocuments,
      excludeResearchIds,
      6,
    );

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
            relevantResearchSnippets,
          },
          ...getAiOverridesForRequest(snap.chatMode),
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

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const buildRange = parseBuildChaptersMessage(text);
    if (buildRange) {
      setInput("");
      window.dispatchEvent(
        new CustomEvent("ai-writer:generate-chapters", {
          detail: { start: buildRange.start, end: buildRange.end },
        }),
      );
      return;
    }

    setInput("");
    setModeNudge(null);

    if (chatMode === "agent") {
      await sendAgent(text);
    } else {
      await sendAskEdit(text);
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

  const contextChapterTitle = editorContext
    ? chapters.find((c) => c.id === editorContext.chapterId)?.title ?? null
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background">
      <Tabs
        value={chatTab}
        onValueChange={setChatTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="sticky top-0 z-20 flex shrink-0 items-center justify-between border-b border-border bg-background px-3 py-2">
          <TabsList className="h-8 max-w-[min(100%,18rem)] flex-wrap gap-0.5 bg-transparent p-0 sm:max-w-none">
            <TabsTrigger value="chat" className="text-xs">
              Chat
            </TabsTrigger>
            <TabsTrigger value="live-notes" className="text-xs">
              Live Notes
            </TabsTrigger>
          </TabsList>
          {chatTab === "chat" ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 text-xs text-muted-foreground"
              onClick={() => {
                clearChat();
                setAgentTodos([]);
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>

        <TabsContent
          value="chat"
          className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden px-0 data-[state=inactive]:hidden"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Agent todos */}
            <AgentTodos todos={agentTodos} />

            <div className="chat-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4">
              <div className="px-0 pb-2 pt-3">
                <p className="text-sm text-muted-foreground">
                  {chatMode === "agent"
                    ? "Describe a multi-step writing task — I'll plan and execute it."
                    : chatMode === "edit"
                      ? "What would you like to edit?"
                      : "What can I help you with?"}
                </p>
                {chatMode !== "agent" && (
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
                        setInput(
                          "Suggest three directions this scene could take.",
                        )
                      }
                    >
                      Spark ideas
                    </Button>
                  </div>
                )}
                {chatMode === "agent" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 rounded-full text-xs"
                      onClick={() =>
                        setInput(
                          "Read all my chapters and suggest structural improvements.",
                        )
                      }
                    >
                      Review structure
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 rounded-full text-xs"
                      onClick={() =>
                        setInput(
                          "Search my research and draft a new chapter based on it.",
                        )
                      }
                    >
                      Draft from research
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 rounded-full text-xs"
                      onClick={() =>
                        setInput(
                          "Go through each chapter and fix any inconsistencies in tone.",
                        )
                      }
                    >
                      Fix tone consistency
                    </Button>
                  </div>
                )}
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
              <div className="overflow-hidden rounded-lg border border-border bg-background shadow-sm">
                {editorContext ? (
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/20 px-2 py-2">
                    <div
                      className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-border bg-muted/60 py-0.5 pl-2.5 pr-0.5 text-xs text-foreground shadow-sm"
                      title={editorContext.text}
                    >
                      <span className="shrink-0 font-medium text-muted-foreground">
                        Selection
                      </span>
                      {contextChapterTitle ? (
                        <>
                          <span
                            className="shrink-0 text-muted-foreground"
                            aria-hidden
                          >
                            ·
                          </span>
                          <span className="max-w-[8rem] shrink-0 truncate text-muted-foreground">
                            {contextChapterTitle}
                          </span>
                        </>
                      ) : null}
                      <span className="mx-0.5 max-w-[min(100%,14rem)] truncate text-foreground/90">
                        {selectionPreview(editorContext.text)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                        title="Remove reference"
                        onClick={() => setEditorContext(null)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Mode nudge */}
                {modeNudge ? (
                  <div className="flex items-center gap-2 border-b border-border bg-muted/10 px-3 py-1.5">
                    <span className="text-xs text-muted-foreground">
                      Looks like{" "}
                      <strong className="text-foreground">
                        {modeNudge.label}
                      </strong>{" "}
                      mode might be a better fit.
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setChatMode(modeNudge.suggestedMode);
                        setModeNudge(null);
                      }}
                    >
                      Switch
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground"
                      onClick={() => setModeNudge(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : null}

                <div className="flex gap-2 p-2">
                  <Input
                    data-chat-input
                    className="min-w-0 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    placeholder={
                      chatMode === "agent"
                        ? "Describe a task for the agent…"
                        : chatMode === "edit"
                          ? "What should I edit?"
                          : "Type a message"
                    }
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
                    className="shrink-0"
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

                {/* Mode selector dropdown */}
                <div className="flex items-center border-t border-border px-2 py-1.5">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none"
                      >
                        {MODE_CONFIG.find((m) => m.mode === chatMode)?.icon}
                        <span className="font-medium">
                          {MODE_CONFIG.find((m) => m.mode === chatMode)?.label}
                        </span>
                        <ChevronUp className="h-3 w-3 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" className="w-52">
                      {MODE_CONFIG.map(({ mode, label, icon, title }) => (
                        <DropdownMenuItem
                          key={mode}
                          onSelect={() => {
                            setChatMode(mode);
                            if (mode !== "agent") setAgentTodos([]);
                          }}
                          className="flex items-start gap-2.5 py-2"
                        >
                          <span className="mt-0.5 shrink-0">{icon}</span>
                          <span className="flex flex-col gap-0.5">
                            <span className="font-medium leading-none">{label}</span>
                            <span className="text-xs text-muted-foreground leading-snug">
                              {title}
                            </span>
                          </span>
                          {chatMode === mode && (
                            <Check className="ml-auto mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                          )}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {!editorContext && chatMode !== "agent" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Tip: select text in the editor to add a reference bubble here.
                </p>
              ) : null}
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="live-notes"
          className="chat-scroll mt-0 flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-4 data-[state=inactive]:hidden"
        >
          <p className="mb-3 text-xs text-muted-foreground">
            Research excerpts ranked by overlap with your current writing
            (selection, or the last stretch of the open document).
          </p>
          <LiveNotesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
