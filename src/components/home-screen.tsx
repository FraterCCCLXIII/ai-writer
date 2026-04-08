"use client";

import { useMemo, useRef, useState } from "react";
import {
  FileText,
  FileUp,
  FolderOpen,
  Home as HomeIcon,
  Library,
  PenLine,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { AppMenu } from "@/components/app-menu";
import { ElectronTitleBar } from "@/components/electron-title-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isElectronApp } from "@/lib/electron-bridge";
import {
  folderPathLabel,
  loadWorkspaceForEntry,
} from "@/lib/persistence";
import { FILE_PICKER_ACCEPT_ALL } from "@/lib/document-import/document-import-constants";
import { WORKSPACE_FILE_NAME } from "@/lib/workspace-file";
import { parsePersistedWorkspace } from "@/lib/workspace-schema";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";

type HomeTab = "new" | "all";

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
  const openImportedFile = useProjectStore((s) => s.openImportedFile);
  const workspaceFileRef = useRef<HTMLInputElement>(null);
  const openFileRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [homeTab, setHomeTab] = useState<HomeTab>("new");
  const [allProjectsSearch, setAllProjectsSearch] = useState("");

  const filteredAllProjects = useMemo(() => {
    const q = allProjectsSearch.trim().toLowerCase();
    if (!q) return recentProjects;
    return recentProjects.filter((p) => {
      const title = (p.title || "Untitled").toLowerCase();
      const path = p.folderPath
        ? folderPathLabel(p.folderPath).toLowerCase()
        : "";
      const dateStr = new Date(p.updatedAt)
        .toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
        .toLowerCase();
      return (
        title.includes(q) ||
        path.includes(q) ||
        dateStr.includes(q) ||
        p.id.toLowerCase().includes(q)
      );
    });
  }, [recentProjects, allProjectsSearch]);

  const onPickWorkspaceFile = () => workspaceFileRef.current?.click();

  const onWorkspaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void (async () => {
      try {
        const text = await file.text();
        const json = JSON.parse(text) as unknown;
        openProjectFromJson(json);
        toast.success("Workspace opened");
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

  const onPickOpenFile = () => openFileRef.current?.click();

  const onOpenFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void (async () => {
      if (file.name.toLowerCase().endsWith(".json")) {
        try {
          const text = await file.text();
          const json = JSON.parse(text) as unknown;
          if (parsePersistedWorkspace(json)) {
            openProjectFromJson(json);
            toast.success("Workspace opened");
            return;
          }
        } catch {
          /* fall through to single-document import */
        }
      }
      try {
        await openImportedFile(file);
        toast.success("Document opened");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not open that file.",
        );
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
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {isElectronApp() ? (
        <ElectronTitleBar title="Manuscript" />
      ) : (
        <div className="flex h-12 shrink-0 items-center justify-end border-b border-border bg-background px-3">
          <AppMenu />
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-row items-start">
        <aside
          className={cn(
            "sticky z-10 flex w-56 shrink-0 flex-col self-start border-r border-border bg-muted/25 px-3 py-6",
            isElectronApp()
              ? "top-9 h-[calc(100dvh-2.25rem)]"
              : "top-0 h-[calc(100dvh-3rem)]",
          )}
        >
        <nav className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => {
              setHomeTab("new");
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium transition-colors",
              homeTab === "new"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            <HomeIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
            Home
          </button>
          <button
            type="button"
            onClick={() => setHomeTab("all")}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-medium transition-colors",
              homeTab === "all"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
            )}
          >
            <Library className="h-3.5 w-3.5 shrink-0 opacity-70" />
            All projects
          </button>
          <button
            type="button"
            onClick={() => startNewProject()}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PenLine className="h-3.5 w-3.5 shrink-0" />
            Blank project
          </button>
          <button
            type="button"
            onClick={onPickWorkspaceFile}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FileUp className="h-3.5 w-3.5 shrink-0" />
            Open workspace…
          </button>
          <button
            type="button"
            onClick={onPickOpenFile}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            Open file…
          </button>
          {isElectronApp() ? (
            <button
              type="button"
              onClick={onOpenFolder}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              Open folder…
            </button>
          ) : null}
        </nav>
        <input
          ref={workspaceFileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={onWorkspaceFileChange}
        />
        <input
          ref={openFileRef}
          type="file"
          accept={FILE_PICKER_ACCEPT_ALL}
          className="hidden"
          onChange={onOpenFileChange}
        />
        <p className="mt-auto px-2 pt-8 text-[11px] leading-relaxed text-muted-foreground">
          {isElectronApp()
            ? `Desktop: projects can live in a folder as ${WORKSPACE_FILE_NAME}. The app also keeps a local index for recent items.`
            : "Workspaces live in this browser. Each project is saved separately."}
        </p>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {homeTab === "new" ? (
          <>
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
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-border bg-background px-6 py-8 sm:px-10">
              <div className="mx-auto w-full max-w-2xl text-center">
                <h1 className="font-serif text-xl font-medium tracking-tight sm:text-2xl">
                  All projects
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Search and open any workspace in your local index.
                </p>
                <div className="relative mx-auto mt-6 max-w-xl text-left">
                  <label htmlFor="all-projects-search" className="sr-only">
                    Search projects
                  </label>
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="all-projects-search"
                    value={allProjectsSearch}
                    onChange={(e) => setAllProjectsSearch(e.target.value)}
                    placeholder="Search by title, folder, or date…"
                    className="pl-9"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-10">
              <div className="mx-auto w-full max-w-2xl">
              {filteredAllProjects.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  {recentProjects.length === 0
                    ? "No projects yet. Create one from the Home tab."
                    : "No projects match your search."}
                </p>
              ) : (
                <ul className="flex w-full flex-col gap-1 pb-4">
                  {filteredAllProjects.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void openRecent(p.id)}
                        className="flex w-full flex-col items-start rounded-md border border-transparent px-3 py-3 text-left transition-colors hover:border-border hover:bg-muted/60"
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
              )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
