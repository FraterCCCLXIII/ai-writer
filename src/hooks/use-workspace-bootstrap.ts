"use client";

import { useEffect } from "react";
import { loadProjectIndex } from "@/lib/persistence";
import { useProjectStore } from "@/store/project-store";

/**
 * Loads the project index from IndexedDB for the home screen “recent” list.
 */
export function useWorkspaceBootstrap() {
  const setRecentProjectsFromIndex = useProjectStore(
    (s) => s.setRecentProjectsFromIndex,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const entries = await loadProjectIndex();
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
