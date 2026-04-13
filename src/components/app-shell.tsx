"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Home, List, Maximize2, MessageSquare, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LeftSidebar } from "@/components/sidebar/left-sidebar";
import { ChatPanel } from "@/components/chat/chat-panel";
import { ManuscriptEditor } from "@/components/editor/manuscript-editor";
import { CommandPalette } from "@/components/command-palette";
import { ElectronTitleBar } from "@/components/electron-title-bar";
import { HomeScreen } from "@/components/home-screen";
import { DictationOverlay } from "@/components/dictation-overlay";
import { useWorkspaceBootstrap } from "@/hooks/use-workspace-bootstrap";
import { isElectronApp } from "@/lib/electron-bridge";
import { isEditableFile } from "@/lib/markdown-serialize";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";

export function AppShell() {
  useWorkspaceBootstrap();
  const [overlayView, setOverlayView] = useState(
    () => typeof window !== "undefined" && window.location.hash === "#overlay",
  );
  const workspaceScreen = useProjectStore((s) => s.workspaceScreen);
  const goHome = useProjectStore((s) => s.goHome);
  const config = useProjectStore((s) => s.config);
  const openFiles = useProjectStore((s) => s.openFiles);
  const focusMode = useProjectStore((s) => s.focusMode);
  const setFocusMode = useProjectStore((s) => s.setFocusMode);
  const leftSidebarOpen = useProjectStore((s) => s.leftSidebarOpen);
  const rightSidebarOpen = useProjectStore((s) => s.rightSidebarOpen);
  const toggleLeftSidebar = useProjectStore((s) => s.toggleLeftSidebar);
  const toggleRightSidebar = useProjectStore((s) => s.toggleRightSidebar);
  const setProjectTitle = useProjectStore((s) => s.setProjectTitle);

  const activeFilePath = config.activeFilePath;
  const activeFileEntry = activeFilePath ? openFiles.get(activeFilePath) : null;
  const canEdit = activeFilePath ? isEditableFile(activeFilePath) : false;

  const focusModeRef = useRef(focusMode);

  useEffect(() => {
    const syncOverlayView = () => {
      setOverlayView(window.location.hash === "#overlay");
    };
    syncOverlayView();
    window.addEventListener("hashchange", syncOverlayView);
    return () => window.removeEventListener("hashchange", syncOverlayView);
  }, []);

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

  if (overlayView) {
    return <DictationOverlay />;
  }

  if (workspaceScreen === "home") {
    return <HomeScreen />;
  }

  const electronUi = isElectronApp();

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      {electronUi && !focusMode ? (
        <ElectronTitleBar title={config.project.title} />
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
              value={config.project.title}
              onChange={(e) => setProjectTitle(e.target.value)}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t !== e.target.value) setProjectTitle(t || "Untitled");
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Untitled"
              className="w-full max-w-xl min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-border focus:border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {!electronUi && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                ⌘K
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Enter focus mode (fullscreen)"
              onClick={() => setFocusMode(true)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(leftSidebarOpen && "bg-muted")}
              title="Toggle file tree"
              onClick={() => toggleLeftSidebar()}
            >
              <List className="h-4 w-4" />
            </Button>
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
              value={config.project.title}
              onChange={(e) => setProjectTitle(e.target.value)}
              onBlur={(e) => {
                const t = e.target.value.trim();
                if (t !== e.target.value) setProjectTitle(t || "Untitled");
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
          {!focusMode && leftSidebarOpen && (
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
            {activeFileEntry && canEdit ? (
              <ManuscriptEditor
                key={activeFilePath}
                chapterId={activeFilePath!}
                initialContent={activeFileEntry.content}
                focusMode={focusMode}
              />
            ) : activeFilePath && !canEdit ? (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Preview not available for this file type.
                </p>
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Select or create a file to begin writing.
                </p>
              </div>
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
    </div>
  );
}
