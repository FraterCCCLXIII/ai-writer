"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { InlineAction } from "@/lib/ai/types";
import { plainTextToInsertContent } from "@/lib/plain-text-insert";
import { getAiOverridesForRequest } from "@/lib/ai-settings";

export type InlineAiRequest = {
  id: string;
  action: InlineAction;
  from: number;
  to: number;
  editor: Editor;
  originalText: string;
};

function labelForAction(a: InlineAction): string {
  const map: Record<InlineAction, string> = {
    rewrite: "Rewrite",
    expand: "Expand",
    shorten: "Shorten",
    clarity: "Improve clarity",
    tone_formal: "Tone: formal",
    tone_casual: "Tone: casual",
    tone_dramatic: "Tone: dramatic",
  };
  return map[a];
}

export function InlineAiPanel({
  request,
  fullChapterText,
  onClear,
}: {
  request: InlineAiRequest | null;
  fullChapterText: string;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!request) {
      setDraft("");
      setError(null);
      setLoading(false);
      return;
    }

    setDraft("");
    setError(null);
    setLoading(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const run = async () => {
      try {
        const res = await fetch("/api/ai/inline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: request.action,
            selectedText: request.originalText,
            fullChapterText,
            ...getAiOverridesForRequest(),
          }),
          signal: abortRef.current?.signal,
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || `Request failed (${res.status})`);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");
        const dec = new TextDecoder();
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setDraft(acc);
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setLoading(false);
      }
    };

    void run();
    return () => {
      abortRef.current?.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- editor on `request` is stable for a given `id`
  }, [request?.id, request?.action, fullChapterText, request?.originalText]);

  const open = Boolean(request);

  const apply = () => {
    if (!request) return;
    const text = draft.trim();
    if (!text) return;
    request.editor
      .chain()
      .focus()
      .deleteRange({ from: request.from, to: request.to })
      .insertContent(plainTextToInsertContent(text))
      .run();
    onClear();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          abortRef.current?.abort();
          onClear();
        }
      }}
    >
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>
            {request ? labelForAction(request.action) : "Inline edit"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-0 sm:grid-cols-2">
          <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Original
            </p>
            <ScrollArea className="h-40 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="whitespace-pre-wrap">{request?.originalText ?? ""}</p>
            </ScrollArea>
          </div>
          <div className="p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Suggestion
            </p>
            <ScrollArea className="h-40 rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="whitespace-pre-wrap">
                {error ? (
                  <span className="text-destructive">{error}</span>
                ) : (
                  draft || (loading ? "…" : "")
                )}
              </p>
            </ScrollArea>
          </div>
        </div>
        <Separator />
        <div className="flex justify-end gap-2 px-6 py-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              abortRef.current?.abort();
              onClear();
            }}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={apply}
            disabled={!draft.trim() || !!error || loading}
          >
            Replace selection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
