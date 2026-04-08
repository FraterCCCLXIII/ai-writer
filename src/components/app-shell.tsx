"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Home, List, Maximize2, MessageSquare, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeftSidebar } from "@/components/sidebar/left-sidebar";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ManuscriptEditor } from "@/components/editor/manuscript-editor";
import { CommandPalette } from "@/components/command-palette";
import { GenerateChaptersDialog } from "@/components/generate-chapters-dialog";
import { DocumentExportMenu } from "@/components/document-export/document-export-menu";
import { AppMenu } from "@/components/app-menu";
import { ElectronTitleBar } from "@/components/electron-title-bar";
import { HomeScreen } from "@/components/home-screen";
import { useWorkspaceBootstrap } from "@/hooks/use-workspace-bootstrap";
import { isElectronApp } from "@/lib/electron-bridge";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";

export function AppShell() {
  useWorkspaceBootstrap();
  const workspaceScreen = useProjectStore((s) => s.workspaceScreen);
  const goHome = useProjectStore((s) => s.goHome);
  const project = useProjectStore((s) => s.project);
  const activeChapterId = useProjectStore((s) => s.activeChapterId);
  const chapters = useProjectStore((s) => s.chapters);
  const activeResearchId = useProjectStore((s) => s.activeResearchId);
  const researchDocuments = useProjectStore((s) => s.researchDocuments);
  const focusMode = useProjectStore((s) => s.focusMode);
  const setFocusMode = useProjectStore((s) => s.setFocusMode);
  const leftSidebarOpen = useProjectStore((s) => s.leftSidebarOpen);
  const rightSidebarOpen = useProjectStore((s) => s.rightSidebarOpen);
  const toggleLeftSidebar = useProjectStore((s) => s.toggleLeftSidebar);
  const toggleRightSidebar = useProjectStore((s) => s.toggleRightSidebar);
  const setProjectField = useProjectStore((s) => s.setProjectField);

  const isSingleDocument = project.editorLayout === "singleDocument";
  const activeChapter = chapters.find((c) => c.id === activeChapterId);
  const activeResearch = researchDocuments.find((d) => d.id === activeResearchId);
  const focusModeRef = useRef(focusMode);

  useEffect(() => {
    focusModeRef.current = focusMode;
  }, [focusMode]);

  useEffect(() => {
    if (!focusMode) {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      return;
    }
    const el = document.documentElement;
    const req = el.requestFullscreen?.();
    if (req) {
      void req
        .then(() => {
          if (!focusModeRef.current && document.fullscreenElement) {
            void document.exitFullscreen().catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, [focusMode]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setFocusMode(false);
      }
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [setFocusMode]);

  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode, setFocusMode]);

  const [generateChaptersOpen, setGenerateChaptersOpen] = useState(false);
  const [generateChaptersRange, setGenerateChaptersRange] = useState<
    { start: number; end: number } | undefined
  >();

  useEffect(() => {
    if (workspaceScreen !== "editor") return;
    const h = (e: Event) => {
      const ce = e as CustomEvent<{ start?: number; end?: number }>;
      const d = ce.detail;
      if (d?.start != null && d?.end != null) {
        setGenerateChaptersRange({ start: d.start, end: d.end });
      } else {
        setGenerateChaptersRange(undefined);
      }
      setGenerateChaptersOpen(true);
    };
    window.addEventListener("ai-writer:generate-chapters", h);
    return () =>
      window.removeEventListener("ai-writer:generate-chapters", h);
  }, [workspaceScreen]);

  if (workspaceScreen === "home") {
    return <HomeScreen />;
  }

  const electronUi = isElectronApp();

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      {electronUi && !focusMode ? (
        <ElectronTitleBar title={project.title} />
      ) : null}
      {!focusMode && (
        <header
          className={cn(
            "sticky z-40 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3",
            electronUi ? "top-9" : "top-0",
          )}
        >
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Home"
            onClick={() => goHome()}
          >
            <Home className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <label htmlFor="project-title" className="sr-only">
              Project name
            </label>
            <input
              id="project-title"
              name="projectTitle"
              type="text"
              value={project.title}
              onChange={(e) => setProjectField({ title: e.target.value })}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t !== e.target.value) setProjectField({ title: t || "Untitled" });
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Untitled"
              className="w-full max-w-xl min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border focus:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isSingleDocument ? <DocumentExportMenu /> : null}
            {!electronUi ? <AppMenu /> : null}
            <span className="hidden text-xs text-muted-foreground sm:inline">
              ⌘K
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Enter focus mode (fullscreen)"
              onClick={() => setFocusMode(true)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            {!isSingleDocument ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(leftSidebarOpen && "bg-muted")}
                title="Toggle manuscript"
                onClick={() => toggleLeftSidebar()}
              >
                <List className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(rightSidebarOpen && "bg-muted")}
              title="Toggle assistant"
              onClick={() => toggleRightSidebar()}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
        </header>
      )}

      {focusMode && (
        <div className="fixed left-3 right-3 top-3 z-[100] flex flex-wrap items-center justify-between gap-2 sm:left-auto sm:max-w-xl">
          <div className="min-w-0 flex-1 sm:flex-initial">
            <label htmlFor="project-title-focus" className="sr-only">
              Project name
            </label>
            <input
              id="project-title-focus"
              name="projectTitle"
              type="text"
              value={project.title}
              onChange={(e) => setProjectField({ title: e.target.value })}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t !== e.target.value) setProjectField({ title: t || "Untitled" });
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Untitled"
              className="w-full min-w-[12rem] rounded-md border border-border bg-background/95 px-3 py-2 text-sm font-medium text-foreground shadow-md outline-none backdrop-blur placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring sm:min-w-[18rem]"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 gap-2 border border-border bg-background/95 px-3 shadow-md backdrop-blur"
            title="Exit focus mode"
            onClick={() => setFocusMode(false)}
          >
            <Minimize2 className="h-4 w-4" />
            <span className="text-xs font-medium">Exit</span>
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <AnimatePresence initial={false}>
          {!focusMode && leftSidebarOpen && !isSingleDocument && (
            <motion.aside
              key="left"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="z-30 flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-border bg-background"
            >
              <div className="flex h-full min-h-0 w-[280px] flex-col">
                <LeftSidebar />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        <main
          id="manuscript-main-scroll"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
        >
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col",
              focusMode ? "min-h-dvh" : "min-h-full",
            )}
          >
            {activeResearchId && activeResearch ? (
              <ManuscriptEditor
                key={`research-${activeResearch.id}`}
                chapterId={activeResearch.id}
                initialContent={activeResearch.content}
                focusMode={focusMode}
                surface="research"
              />
            ) : activeChapter ? (
              <ManuscriptEditor
                key={activeChapter.id}
                chapterId={activeChapter.id}
                initialContent={activeChapter.content}
                focusMode={focusMode}
              />
            ) : (
              <p className="p-8 text-sm text-muted-foreground">
                Select or create a chapter to begin.
              </p>
            )}
          </div>
        </main>

        <AnimatePresence initial={false}>
          {!focusMode && rightSidebarOpen && (
            <motion.aside
              key="right"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 360, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="z-30 flex min-h-0 shrink-0 flex-col overflow-hidden bg-background"
            >
              <div className="flex h-full min-h-0 w-[360px] flex-col">
                <ChatPanel />
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      <CommandPalette />
      <GenerateChaptersDialog
        open={generateChaptersOpen}
        onOpenChange={(o) => {
          setGenerateChaptersOpen(o);
          if (!o) setGenerateChaptersRange(undefined);
        }}
        initialRange={generateChaptersRange}
      />
    </div>
  );
}
