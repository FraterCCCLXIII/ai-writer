"use client";

import {
  Bold,
  Code,
  Italic,
  Strikethrough,
  Underline,
} from "lucide-react";
import { EditorBubble, useEditor } from "novel";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { InlineAction } from "@/lib/ai/types";
import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";

function BubbleButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-muted",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function FormatAndAiBubble({
  onInline,
}: {
  onInline: (action: InlineAction, editor: Editor) => void;
}) {
  const { editor } = useEditor();

  if (!editor) return null;

  const runOnSelection = (action: InlineAction) => {
    onInline(action, editor);
  };

  return (
    <EditorBubble
      tippyOptions={{
        placement: "top",
      }}
      className="flex w-fit max-w-[90vw] flex-wrap items-center gap-0.5 rounded-lg border border-border bg-popover px-1 py-1 shadow-md"
    >
      <BubbleButton
        title="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </BubbleButton>
      <BubbleButton
        title="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </BubbleButton>
      <BubbleButton
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="h-4 w-4" />
      </BubbleButton>
      <BubbleButton
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </BubbleButton>
      <BubbleButton
        title="Code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="h-4 w-4" />
      </BubbleButton>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs">
            AI
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel>Edit selection</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => runOnSelection("rewrite")}>
            Rewrite
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runOnSelection("expand")}>
            Expand
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runOnSelection("shorten")}>
            Shorten
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runOnSelection("clarity")}>
            Improve clarity
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Change tone</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => runOnSelection("tone_formal")}>
            Formal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runOnSelection("tone_casual")}>
            Casual
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runOnSelection("tone_dramatic")}>
            Dramatic
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </EditorBubble>
  );
}

export function getSelectionSliceFromState(state: EditorState): {
  from: number;
  to: number;
  text: string;
} | null {
  const { from, to, empty } = state.selection;
  if (empty) return null;
  const text = state.doc.textBetween(from, to, "\n");
  if (!text.trim()) return null;
  return { from, to, text };
}

export function getSelectionSlice(editor: Editor): {
  from: number;
  to: number;
  text: string;
} | null {
  return getSelectionSliceFromState(editor.state);
}
