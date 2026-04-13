"use client";

import { useEffect } from "react";
import { useEditor } from "novel";
import {
  INSERT_EDITOR_EVENT,
  type InsertEditorDetail,
} from "@/lib/editor-insert-events";
import { markdownToTiptapNodes } from "@/lib/ai/markdown-to-tiptap";
import { plainTextToInsertContent } from "@/lib/plain-text-insert";

/**
 * Listens for chat panel actions and inserts text into the active TipTap editor.
 */
export function InsertFromChatBridge() {
  const { editor } = useEditor();

  useEffect(() => {
    const onInsert = (e: Event) => {
      const ce = e as CustomEvent<InsertEditorDetail>;
      const detail = ce.detail;
      if (!detail?.text || !editor || editor.isDestroyed) return;

      const text = detail.text.trim();
      if (!text) return;

      const nodes =
        detail.format === "plain-text"
          ? plainTextToInsertContent(text)
          : markdownToTiptapNodes(text);

      const chain = editor.chain().focus();

      if (detail.targetRange) {
        const docSize = editor.state.doc.content.size;
        const from = Math.max(0, Math.min(detail.targetRange.from, docSize));
        const to = Math.max(0, Math.min(detail.targetRange.to, docSize));
        if (from === to) {
          chain.setTextSelection(from);
        } else {
          chain.setTextSelection({ from, to });
        }
      }

      const shouldReplace =
        detail.mode === "replace" &&
        ((detail.targetRange &&
          detail.targetRange.from !== detail.targetRange.to) ||
          !editor.state.selection.empty);

      if (shouldReplace) {
        chain.deleteSelection().insertContent(nodes).run();
        return;
      }

      chain.insertContent(nodes).run();
    };

    window.addEventListener(
      INSERT_EDITOR_EVENT,
      onInsert as EventListener,
    );
    return () =>
      window.removeEventListener(
        INSERT_EDITOR_EVENT,
        onInsert as EventListener,
      );
  }, [editor]);

  return null;
}
