"use client";

import { useCallback, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import {
  EditorCommand,
  EditorCommandEmpty,
  EditorCommandItem,
  EditorCommandList,
  EditorContent,
  EditorRoot,
  handleCommandNavigation,
  handleImageDrop,
  handleImagePaste,
  ImageResizer,
  type JSONContent,
} from "novel";
import type { Editor } from "@tiptap/core";
import "katex/dist/katex.min.css";

import { baseExtensions } from "./extensions";
import {
  buildSlashSuggestionItems,
  createSlashCommandExtension,
} from "./slash-command";
import { uploadFn } from "./image-upload";
import { EditorToolbar } from "./editor-toolbar";
import { ContextHighlightBridge } from "./context-highlight-bridge";
import { RevisionReviewBridge } from "./revision-review-bridge";
import {
  FormatAndAiBubble,
  getSelectionSlice,
  getSelectionSliceFromState,
} from "./format-bubble";
import { InsertFromChatBridge } from "./insert-from-chat-bridge";
import { InlineAiPanel, type InlineAiRequest } from "./inline-ai-panel";
import { useProjectStore } from "@/store/project-store";
import type { InlineAction } from "@/lib/ai/types";
import { jsonToPlainText } from "@/lib/tiptap-plain-text";
import { normalizePastedHtmlForParagraphs } from "@/lib/plain-text-blocks";
import { stripColorFromPastedSlice } from "@/lib/strip-pasted-color";

type Props = {
  /** Now a file path rather than a chapter UUID. */
  chapterId: string;
  initialContent: JSONContent;
  focusMode?: boolean;
  surface?: "chapter" | "research";
};

export function ManuscriptEditor({
  chapterId,
  initialContent,
  focusMode = false,
  surface = "chapter",
}: Props) {
  const updateActiveFileContent = useProjectStore(
    (s) => s.updateActiveFileContent,
  );
  const setEditorContext = useProjectStore((s) => s.setEditorContext);

  const [inlineRequest, setInlineRequest] = useState<InlineAiRequest | null>(
    null,
  );

  const openInline = useCallback(
    (action: InlineAction, range: { from: number; to: number }, editor: Editor) => {
      const text = editor.state.doc.textBetween(range.from, range.to, "\n");
      if (!text.trim()) return;
      setInlineRequest({
        id: crypto.randomUUID(),
        action,
        from: range.from,
        to: range.to,
        editor,
        originalText: text,
      });
    },
    [],
  );

  const suggestionItems = useMemo(
    () =>
      buildSlashSuggestionItems({
        onInlineAi: (action, range, editor) => {
          openInline(action, range, editor);
        },
      }),
    [openInline],
  );

  const slashExt = useMemo(
    () => createSlashCommandExtension(suggestionItems),
    [suggestionItems],
  );

  const extensions = useMemo(
    () => [...baseExtensions, slashExt],
    [slashExt],
  );

  const debouncedSave = useDebouncedCallback(
    (editor: Editor) => {
      updateActiveFileContent(editor.getJSON());
    },
    500,
  );

  const onInlineFromBubble = useCallback(
    (action: InlineAction, editor: Editor) => {
      const slice = getSelectionSlice(editor);
      if (!slice) return;
      setInlineRequest({
        id: crypto.randomUUID(),
        action,
        from: slice.from,
        to: slice.to,
        editor,
        originalText: slice.text,
      });
    },
    [],
  );

  return (
    <>
      <EditorRoot>
        <EditorContent
          key={chapterId}
          slotBefore={
            !focusMode ? (
              <EditorToolbar onInline={onInlineFromBubble} />
            ) : null
          }
          slotAfter={<ImageResizer />}
          className={
            focusMode
              ? "relative flex min-h-dvh w-full max-w-none flex-col"
              : "relative flex min-h-full w-full max-w-none flex-col"
          }
          initialContent={initialContent}
          extensions={extensions}
          editorProps={{
            handleDOMEvents: {
              keydown: (_view, event) => handleCommandNavigation(event),
              mouseup: (view) => {
                const slice = getSelectionSliceFromState(view.state);
                if (slice) {
                  setEditorContext({ ...slice, filePath: chapterId });
                } else if (view.hasFocus()) {
                  setEditorContext(null);
                }
                return false;
              },
            },
            transformPastedHTML: (html) =>
              normalizePastedHtmlForParagraphs(html),
            transformPasted: (slice, view) =>
              stripColorFromPastedSlice(slice, view),
            handlePaste: (view, event) =>
              handleImagePaste(view, event, uploadFn),
            handleDrop: (view, event, _slice, moved) =>
              handleImageDrop(view, event, moved, uploadFn),
            attributes: {
              class: focusMode
                ? "prose prose-lg dark:prose-invert prose-headings:scroll-mt-28 focus:outline-none min-h-[calc(100dvh-4rem)] max-w-[52rem] mx-auto px-8 py-16 font-sans text-[1.05rem] leading-relaxed text-foreground"
                : "prose prose-lg dark:prose-invert prose-headings:scroll-mt-28 focus:outline-none min-h-[calc(100dvh-6rem)] max-w-[52rem] mx-auto px-8 py-16 font-sans text-[1.05rem] leading-relaxed text-foreground",
            },
          }}
          onUpdate={({ editor }) => {
            debouncedSave(editor);
          }}
          onFocus={({ editor }) => {
            const ctx = useProjectStore.getState().editorContext;
            if (!ctx || ctx.filePath !== chapterId) return;
            const docSize = editor.state.doc.content.size;
            const from = Math.max(0, Math.min(ctx.from, docSize));
            const to = Math.max(0, Math.min(ctx.to, docSize));
            if (from < to) {
              editor.commands.setTextSelection({ from, to });
            }
          }}
          onSelectionUpdate={({ editor }) => {
            const slice = getSelectionSlice(editor);
            if (slice) {
              setEditorContext({
                text: slice.text,
                filePath: chapterId,
                from: slice.from,
                to: slice.to,
              });
            } else if (editor.isFocused) {
              setEditorContext(null);
            }
          }}
        >
          <EditorCommand className="z-50 h-auto max-h-[330px] w-72 overflow-y-auto rounded-md border border-border bg-popover px-1 py-2 shadow-md transition-all">
            <EditorCommandEmpty className="px-2 text-sm text-muted-foreground">
              No results
            </EditorCommandEmpty>
            <EditorCommandList>
              {suggestionItems.map((item) => (
                <EditorCommandItem
                  key={item.title}
                  value={item.title}
                  onCommand={(payload) => item.command?.(payload)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm aria-selected:bg-muted"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background">
                    {item.icon}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </div>
                </EditorCommandItem>
              ))}
            </EditorCommandList>
          </EditorCommand>
          <FormatAndAiBubble onInline={onInlineFromBubble} />
          <ContextHighlightBridge chapterId={chapterId} />
          <RevisionReviewBridge chapterId={chapterId} />
          <InsertFromChatBridge />
        </EditorContent>
      </EditorRoot>
      <InlineAiPanel
        request={inlineRequest}
        fullChapterText={
          inlineRequest
            ? jsonToPlainText(inlineRequest.editor.getJSON())
            : ""
        }
        onClear={() => setInlineRequest(null)}
      />
    </>
  );
}
