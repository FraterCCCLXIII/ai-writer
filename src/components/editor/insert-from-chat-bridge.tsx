"use client";

import { useEffect } from "react";
import { useEditor, type JSONContent } from "novel";
import {
  INSERT_EDITOR_EVENT,
  type InsertEditorDetail,
} from "@/lib/editor-insert-events";
import { splitPlainTextBlocks } from "@/lib/plain-text-blocks";

function plainBlocksToParagraphs(blocks: string[]): JSONContent[] {
  return blocks.map((block) => ({
    type: "paragraph",
    content: block ? [{ type: "text", text: block, marks: [] }] : [],
  }));
}

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

      const blocks = splitPlainTextBlocks(text);
      if (!blocks.length) return;

      const paragraphs = plainBlocksToParagraphs(blocks);

      editor.chain().focus();

      if (detail.mode === "replace" && !editor.state.selection.empty) {
        editor.chain().deleteSelection().insertContent(paragraphs).run();
        return;
      }

      editor.chain().insertContent(paragraphs).run();
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
