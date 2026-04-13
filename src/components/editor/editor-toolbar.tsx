"use client";

import {
  Bold,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Loader2,
  List,
  ListOrdered,
  Mic,
  Quote,
  Redo2,
  Square,
  Strikethrough,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { useEditor } from "novel";
import type { Editor } from "@tiptap/core";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { InlineAction } from "@/lib/ai/types";
import type { DictationPhase } from "@/lib/dictation/types";

function ToolbarIconButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

type Props = {
  onInline: (action: InlineAction, editor: Editor) => void;
  dictation?: {
    available: boolean;
    enabled: boolean;
    phase: DictationPhase;
    onToggle: (payload: {
      mode: "insert" | "replace";
      targetRange?: { from: number; to: number };
    }) => void;
  };
};

export function EditorToolbar({ onInline, dictation }: Props) {
  const { editor } = useEditor();

  if (!editor) return null;

  const runInline = (action: InlineAction) => onInline(action, editor);

  const headingLabel = editor.isActive("heading", { level: 1 })
    ? "Heading 1"
    : editor.isActive("heading", { level: 2 })
      ? "Heading 2"
      : editor.isActive("heading", { level: 3 })
        ? "Heading 3"
        : "Paragraph";

  return (
    <div className="sticky top-0 z-40 flex min-h-12 w-full shrink-0 items-center justify-center border-b border-border bg-background px-2">
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex max-w-full flex-wrap items-center justify-center gap-0.5"
      >
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs font-normal text-muted-foreground"
          >
            <Type className="h-3.5 w-3.5" />
            <span className="max-w-[7rem] truncate">{headingLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem
            onClick={() =>
              editor.chain().focus().setParagraph().run()
            }
          >
            Paragraph
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
          >
            <Heading1 className="mr-2 inline h-4 w-4" />
            Heading 1
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 className="mr-2 inline h-4 w-4" />
            Heading 2
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            <Heading3 className="mr-2 inline h-4 w-4" />
            Heading 3
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarIconButton
        title="Bold (⌘B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton
        title="Italic (⌘I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton
        title="Underline"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <Underline className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton
        title="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton
        title="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="h-4 w-4" />
      </ToolbarIconButton>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarIconButton
        title="Bullet list"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton
        title="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton
        title="Task list"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <CheckSquare className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton
        title="Quote"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-4 w-4" />
      </ToolbarIconButton>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarIconButton
        title="Undo"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarIconButton>
      <ToolbarIconButton
        title="Redo"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarIconButton>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs">
            AI
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Edit selection</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => runInline("rewrite")}>
            Rewrite
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runInline("expand")}>
            Expand
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runInline("shorten")}>
            Shorten
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runInline("clarity")}>
            Improve clarity
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Change tone</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => runInline("tone_formal")}>
            Formal
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runInline("tone_casual")}>
            Casual
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => runInline("tone_dramatic")}>
            Dramatic
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dictation?.available ? (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <Button
            type="button"
            variant={dictation.phase === "recording" ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-8 gap-1.5 px-2 text-xs",
              dictation.phase === "recording" && "border border-border text-foreground",
            )}
            disabled={!dictation.enabled || dictation.phase === "transcribing" || dictation.phase === "rewriting"}
            title={
              !dictation.enabled
                ? "Enable dictation in Settings to record in the desktop app."
                : editor.state.selection.empty
                  ? "Start or stop dictation and insert at the cursor."
                  : "Start or stop dictation and replace the current selection."
            }
            onClick={() =>
              dictation.onToggle({
                mode: editor.state.selection.empty ? "insert" : "replace",
                targetRange: {
                  from: editor.state.selection.from,
                  to: editor.state.selection.to,
                },
              })
            }
          >
            {dictation.phase === "recording" ? (
              <Square className="h-3.5 w-3.5 fill-current text-red-500" />
            ) : dictation.phase === "transcribing" ||
              dictation.phase === "rewriting" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mic className="h-3.5 w-3.5" />
            )}
            <span>
              {dictation.phase === "recording"
                ? "Stop"
                : dictation.phase === "transcribing"
                  ? "Transcribing"
                  : dictation.phase === "rewriting"
                    ? "Polishing"
                    : "Dictate"}
            </span>
          </Button>
        </>
      ) : null}
      </div>
    </div>
  );
}
