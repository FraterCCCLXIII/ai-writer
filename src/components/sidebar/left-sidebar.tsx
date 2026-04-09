"use client";

import { useRef, useState } from "react";
import {
  FilePlus,
  FolderPlus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectStore } from "@/store/project-store";
import { FileTreeNode } from "@/components/sidebar/file-tree-node";

type NewNodeMode = null | "file" | "folder";

export function LeftSidebar() {
  const tree = useProjectStore((s) => s.config.tree);
  const activeFilePath = useProjectStore((s) => s.config.activeFilePath);
  const selectFile = useProjectStore((s) => s.selectFile);
  const createFile = useProjectStore((s) => s.createFile);
  const createFolder = useProjectStore((s) => s.createFolder);
  const renameNode = useProjectStore((s) => s.renameNode);
  const deleteNode = useProjectStore((s) => s.deleteNode);
  const toggleFolder = useProjectStore((s) => s.toggleFolder);
  const projectTitle = useProjectStore((s) => s.config.project.title);

  const [newNodeMode, setNewNodeMode] = useState<NewNodeMode>(null);
  const [newNodeName, setNewNodeName] = useState("");
  const newNodeInputRef = useRef<HTMLInputElement>(null);

  const startNewNode = (mode: "file" | "folder") => {
    setNewNodeMode(mode);
    setNewNodeName("");
    setTimeout(() => newNodeInputRef.current?.focus(), 10);
  };

  const commitNewNode = () => {
    const name = newNodeName.trim();
    if (!name || !newNodeMode) {
      setNewNodeMode(null);
      return;
    }

    const finalName =
      newNodeMode === "file" && !name.includes(".")
        ? `${name}.md`
        : name;

    if (newNodeMode === "file") {
      void createFile(null, finalName);
    } else {
      void createFolder(null, finalName);
    }

    setNewNodeMode(null);
    setNewNodeName("");
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {projectTitle || "Workspace"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label="Add file or folder"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => startNewNode("file")}>
              <FilePlus className="mr-2 h-3.5 w-3.5" />
              New file
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => startNewNode("folder")}>
              <FolderPlus className="mr-2 h-3.5 w-3.5" />
              New folder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2">
        <div className="flex flex-col gap-0.5 pb-4">
          {tree.map((node) => (
            <FileTreeNode
              key={node.id}
              node={node}
              depth={0}
              activeFilePath={activeFilePath}
              onSelect={(path) => void selectFile(path)}
              onToggleFolder={toggleFolder}
              onRename={(oldPath, newName) => void renameNode(oldPath, newName)}
              onDelete={(path) => void deleteNode(path)}
            />
          ))}

          {newNodeMode && (
            <div className="flex items-center gap-1 px-1 py-0.5">
              {newNodeMode === "folder" ? (
                <FolderPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <FilePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <Input
                ref={newNodeInputRef}
                value={newNodeName}
                onChange={(e) => setNewNodeName(e.target.value)}
                placeholder={
                  newNodeMode === "file"
                    ? "filename.md"
                    : "folder name"
                }
                className="h-7 flex-1 text-sm"
                onBlur={commitNewNode}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitNewNode();
                  if (e.key === "Escape") {
                    setNewNodeMode(null);
                    setNewNodeName("");
                  }
                }}
              />
            </div>
          )}

          {tree.length === 0 && !newNodeMode && (
            <p className="px-2 py-4 text-center text-[11px] leading-relaxed text-muted-foreground">
              This workspace is empty. Create a file or folder to get started.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
