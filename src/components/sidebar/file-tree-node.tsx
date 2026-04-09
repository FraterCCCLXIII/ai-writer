"use client";

import { useState, useRef } from "react";
import {
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  ImageIcon,
  FileCode,
  Trash2,
  Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkspaceNode } from "@/documents/workspace-types";
import { getFileExtension } from "@/lib/markdown-serialize";

function NodeIcon({ name, isFolder, isExpanded, className }: { name: string; isFolder: boolean; isExpanded: boolean; className?: string }) {
  if (isFolder) {
    return isExpanded ? <FolderOpen className={className} /> : <Folder className={className} />;
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

export function FileTreeNode({
  node,
  depth,
  activeFilePath,
  onSelect,
  onToggleFolder,
  onRename,
  onDelete,
}: {
  node: WorkspaceNode;
  depth: number;
  activeFilePath: string | null;
  onSelect: (path: string) => void;
  onToggleFolder: (path: string) => void;
  onRename: (oldPath: string, newName: string) => void;
  onDelete: (path: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isActive = node.kind === "file" && node.path === activeFilePath;
  const isFolder = node.kind === "folder";
  const isExpanded = isFolder && node.expanded;

  const handleStartRename = () => {
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 10);
  };

  const handleCommitRename = (val: string) => {
    const newName = val.trim();
    setEditing(false);
    if (newName && newName !== node.name) {
      onRename(node.path, newName);
    }
  };

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-0.5 rounded-md border border-transparent py-0.5 pr-1 text-sm",
          isActive && "border-border bg-muted/50 text-foreground",
          !isActive && "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
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
            <NodeIcon name={node.name} isFolder={isFolder} isExpanded={isExpanded} className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <span className="truncate">{node.name}</span>
          </button>
        )}

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Rename"
            onClick={(e) => {
              e.stopPropagation();
              handleStartRename();
            }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.path);
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {isFolder && isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              activeFilePath={activeFilePath}
              onSelect={onSelect}
              onToggleFolder={onToggleFolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </>
  );
}
