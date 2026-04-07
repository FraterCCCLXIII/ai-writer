"use client";

import { useRef, useState } from "react";
import {
  FileUp,
  FolderOpen,
  Home as HomeIcon,
  PenLine,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isElectronApp } from "@/lib/electron-bridge";
import {
  folderPathLabel,
  loadWorkspaceForEntry,
} from "@/lib/persistence";
import { WORKSPACE_FILE_NAME } from "@/lib/workspace-file";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";

export function HomeScreen() {
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const startNewProject = useProjectStore((s) => s.startNewProject);
  const startNewProjectFromPrompt = useProjectStore(
    (s) => s.startNewProjectFromPrompt,
  );
  const openPersistedWorkspace = useProjectStore(
    (s) => s.openPersistedWorkspace,
  );
  const openProjectFromJson = useProjectStore((s) => s.openProjectFromJson);
  const openFolderProject = useProjectStore((s) => s.openFolderProject);
  const fileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void (async () => {
      try {
        const text = await file.text();
        const json = JSON.parse(text) as unknown;
        openProjectFromJson(json);
        toast.success("Project opened");
      } catch (e) {
        if (
          e instanceof Error &&
          e.message === "INVALID_WORKSPACE_FILE"
        ) {
          toast.error("That file is not a valid workspace export.");
        } else {
          toast.error("Could not read that file.");
        }
      }
    })();
  };

  const submitPrompt = () => {
    const t = prompt.trim();
    if (!t) {
      toast.message("Describe your project to get started.");
      return;
    }
    startNewProjectFromPrompt(t);
    setPrompt("");
  };

  const openRecent = async (id: string) => {
    const entry = recentProjects.find((p) => p.id === id);
    if (!entry) return;
    const data = await loadWorkspaceForEntry(entry);
    if (!data) {
      toast.error("That project could not be found.");
      return;
    }
    openPersistedWorkspace(data, entry.folderPath ?? null);
  };

  const onOpenFolder = () => {
    void (async () => {
      try {
        await openFolderProject();
      } catch (e) {
        if (
          e instanceof Error &&
          e.message === "INVALID_WORKSPACE_FILE"
        ) {
          toast.error(
            `That folder does not contain a valid ${WORKSPACE_FILE_NAME} file.`,
          );
        } else {
          toast.error("Could not open that folder.");
        }
      }
    })();
  };

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/25 px-3 py-6">
        <p className="px-2 font-serif text-lg font-medium tracking-tight">
          Manuscript
        </p>
        <p className="mt-1 px-2 text-xs text-muted-foreground">
          Local writing studio
        </p>
        <nav className="mt-8 flex flex-col gap-1">
          <div
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium",
              "bg-muted text-foreground",
            )}
          >
            <HomeIcon className="h-4 w-4 shrink-0 opacity-70" />
            Home
          </div>
          <button
            type="button"
            onClick={() => startNewProject()}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PenLine className="h-4 w-4 shrink-0" />
            Blank project
          </button>
          <button
            type="button"
            onClick={onPickFile}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FileUp className="h-4 w-4 shrink-0" />
            Open file…
          </button>
          {isElectronApp() ? (
            <button
              type="button"
              onClick={onOpenFolder}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FolderOpen className="h-4 w-4 shrink-0" />
              Open folder…
            </button>
          ) : null}
        </nav>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onFileChange}
        />
        <p className="mt-auto px-2 pt-8 text-[11px] leading-relaxed text-muted-foreground">
          {isElectronApp()
            ? `Desktop: projects can live in a folder as ${WORKSPACE_FILE_NAME}. The app also keeps a local index for recent items.`
            : "Workspaces live in this browser. Each project is saved separately."}
        </p>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-xl">
            <div className="mb-6 flex items-center gap-2 text-muted-foreground">
              <Sparkles className="h-5 w-5 shrink-0 text-foreground/80" />
              <span className="text-xs font-medium uppercase tracking-wider">
                New project
              </span>
            </div>
            <h1 className="font-serif text-2xl font-medium tracking-tight sm:text-3xl">
              What are you writing?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Describe the story, tone, or outline. We will create a workspace
              and place your prompt in the first chapter as a starting point.
            </p>
            <label htmlFor="home-prompt" className="sr-only">
              Project prompt
            </label>
            <textarea
              id="home-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitPrompt();
                }
              }}
              placeholder="e.g. A literary novel about a lighthouse keeper who discovers letters in a wall…"
              rows={6}
              className="mt-5 w-full resize-y rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" className="gap-2" onClick={submitPrompt}>
                <Sparkles className="h-4 w-4" />
                Start project
              </Button>
              <span className="text-xs text-muted-foreground">
                ⌘↵ or Ctrl+Enter to start
              </span>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-border bg-muted/15 px-6 py-5 sm:px-10">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recent projects
          </h2>
          {recentProjects.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No projects yet. Start one above or create a blank manuscript.
            </p>
          ) : (
            <ScrollArea className="mt-3 h-[min(220px,32vh)] pr-3">
              <ul className="flex flex-col gap-1">
                {recentProjects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => void openRecent(p.id)}
                      className="flex w-full max-w-2xl flex-col items-start rounded-md border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/60"
                    >
                      <span className="truncate text-sm font-medium">
                        {p.title || "Untitled"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.folderPath
                          ? `${folderPathLabel(p.folderPath)} · ${new Date(
                              p.updatedAt,
                            ).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}`
                          : new Date(p.updatedAt).toLocaleString(undefined, {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
