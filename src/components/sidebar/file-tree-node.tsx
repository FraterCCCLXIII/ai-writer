"use client";

import { useState, useRef, useCallback } from "react";
import {
  ChevronRight,
  EllipsisVertical,
  File,
  FilePlus,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  ImageIcon,
  FileCode,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { WorkspaceNode } from "@/documents/workspace-types";
import { displayName } from "@/documents/workspace-types";
import { getFileExtension } from "@/lib/markdown-serialize";

function NodeIcon({
  name,
  isFolder,
  isExpanded,
  className,
}: {
  name: string;
  isFolder: boolean;
  isExpanded: boolean;
  className?: string;
}) {
  if (isFolder) {
    return isExpanded ? (
      <FolderOpen className={className} />
    ) : (
      <Folder className={className} />
    );
  }
  const ext = getFileExtension(name);
  switch (ext) {
    case "md":
    case "markdown":
    case "txt":
    case "text":
      return <FileText className={className} />;
    case "pdf":
      return <File className={className} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
      return <ImageIcon className={className} />;
    case "json":
    case "js":
    case "ts":
    case "tsx":
    case "jsx":
      return <FileCode className={className} />;
    default:
      return <FileText className={className} />;
  }
}

export type DropPosition = "before" | "after" | "inside";

export type DragState = {
  sourcePath: string;
  targetPath: string | null;
  position: DropPosition | null;
};

export function FileTreeNode({
  node,
  depth,
  activeFilePath,
  dragState,
  onSelect,
  onToggleFolder,
  onRename,
  onDelete,
  onAddFile,
  onImportFile,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  node: WorkspaceNode;
  depth: number;
  activeFilePath: string | null;
  dragState: DragState | null;
  onSelect: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onRename: (oldPath: string, newName: string) => void;
  onDelete: (path: string) => void;
  onAddFile: (parentPath: string, name: string) => void;
  onImportFile: (parentPath: string) => void;
  onDragStart: (path: string) => void;
  onDragOver: (path: string, position: DropPosition) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addingChild, setAddingChild] = useState(false);
  const [newChildName, setNewChildName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const newChildInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const isActive = node.kind === "file" && node.path === activeFilePath;
  const isFolder = node.kind === "folder";
  const isExpanded = isFolder && node.expanded;
  const isDragSource = dragState?.sourcePath === node.path;
  const isDragTarget = dragState?.targetPath === node.path;
  const dropPosition = isDragTarget ? dragState?.position : null;

  const handleStartRename = useCallback(() => {
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      const val = inputRef.current?.value ?? "";
      const dotIdx = val.lastIndexOf(".");
      if (dotIdx > 0) {
        inputRef.current?.setSelectionRange(0, dotIdx);
      } else {
        inputRef.current?.select();
      }
    }, 10);
  }, []);

  const handleCommitRename = useCallback(
    (val: string) => {
      const newName = val.trim();
      setEditing(false);
      if (newName && newName !== node.name) {
        onRename(node.path, newName);
      }
    },
    [node.name, node.path, onRename],
  );

  const handleStartAddChild = useCallback(() => {
    setAddingChild(true);
    setNewChildName("");
    setTimeout(() => newChildInputRef.current?.focus(), 10);
  }, []);

  const handleCommitAddChild = useCallback(() => {
    const name = newChildName.trim();
    setAddingChild(false);
    setNewChildName("");
    if (name) {
      const finalName = !name.includes(".") ? `${name}.md` : name;
      onAddFile(node.path, finalName);
    }
  }, [newChildName, node.path, onAddFile]);

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", node.path);
      onDragStart(node.path);
    },
    [node.path, onDragStart],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";

      const rect = rowRef.current?.getBoundingClientRect();
      if (!rect) return;

      const y = e.clientY - rect.top;
      const ratio = y / rect.height;

      let pos: DropPosition;
      if (isFolder) {
        if (ratio < 0.25) pos = "before";
        else if (ratio > 0.75) pos = "after";
        else pos = "inside";
      } else {
        pos = ratio < 0.5 ? "before" : "after";
      }

      onDragOver(node.path, pos);
    },
    [isFolder, node.path, onDragOver],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDrop();
    },
    [onDrop],
  );

  return (
    <>
      <div
        ref={rowRef}
        draggable={!editing}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={onDragEnd}
        className={cn(
          "group relative flex min-w-0 items-center gap-0.5 overflow-hidden rounded-md border border-transparent py-0.5 pr-1 text-sm select-none",
          isActive && "border-border bg-muted/50 text-foreground",
          !isActive &&
            "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          isDragSource && "opacity-40",
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {/* Drop indicator lines */}
        {isDragTarget && dropPosition === "before" && (
          <div
            className="pointer-events-none absolute left-2 right-2 top-0 h-0.5 rounded-full bg-ring"
            style={{ marginLeft: `${depth * 16}px` }}
          />
        )}
        {isDragTarget && dropPosition === "after" && (
          <div
            className="pointer-events-none absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-ring"
            style={{ marginLeft: `${depth * 16}px` }}
          />
        )}
        {isDragTarget && dropPosition === "inside" && (
          <div className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-ring/50" />
        )}

        {isFolder ? (
          <button
            type="button"
            onClick={() => onToggleFolder(node.path)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-muted"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 transition-transform duration-150",
                isExpanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}

        {editing ? (
          <Input
            ref={inputRef}
            defaultValue={node.name}
            className="h-7 flex-1 text-sm"
            onBlur={(e) => handleCommitRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter")
                (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setEditing(false);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 py-1 text-left"
            onClick={() => {
              if (isFolder) {
                onToggleFolder(node.path);
              } else {
                onSelect(node.path);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              handleStartRename();
            }}
          >
            <NodeIcon
              name={node.name}
              isFolder={isFolder}
              isExpanded={isExpanded}
              className="h-3.5 w-3.5 shrink-0 opacity-60"
            />
            <span className="truncate">{displayName(node.name)}</span>
          </button>
        )}

        {isFolder && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
                onClick={(e) => e.stopPropagation()}
                aria-label="Add to folder"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right" className="w-44">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartAddChild();
                }}
              >
                <FilePlus className="mr-2 h-3.5 w-3.5" />
                New file
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onImportFile(node.path);
                }}
              >
                <FileUp className="mr-2 h-3.5 w-3.5" />
                Import file…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <EllipsisVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="right" className="w-40">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleStartRename();
              }}
            >
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.path);
              }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {isFolder && isExpanded && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              dragState={dragState}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
              onRename={onRename}
              onDelete={onDelete}
              onAddFile={onAddFile}
              onImportFile={onImportFile}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
            />
          ))}

          {addingChild && (
            <div
              className="flex items-center gap-1 py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 16 + 4}px` }}
            >
              <FilePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <Input
                ref={newChildInputRef}
                value={newChildName}
                onChange={(e) => setNewChildName(e.target.value)}
                placeholder="filename"
                className="h-7 flex-1 text-sm"
                onBlur={handleCommitAddChild}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCommitAddChild();
                  if (e.key === "Escape") {
                    setAddingChild(false);
                    setNewChildName("");
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
