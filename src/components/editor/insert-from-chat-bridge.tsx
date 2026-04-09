"use client";

import { useEffect } from "react";
import { useEditor } from "novel";
import {
  INSERT_EDITOR_EVENT,
  type InsertEditorDetail,
} from "@/lib/editor-insert-events";
import { markdownToTiptapNodes } from "@/lib/ai/markdown-to-tiptap";

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

      const nodes = markdownToTiptapNodes(text);

      editor.chain().focus();

      if (detail.mode === "replace" && !editor.state.selection.empty) {
        editor.chain().deleteSelection().insertContent(nodes).run();
        return;
      }

      editor.chain().insertContent(nodes).run();
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
