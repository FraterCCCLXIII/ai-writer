"use client";

import { useEffect } from "react";
import { loadWorkspace } from "@/lib/persistence";
import { useProjectStore } from "@/store/project-store";

export function useWorkspaceBootstrap() {
  const importWorkspace = useProjectStore((s) => s.importWorkspace);
  const setHydrated = useProjectStore((s) => s.setHydrated);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await loadWorkspace();
      if (cancelled) return;
      if (data) {
        importWorkspace({
          project: data.project,
          chapters: data.chapters,
          activeChapterId: data.activeChapterId,
          openTabs: data.openTabs,
          chatMessages: data.chatMessages,
        });
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [importWorkspace, setHydrated]);
}
