"use client";

import { useEffect } from "react";
import { loadWorkspaceIndex } from "@/lib/workspace-fs";
import { useProjectStore } from "@/store/project-store";

/**
 * Loads the workspace index for the home screen "recent projects" list.
 */
export function useWorkspaceBootstrap() {
  const setRecentProjectsFromIndex = useProjectStore(
    (s) => s.setRecentProjectsFromIndex,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const entries = await loadWorkspaceIndex();
        if (cancelled) return;
        setRecentProjectsFromIndex(entries);
      } catch {
        if (!cancelled) setRecentProjectsFromIndex([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setRecentProjectsFromIndex]);
}
