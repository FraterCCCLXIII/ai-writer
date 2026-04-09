"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { useEditor } from "novel";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";
import { markdownToTiptapNodes } from "@/lib/ai/markdown-to-tiptap";
import { getScrollableAncestor } from "@/lib/scroll-parent";

/**
 * Applies chat assistant replacement text to the stored selection range, then
 * shows a floating approve/cancel bar. Cancel uses the editor history (undo).
 */
export function RevisionReviewBridge({ chapterId }: { chapterId: string }) {
  const { editor } = useEditor();
  const pendingRevision = useProjectStore((s) => s.pendingRevision);
  const setPendingRevision = useProjectStore((s) => s.setPendingRevision);

  const appliedIdRef = useRef<string | null>(null);
  const fromPosRef = useRef<number | null>(null);
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const positionFromEditor = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    try {
      // Use the end of the replaced range for vertical position (bottom of last
      // line) and the start of the range for horizontal position (left edge of
      // the replacement block).
      const endCoords = editor.view.coordsAtPos(editor.state.selection.to);
      let left = endCoords.left;
      if (fromPosRef.current !== null) {
        try {
          left = editor.view.coordsAtPos(fromPosRef.current).left;
        } catch {
          // fall back to end-position left
        }
      }
      setAnchor({ top: endCoords.bottom + 8, left });
    } catch {
      setAnchor(null);
    }
  }, [editor]);

  useEffect(() => {
    if (!pendingRevision) {
      appliedIdRef.current = null;
      fromPosRef.current = null;
      setAnchor(null);
    }
  }, [pendingRevision]);

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed || !pendingRevision) {
      setAnchor(null);
      return;
    }
    if (pendingRevision.filePath !== chapterId) return;

    const id = pendingRevision.assistantMessageId;

    if (appliedIdRef.current !== id) {
      const { from, to, replacementText } = pendingRevision;
      const max = editor.state.doc.content.size;
      if (from < 0 || to > max || from >= to || !replacementText.trim()) {
        setPendingRevision(null);
        return;
      }
      try {
        editor
          .chain()
          .focus()
          .setTextSelection({ from, to })
          .insertContent(markdownToTiptapNodes(replacementText))
          .run();
        appliedIdRef.current = id;
        fromPosRef.current = from;
      } catch {
        setPendingRevision(null);
        return;
      }
    }

    positionFromEditor();
  }, [
    editor,
    pendingRevision,
    chapterId,
    setPendingRevision,
    positionFromEditor,
  ]);

  useEffect(() => {
    if (!pendingRevision || pendingRevision.filePath !== chapterId) return;
    if (!editor || editor.isDestroyed) return;
    const onScrollOrResize = () => positionFromEditor();
    window.addEventListener("resize", onScrollOrResize);
    const scrollEl = getScrollableAncestor(editor.view.dom);
    scrollEl?.addEventListener("scroll", onScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      scrollEl?.removeEventListener("scroll", onScrollOrResize);
    };
  }, [pendingRevision, chapterId, positionFromEditor, editor]);

  const onApprove = () => {
    setPendingRevision(null);
  };

  const onCancel = () => {
    if (editor && !editor.isDestroyed) {
      editor.chain().focus().undo().run();
    }
    setPendingRevision(null);
  };

  if (
    typeof document === "undefined" ||
    !pendingRevision ||
    pendingRevision.filePath !== chapterId ||
    !anchor
  ) {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        "pointer-events-auto z-[110] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 rounded-lg border border-border bg-popover p-2 shadow-lg",
      )}
      style={{
        position: "fixed",
        top: anchor.top,
        left: anchor.left,
      }}
      role="dialog"
      aria-label="Review replacement"
    >
      <p className="text-xs text-muted-foreground">
        Keep this change in the manuscript?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          variant="default"
          onClick={onApprove}
        >
          <Check className="h-3.5 w-3.5" />
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          className="gap-1.5"
          variant="outline"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
    </div>,
    document.body,
  );
}
