"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjectStore } from "@/store/project-store";
import {
  computeLiveNotes,
  getLiveNotesAnchorParams,
} from "@/lib/research/live-notes";

const DEBOUNCE_MS = 350;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export function LiveNotesPanel() {
  const chapters = useProjectStore((s) => s.chapters);
  const activeChapterId = useProjectStore((s) => s.activeChapterId);
  const researchDocuments = useProjectStore((s) => s.researchDocuments);
  const activeResearchId = useProjectStore((s) => s.activeResearchId);
  const editorContext = useProjectStore((s) => s.editorContext);

  const anchorParams = useMemo(
    () =>
      getLiveNotesAnchorParams({
        chapters,
        activeChapterId,
        researchDocuments,
        activeResearchId,
        editorContext,
      }),
    [
      chapters,
      activeChapterId,
      researchDocuments,
      activeResearchId,
      editorContext,
    ],
  );

  const anchorDebounced = useDebouncedValue(anchorParams.anchor, DEBOUNCE_MS);

  const hits = useMemo(() => {
    if (!anchorDebounced.trim()) return [];
    return computeLiveNotes(anchorDebounced, researchDocuments, {
      excludeResearchIds: anchorParams.excludeResearchIds,
      topK: 8,
    });
  }, [
    anchorDebounced,
    researchDocuments,
    anchorParams.excludeResearchIds,
  ]);

  if (researchDocuments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Add research notes in the left sidebar to see contextual matches here.
      </p>
    );
  }

  if (!anchorDebounced.trim()) {
    return (
      <p className="text-sm text-muted-foreground">
        Start writing or select text in the editor to match research notes.
      </p>
    );
  }

  if (hits.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing matches this passage yet—try selecting a phrase or a keyword
        from your research.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {hits.map((h, i) => (
        <li
          key={`${h.documentId}-${i}-${h.excerpt.slice(0, 48)}`}
          className="rounded-md border border-border bg-muted/20 px-3 py-2"
        >
          <p className="text-xs font-medium text-muted-foreground">
            {h.title}
            <span className="ml-2 tabular-nums text-[10px] opacity-70">
              {Math.round(h.score * 100)}% match
            </span>
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {h.excerpt.length > 400 ? `${h.excerpt.slice(0, 400)}…` : h.excerpt}
          </p>
        </li>
      ))}
    </ul>
  );
}
