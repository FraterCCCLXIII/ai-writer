"use client";

import { useMemo, useState } from "react";
import {
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
import { readWorkspaceConfig, type WorkspaceIndexEntry } from "@/lib/workspace-fs";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";

type HomeTab = "new" | "all";

export function HomeScreen() {
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const startNewProject = useProjectStore((s) => s.startNewProject);
  const openWorkspace = useProjectStore((s) => s.openWorkspace);
  const openFolderProject = useProjectStore((s) => s.openFolderProject);

  const [homeTab, setHomeTab] = useState<HomeTab>("new");
  const [allProjectsSearch, setAllProjectsSearch] = useState("");

  const filteredAllProjects = useMemo(() => {
    const q = allProjectsSearch.trim().toLowerCase();
    if (!q) return recentProjects;
    return recentProjects.filter((p) => {
      const title = (p.title || "Untitled").toLowerCase();
      const path = p.folderPath?.toLowerCase() ?? "";
      const dateStr = new Date(p.updatedAt)
        .toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
        .toLowerCase();
      return title.includes(q) || path.includes(q) || dateStr.includes(q);
    });
  }, [recentProjects, allProjectsSearch]);

  const openRecent = async (entry: WorkspaceIndexEntry) => {
    const key = entry.folderPath ?? entry.id;
    const config = await readWorkspaceConfig(key);
    if (!config) {
      toast.error("That project could not be found.");
      return;
    }
    openWorkspace(key, config);
  };

  const onOpenFolder = () => {
    void (async () => {
      try {
        await openFolderProject();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not open that folder.",
        );
      }
    })();
  };

  const folderLabel = (path: string) => {
    const parts = path.replace(/[/\\]+$/, "").split(/[/\\]/);
    return parts[parts.length - 1] || path;
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
              onClick={() => setHomeTab("new")}
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
              New project
            </button>
            <button
              type="button"
              onClick={onOpenFolder}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <FolderOpen className="h-3.5 w-3.5 shrink-0" />
              Open folder…
            </button>
          </nav>
          <p className="mt-auto px-2 pt-8 text-[11px] leading-relaxed text-muted-foreground">
            Each project is a folder. Your files live as .md documents on disk. App config is stored in a hidden .aiwriter/ directory.
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
                      Get started
                    </span>
                  </div>
                  <h1 className="font-serif text-2xl font-medium tracking-tight sm:text-3xl">
                    Start a new project
                  </h1>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Choose or create a folder for your project. Each file in your workspace is a separate .md document — like a code editor, but for writing.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      className="gap-2"
                      onClick={() => startNewProject()}
                    >
                      <PenLine className="h-4 w-4" />
                      New project
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={onOpenFolder}
                    >
                      <FolderOpen className="h-4 w-4" />
                      Open folder…
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Pick an empty folder to start fresh, or open one with an existing project.
                  </p>
                </div>
              </div>

              <div className="shrink-0 border-t border-border bg-muted/15 px-6 py-5 sm:px-10">
                <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Recent projects
                </h2>
                {recentProjects.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    No projects yet. Create one above to get started.
                  </p>
                ) : (
                  <ScrollArea className="mt-3 h-[min(220px,32vh)] pr-3">
                    <ul className="flex flex-col gap-1">
                      {recentProjects.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => void openRecent(p)}
                            className="flex w-full max-w-2xl flex-col items-start rounded-md border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/60"
                          >
                            <span className="truncate text-sm font-medium">
                              {p.title || "Untitled"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {p.folderPath
                                ? `${folderLabel(p.folderPath)} · ${new Date(
                                    p.updatedAt,
                                  ).toLocaleString(undefined, {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })}`
                                : new Date(p.updatedAt).toLocaleString(
                                    undefined,
                                    { dateStyle: "medium", timeStyle: "short" },
                                  )}
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
                    Search and open any workspace.
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
                            onClick={() => void openRecent(p)}
                            className="flex w-full flex-col items-start rounded-md border border-transparent px-3 py-3 text-left transition-colors hover:border-border hover:bg-muted/60"
                          >
                            <span className="truncate text-sm font-medium">
                              {p.title || "Untitled"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {p.folderPath
                                ? `${folderLabel(p.folderPath)} · ${new Date(
                                    p.updatedAt,
                                  ).toLocaleString(undefined, {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })}`
                                : new Date(p.updatedAt).toLocaleString(
                                    undefined,
                                    { dateStyle: "medium", timeStyle: "short" },
                                  )}
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
