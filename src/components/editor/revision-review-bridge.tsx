"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { useEditor } from "novel";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";
import { plainTextToInsertContent } from "@/lib/plain-text-insert";

/**
 * Applies chat assistant replacement text to the stored selection range, then
 * shows a floating approve/cancel bar. Cancel uses the editor history (undo).
 */
export function RevisionReviewBridge({ chapterId }: { chapterId: string }) {
  const { editor } = useEditor();
  const pendingRevision = useProjectStore((s) => s.pendingRevision);
  const setPendingRevision = useProjectStore((s) => s.setPendingRevision);

  const appliedIdRef = useRef<string | null>(null);
  const [anchor, setAnchor] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const positionFromEditor = useCallback(() => {
    if (!editor || editor.isDestroyed) return;
    try {
      const pos = editor.state.selection.to;
      const coords = editor.view.coordsAtPos(pos);
      setAnchor({
        top: coords.bottom + window.scrollY + 8,
        left: coords.left + window.scrollX,
      });
    } catch {
      setAnchor(null);
    }
  }, [editor]);

  useEffect(() => {
    if (!pendingRevision) {
      appliedIdRef.current = null;
      setAnchor(null);
    }
  }, [pendingRevision]);

  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed || !pendingRevision) {
      setAnchor(null);
      return;
    }
    if (pendingRevision.chapterId !== chapterId) return;

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
          .insertContent(plainTextToInsertContent(replacementText))
          .run();
        appliedIdRef.current = id;
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
    if (!pendingRevision || pendingRevision.chapterId !== chapterId) return;
    const onScrollOrResize = () => positionFromEditor();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [pendingRevision, chapterId, positionFromEditor]);

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
    pendingRevision.chapterId !== chapterId ||
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
