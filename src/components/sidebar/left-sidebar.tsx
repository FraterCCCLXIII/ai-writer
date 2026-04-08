"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookOpen, FileText, GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project-store";

function SortableChapter({
  id,
  title,
  active,
  editing,
  onSelect,
  onStartRename,
  onCommitRename,
  onRemove,
}: {
  id: string;
  title: string;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (t: string) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5",
        active && "border-border bg-muted/50",
        isDragging && "opacity-60",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label="Reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {editing ? (
        <Input
          autoFocus
          defaultValue={title}
          className="h-8 flex-1 text-sm"
          onBlur={(e) => onCommitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") onCommitRename(title);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartRename();
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="truncate">{title}</span>
        </button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        title="Delete chapter"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ResearchRow({
  title,
  active,
  editing,
  onSelect,
  onStartRename,
  onCommitRename,
  onRemove,
}: {
  title: string;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (t: string) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md border border-transparent px-1 py-0.5",
        active && "border-border bg-muted/50",
      )}
    >
      {editing ? (
        <Input
          autoFocus
          defaultValue={title}
          className="h-8 flex-1 text-sm"
          onBlur={(e) => onCommitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") onCommitRename(title);
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartRename();
          }}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
        >
          <FileText className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="truncate">{title}</span>
        </button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        title="Remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function LeftSidebar() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [researchEditingId, setResearchEditingId] = useState<string | null>(
    null,
  );
  const researchFileRef = useRef<HTMLInputElement>(null);
  const chapters = useProjectStore((s) => s.chapters);
  const activeChapterId = useProjectStore((s) => s.activeChapterId);
  const selectChapter = useProjectStore((s) => s.selectChapter);
  const addChapter = useProjectStore((s) => s.addChapter);
  const renameChapter = useProjectStore((s) => s.renameChapter);
  const removeChapter = useProjectStore((s) => s.removeChapter);
  const reorderChapters = useProjectStore((s) => s.reorderChapters);
  const researchDocuments = useProjectStore((s) => s.researchDocuments);
  const activeResearchId = useProjectStore((s) => s.activeResearchId);
  const addResearchDocument = useProjectStore((s) => s.addResearchDocument);
  const importResearchDocuments = useProjectStore(
    (s) => s.importResearchDocuments,
  );
  const renameResearchDocument = useProjectStore(
    (s) => s.renameResearchDocument,
  );
  const removeResearchDocument = useProjectStore(
    (s) => s.removeResearchDocument,
  );
  const selectResearchDocument = useProjectStore(
    (s) => s.selectResearchDocument,
  );

  const ordered = useMemo(
    () => [...chapters].sort((a, b) => a.order - b.order),
    [chapters],
  );

  const orderedResearch = useMemo(
    () => [...researchDocuments].sort((a, b) => a.order - b.order),
    [researchDocuments],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((c) => c.id === active.id);
    const newIndex = ordered.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(ordered, oldIndex, newIndex).map((c) => c.id);
    reorderChapters(next);
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Chapters
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={addChapter}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={ordered.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-1">
                {ordered.map((ch) => (
                  <SortableChapter
                    key={ch.id}
                    id={ch.id}
                    title={ch.title}
                    active={
                      ch.id === activeChapterId && activeResearchId === null
                    }
                    editing={editingId === ch.id}
                    onSelect={() => selectChapter(ch.id)}
                    onStartRename={() => setEditingId(ch.id)}
                    onCommitRename={(t) => {
                      renameChapter(ch.id, t.trim() || ch.title);
                      setEditingId(null);
                    }}
                    onRemove={() => removeChapter(ch.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Research
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label="Add research"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem
                    onClick={() => {
                      addResearchDocument();
                    }}
                  >
                    New document
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => researchFileRef.current?.click()}
                  >
                    Import files…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <input
              ref={researchFileRef}
              type="file"
              className="hidden"
              multiple
              accept=".txt,.text,.md,.markdown,.html,.htm,.json,.docx,.doc,.rtf,.rtfd"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length === 0) return;
                void (async () => {
                  const { imported, failed } =
                    await importResearchDocuments(files);
                  if (failed.length > 0) {
                    const summary =
                      failed.length === 1
                        ? failed[0]!.message
                        : `${failed.length} of ${files.length} files failed: ${failed.map((f) => f.name).join(", ")}`;
                    toast.error(summary);
                  }
                  if (imported > 0 && failed.length === 0 && files.length > 1) {
                    toast.success(
                      `Imported ${imported} research file${imported === 1 ? "" : "s"}.`,
                    );
                  }
                })();
              }}
            />
            <div className="flex flex-col gap-1 pb-4">
              {orderedResearch.length === 0 ? (
                <p className="px-2 text-[11px] leading-relaxed text-muted-foreground">
                  Add notes or import files for reference.
                </p>
              ) : (
                orderedResearch.map((doc) => (
                  <ResearchRow
                    key={doc.id}
                    title={doc.title}
                    active={doc.id === activeResearchId}
                    editing={researchEditingId === doc.id}
                    onSelect={() => selectResearchDocument(doc.id)}
                    onStartRename={() => setResearchEditingId(doc.id)}
                    onCommitRename={(t) => {
                      renameResearchDocument(doc.id, t.trim() || doc.title);
                      setResearchEditingId(null);
                    }}
                    onRemove={() => removeResearchDocument(doc.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
