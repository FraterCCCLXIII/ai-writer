"use client";

import { useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  FilePlus,
  FolderOpen,
  Home,
  MessageSquare,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { toast } from "sonner";
import { isElectronApp } from "@/lib/electron-bridge";
import { collectFiles } from "@/documents/workspace-types";
import { Command } from "cmdk";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useProjectStore } from "@/store/project-store";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const tree = useProjectStore((s) => s.config.tree);
  const selectFile = useProjectStore((s) => s.selectFile);
  const createFile = useProjectStore((s) => s.createFile);
  const toggleLeftSidebar = useProjectStore((s) => s.toggleLeftSidebar);
  const toggleRightSidebar = useProjectStore((s) => s.toggleRightSidebar);
  const setFocusMode = useProjectStore((s) => s.setFocusMode);
  const focusMode = useProjectStore((s) => s.focusMode);
  const goHome = useProjectStore((s) => s.goHome);
  const openFolderProject = useProjectStore((s) => s.openFolderProject);

  const allFiles = collectFiles(tree);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        hideClose
        className="overflow-hidden p-0 max-w-lg top-[18%] translate-y-0"
      >
        <Command className="rounded-lg border-none shadow-none">
          <div className="border-b border-border px-3 py-2">
            <Command.Input
              placeholder="Search commands…"
              className="flex h-10 w-full rounded-md bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              No results.
            </Command.Empty>
            <Command.Group
              heading="Files"
              className="text-xs font-medium text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
            >
              <Command.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                onSelect={() => {
                  void createFile(null, "Untitled.md");
                  setOpen(false);
                }}
              >
                <FilePlus className="h-4 w-4" />
                New file
              </Command.Item>
              {allFiles.map((f) => (
                <Command.Item
                  key={f.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                  onSelect={() => {
                    void selectFile(f.path);
                    setOpen(false);
                  }}
                >
                  <FilePlus className="h-4 w-4 opacity-60" />
                  Open: {f.path}
                </Command.Item>
              ))}
            </Command.Group>
            {isElectronApp() ? (
              <Command.Group
                heading="Project"
                className="mt-2 text-xs font-medium text-muted-foreground"
              >
                <Command.Item
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                  onSelect={() => {
                    void (async () => {
                      try {
                        await openFolderProject();
                        setOpen(false);
                      } catch (e) {
                        toast.error(
                          e instanceof Error
                            ? e.message
                            : "Could not open that folder.",
                        );
                      }
                    })();
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  Open folder…
                </Command.Item>
              </Command.Group>
            ) : null}
            <Command.Group
              heading="View"
              className="mt-2 text-xs font-medium text-muted-foreground"
            >
              <Command.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                onSelect={() => {
                  goHome();
                  setOpen(false);
                }}
              >
                <Home className="h-4 w-4" />
                Home screen
              </Command.Item>
              <Command.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                onSelect={() => {
                  toggleLeftSidebar();
                  setOpen(false);
                }}
              >
                <PanelLeft className="h-4 w-4" />
                Toggle file tree
              </Command.Item>
              <Command.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                onSelect={() => {
                  toggleRightSidebar();
                  setOpen(false);
                }}
              >
                <PanelRight className="h-4 w-4" />
                Toggle assistant
              </Command.Item>
              <Command.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                onSelect={() => {
                  setFocusMode(!focusMode);
                  setOpen(false);
                }}
              >
                {focusMode ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
                {focusMode ? "Exit focus mode" : "Enter focus mode"}
              </Command.Item>
              <Command.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-muted"
                onSelect={() => {
                  window.dispatchEvent(new CustomEvent("ai-writer:focus-chat"));
                  setOpen(false);
                }}
              >
                <MessageSquare className="h-4 w-4" />
                Focus assistant
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
