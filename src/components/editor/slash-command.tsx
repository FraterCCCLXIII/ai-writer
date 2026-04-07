"use client";

import {
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  MessageSquare,
  Sparkles,
  Text,
  TextQuote,
} from "lucide-react";
import { Command, createSuggestionItems, renderItems } from "novel";
import type { Editor, Range } from "@tiptap/core";
import { uploadFn } from "./image-upload";
import type { InlineAction } from "@/lib/ai/types";

function getTargetRange(editor: Editor): { from: number; to: number; text: string } {
  const { from, to, empty } = editor.state.selection;
  if (!empty) {
    return { from, to, text: editor.state.doc.textBetween(from, to, "\n") };
  }
  const $from = editor.state.selection.$from;
  const start = $from.start();
  const end = $from.end();
  return {
    from: start,
    to: end,
    text: editor.state.doc.textBetween(start, end, "\n"),
  };
}

export function buildSlashSuggestionItems(deps: {
  onInlineAi: (action: InlineAction, range: Range, editor: Editor) => void;
}) {
  return createSuggestionItems([
    {
      title: "Text",
      description: "Plain paragraph.",
      searchTerms: ["p", "paragraph"],
      icon: <Text className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run();
      },
    },
    {
      title: "Heading 1",
      description: "Large section heading.",
      searchTerms: ["h1", "title"],
      icon: <Heading1 className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
      },
    },
    {
      title: "Heading 2",
      description: "Medium heading.",
      searchTerms: ["h2"],
      icon: <Heading2 className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
      },
    },
    {
      title: "Heading 3",
      description: "Small heading.",
      searchTerms: ["h3"],
      icon: <Heading3 className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
      },
    },
    {
      title: "Bullet list",
      description: "Unordered list.",
      searchTerms: ["ul"],
      icon: <List className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: "Numbered list",
      description: "Ordered list.",
      searchTerms: ["ol"],
      icon: <ListOrdered className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: "To-do list",
      description: "Checklist.",
      searchTerms: ["task", "checkbox"],
      icon: <CheckSquare className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleTaskList().run();
      },
    },
    {
      title: "Quote",
      description: "Blockquote.",
      searchTerms: ["blockquote"],
      icon: <TextQuote className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: "Code block",
      description: "Syntax-highlighted code.",
      searchTerms: ["code"],
      icon: <Code className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },
    {
      title: "Image",
      description: "Upload from disk.",
      searchTerms: ["photo", "picture"],
      icon: <ImageIcon className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return;
          const pos = editor.view.state.selection.from;
          uploadFn(file, editor.view, pos);
        };
        input.click();
      },
    },
    {
      title: "AI: Rewrite",
      description: "Rewrite block or selection.",
      searchTerms: ["ai", "rewrite"],
      icon: <Sparkles className="h-4 w-4" />,
      command: ({ editor, range }) => {
        const t = getTargetRange(editor);
        if (!t.text.trim()) return;
        deps.onInlineAi("rewrite", { from: t.from, to: t.to }, editor);
        editor.chain().focus().deleteRange(range).run();
      },
    },
    {
      title: "AI: Expand",
      description: "Add detail to block or selection.",
      searchTerms: ["ai", "expand"],
      icon: <Sparkles className="h-4 w-4" />,
      command: ({ editor, range }) => {
        const t = getTargetRange(editor);
        if (!t.text.trim()) return;
        deps.onInlineAi("expand", { from: t.from, to: t.to }, editor);
        editor.chain().focus().deleteRange(range).run();
      },
    },
    {
      title: "AI: Open assistant",
      description: "Open the assistant panel.",
      searchTerms: ["chat", "assistant"],
      icon: <MessageSquare className="h-4 w-4" />,
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        window.dispatchEvent(new CustomEvent("ai-writer:focus-chat"));
      },
    },
  ]);
}

export function createSlashCommandExtension(
  items: ReturnType<typeof buildSlashSuggestionItems>,
) {
  return Command.configure({
    suggestion: {
      items: () => items,
      render: renderItems,
    },
  });
}
