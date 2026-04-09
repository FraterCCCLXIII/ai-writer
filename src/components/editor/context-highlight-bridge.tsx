"use client";

import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { useEditor } from "novel";
import { contextHighlightPluginKey } from "@/components/editor/context-highlight";
import { useProjectStore } from "@/store/project-store";

function applyContextDecoration(
  editor: Editor,
  chapterId: string,
  editorContext: ReturnType<typeof useProjectStore.getState>["editorContext"],
) {
  const ctx =
    editorContext?.filePath === chapterId ? editorContext : null;
  const showPin = Boolean(ctx && !editor.isFocused);
  const tr = editor.state.tr.setMeta(
    contextHighlightPluginKey,
    showPin ? { from: ctx!.from, to: ctx!.to } : null,
  );
  editor.view.dispatch(tr);
}

/**
 * Syncs pinned editor context from the store to ProseMirror decorations so the
 * selection stays visually highlighted when focus moves to the chat panel.
 */
export function ContextHighlightBridge({ chapterId }: { chapterId: string }) {
  const { editor } = useEditor();
  const editorContext = useProjectStore((s) => s.editorContext);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    const refresh = () => {
      applyContextDecoration(
        editor,
        chapterId,
        useProjectStore.getState().editorContext,
      );
    };

    editor.on("focus", refresh);
    editor.on("blur", refresh);
    refresh();

    return () => {
      editor.off("focus", refresh);
      editor.off("blur", refresh);
    };
  }, [editor, chapterId, editorContext]);

  return null;
}
